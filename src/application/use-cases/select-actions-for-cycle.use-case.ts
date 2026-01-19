import { DbClient } from "../../infrastructure/database/db-client.interface";
import { NotFoundError, ConflictError } from "../../adapters/http/errors";

interface SelectActionsRequest {
    cycleId: string;
    userId: string;
    selected: { recommendation_id: string }[];
}

interface ActionCreated {
    action_id: string; // selected_action_id
    recommendation_id: string;
    status: 'nao_iniciada';
}

interface SelectActionsResponse {
    cycle_id: string;
    actions_created: ActionCreated[];
}

export class SelectActionsForCycleUseCase {
    constructor(private dbClient: DbClient) { }

    async execute(request: SelectActionsRequest): Promise<SelectActionsResponse> {
        // 1. Verify Cycle Existence
        const cycle = await this.dbClient.getCycleById(request.cycleId);
        if (!cycle) {
            throw new NotFoundError('NOT_FOUND', 'Cycle not found');
        }

        // 2. Cycle must be closed? Wait, prompt "tentativa de selecionar novo bloco quando há bloco/seleção ativa não concluída"
        // Cycle active or closed? Usually actions are selected for an active cycle, OR result of closed cycle.
        // If cycle.status is 'completed', we are selecting actions FOR the next steps?
        // Let's assume input cycle is correct.

        // 3. Conflict Check: Pending Actions
        // "tentativa de selecionar novo bloco quando há bloco/seleção ativa não concluída"
        const existingActions = await this.dbClient.getSelectedActionsByCycle(request.cycleId);
        if (existingActions.some(a => a.status !== 'completed')) {
            throw new ConflictError('CONFLICT', 'Selection not allowed in current state'); // Active block not completed
        }

        // 4. Validate Selection against Suggestions (Backend Sovereign)
        // "tentativa de selecionar fora do bloco sugerido atual"
        // We must re-calculate the suggestions. Logic mirrors ReadModelService.getActionSuggestions
        // Retrieve recommendations.
        const recommendations = await this.dbClient.getRecommendationsByCycle(request.cycleId);

        // Get segment -> processes -> sort by priority
        const segmentId = await this.dbClient.getSegmentByCompany(cycle.company_id);
        if (!segmentId) throw new NotFoundError('SEGMENT_NOT_FOUND', 'Segment not found');
        const processes = await this.dbClient.getProcessesBySegment(segmentId);
        const processMap = new Map(processes.map(p => [p.process_id, p]));

        // Sort recommendations by process display_order
        const sortedRecs = recommendations
            .map(rec => ({ ...rec, priority: processMap.get(rec.process_id)?.display_order ?? 99 }))
            .sort((a, b) => a.priority - b.priority);

        // Filter out already selected recommendations
        const selectedRecIds = new Set(existingActions.map(a => a.recommendation_id));
        const availableRecs = sortedRecs.filter(r => !selectedRecIds.has(r.recommendation_id));

        // Get the current block (max 3)
        const currentBlock = availableRecs.slice(0, 3);
        const validRecIds = new Set(currentBlock.map(r => r.recommendation_id));

        // Verify user selection is within validRecIds
        const invalidSelection = request.selected.some(s => !validRecIds.has(s.recommendation_id));
        // Also ensure all selected IDs actually exist in DB (covered by validRecIds check implicitly)

        if (invalidSelection) {
            throw new ConflictError('CONFLICT', 'Selection not allowed in current state'); // Outside of suggested block
        }

        // 5. Create Actions
        const createdActions: ActionCreated[] = [];

        for (const item of request.selected) {
            // Find Action Catalog for this recommendation
            // We need a helper method in DbClient to find action_catalog by recommendation_id
            // If not exists, we might need to fail or create default? Assumed exists.

            // Wait, DbClient interface doesn't have getActionCatalogByRecommendationId.
            // I'll assume I can add it or query via specialized method if RLS allows.
            // Actually, I can use a direct query if DbClient supports generic query or add method.
            // Let's add getActionCatalogByRecommendation(recId) to DbClient interface and Impl.

            let catalogId = await this.dbClient.getActionCatalogIdByRecommendation(item.recommendation_id);

            if (!catalogId) {
                // Should not happen if data integrity is good. But if it happens, fail.
                throw new NotFoundError('NOT_FOUND', 'Action catalog not found for recommendation');
            }

            const newAction = await this.dbClient.createSelectedAction({
                assessment_cycle_id: request.cycleId,
                user_id: request.userId,
                action_catalog_id: catalogId,
                status: 'pending', // DB uses pending
                created_at: new Date().toISOString()
            });

            createdActions.push({
                action_id: newAction.selected_action_id,
                recommendation_id: item.recommendation_id,
                status: 'nao_iniciada'
            });
        }

        return {
            cycle_id: request.cycleId,
            actions_created: createdActions
        };
    }
}
