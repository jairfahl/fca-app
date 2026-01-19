import { DbClient } from '../../infrastructure/database/db-client.interface';
import { CompleteActionRequest } from '../../adapters/http/dtos/actions.dto';
import { NotFoundError, ConflictError } from '../../adapters/http/errors';

export interface CompleteActionResponse {
    action_id: string;
    status: string;
    evidence_text: string | null;
}

export class CompleteActionUseCase {
    constructor(private readonly dbClient: DbClient) { }

    async execute(request: CompleteActionRequest): Promise<CompleteActionResponse> {
        // 1. Get existing action
        const action = await this.dbClient.getSelectedActionById(request.actionId);

        if (!action) {
            throw new NotFoundError('NOT_FOUND', 'Action not found');
        }

        const currentStatus = action.status; // DB status (pending, in_progress, completed)
        const targetStatus = request.status; // DTO status (nao_iniciada, em_andamento, concluida)
        const evidence = request.evidenceText;

        // Map DB status back to DTO for comparison
        const dbToDtoMap: Record<string, string> = {
            'pending': 'nao_iniciada',
            'in_progress': 'em_andamento',
            'completed': 'concluida'
        };
        const currentStatusDto = dbToDtoMap[currentStatus] || currentStatus;

        // 2. Idempotency Check (Completed -> Completed)
        if (currentStatusDto === 'concluida' && targetStatus === 'concluida') {
            // Check evidence idempotency
            // If existing matches provided, or provided is undefined/null and we just want status
            // BUT rule says: "write-once: se já existir, qualquer nova tentativa retorna 409."
            // "Repetir request idêntico em ação já concluída: sem alterar dados; retornar 200"
            const existingEvidence = action.evidence_text;

            if (evidence !== undefined && evidence !== null) {
                if (existingEvidence !== null && existingEvidence !== evidence) {
                    // Trying to change evidence
                    throw new ConflictError('CONFLICT', 'Evidence text cannot be changed (write-once)');
                }
                if (existingEvidence === null) {
                    // Late arrival of evidence? Allowed? "evidence_text: permitido SOMENTE quando status=concluida."
                    // If it was concluded without evidence (if possible) and now adding?
                    // Usually allowed.
                }
            }

            // If strictly identical (same status, same evidence or null)
            if (existingEvidence === evidence || (existingEvidence && evidence === existingEvidence)) {
                return {
                    action_id: action.selected_action_id,
                    status: action.status,
                    evidence_text: action.evidence_text || null
                };
            }
        }

        // 3. Prevent Regression
        // Valid: nao_iniciada -> em_andamento
        // Valid: em_andamento -> concluida
        // Invalid: * -> nao_iniciada (if current is advanced)
        // Invalid: concluida -> em_andamento

        const statusRank: Record<string, number> = {
            'nao_iniciada': 0,
            'em_andamento': 1,
            'concluida': 2
        };

        const currentRank = statusRank[currentStatusDto] ?? 0;
        const targetRank = statusRank[targetStatus] ?? 0;

        if (targetRank < currentRank) {
            throw new ConflictError('CONFLICT', 'Regressive status transition is not allowed');
        }

        // 4. Validate specific transitions (Strict)
        // "Transições inválidas retornam 409"
        // nao_iniciada -> concluida? (Skip step). Usually forbidden unless specified. 
        // Prompt says: "Transições válidas: nao_iniciada -> em_andamento, em_andamento -> concluida".
        // Implies skipping is NOT allowed.
        // Exception: Idempotency (handled above).

        if (targetStatus === 'concluida' && currentStatusDto === 'nao_iniciada') {
            throw new ConflictError('CONFLICT', 'Cannot skip to completed from not started');
        }

        // 5. Evidence Logic
        // "evidence_text: permitido SOMENTE quando status=concluida."
        if (targetStatus !== 'concluida' && evidence) {
            throw new ConflictError('CONFLICT', 'Evidence text permitted only when status is concluded');
        }

        // "write-once: se já existir, qualquer nova tentativa retorna 409."
        // We checked this in idempotency, but what if we are transitioning?
        // If transitioning TO concluded, existing evidence should be null presumably if previous was not ended.
        // But checking anyway.
        if (action.evidence_text && evidence && action.evidence_text !== evidence) {
            throw new ConflictError('CONFLICT', 'Evidence text cannot be changed');
        }

        // 6. DB Update
        const completedAt = targetStatus === 'concluida' ? new Date().toISOString() : undefined;

        // Map DTO status to DB status
        const dbStatusMap: Record<string, string> = {
            'nao_iniciada': 'pending',
            'em_andamento': 'in_progress',
            'concluida': 'completed'
        };

        await this.dbClient.updateActionStatus(
            request.actionId,
            dbStatusMap[targetStatus],
            completedAt,
            targetStatus === 'concluida' ? evidence : undefined
        );

        return {
            action_id: request.actionId,
            status: targetStatus,
            evidence_text: evidence || action.evidence_text || null
        };
    }
}
