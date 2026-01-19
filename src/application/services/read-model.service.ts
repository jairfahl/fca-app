import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'
import { NotFoundError, ConflictError } from '../../adapters/http/errors'

export class ReadModelService {
    constructor(private dbClient: SupabaseDbClient) { }

    async getCompanyDetails(companyId: string) {
        return await this.dbClient.getCompanyById(companyId)
    }

    async getQuestionsForCycle(cycleId: string) {
        const cycle = await this.dbClient.getCycleById(cycleId)
        if (!cycle) {
            throw new Error('Cycle not found')
        }

        const company = await this.dbClient.getCompanyById(cycle.company_id)
        if (!company) {
            throw new Error('Company not found')
        }

        const processes = await this.dbClient.getProcessesBySegment(company.segment_id)

        const allQuestions = []
        for (const process of processes) {
            const questions = await this.dbClient.getQuestionsByProcess(process.process_id)
            allQuestions.push(...questions)
        }

        return allQuestions
    }

    async getResultsForCycle(cycleId: string) {
        const scores = await this.dbClient.getScoresByCycle(cycleId)
        const recommendations = await this.dbClient.getRecommendationsByCycle(cycleId)

        return {
            scores,
            recommendations
        }
    }

    async getActionSuggestions(companyId: string, cycleId?: string) {
        let cycle
        if (cycleId) {
            cycle = await this.dbClient.getCycleById(cycleId)
            if (!cycle) {
                throw new NotFoundError('NOT_FOUND', 'Cycle not found')
            }
        } else {
            cycle = await this.dbClient.getActiveCycle(companyId)
            // If checking for active cycle (in_progress) and none exists, we assume no suggestions available yet?
            // "não existe ciclo ativo quando cycle_id não informado" -> 404
            if (!cycle) {
                throw new NotFoundError('NOT_FOUND', 'Cycle not found')
            }
        }

        // Check for active block (Conflict)
        // Active block = exists selected_action with status != 'completed'
        const selectedActions = await this.dbClient.getSelectedActionsByCycle(cycle.assessment_cycle_id)
        const hasPending = selectedActions.some((a: any) => a.status !== 'completed')

        if (hasPending) {
            throw new ConflictError('CONFLICT', 'Active block not completed')
        }

        // Generate Block
        const recommendations = await this.dbClient.getRecommendationsByCycle(cycle.assessment_cycle_id)
        // Filter out already selected
        const selectedRecIds = new Set(selectedActions.map((a: any) => a.recommendation_id))
        const candidates = recommendations.filter((r: any) => !selectedRecIds.has(r.recommendation_id))

        // Get Areas for mapping
        const areas = await this.dbClient.getAreas()
        const areaMap = new Map(areas.map(a => [a.area_id, a.name]))

        // Need process info for priority/area
        // We can optimize by fetching process scores again or just relying on what we have.
        // getRecommendationsByCycle in SupabaseDbClient creates recs.
        // But we need process display_order for sorting priority.
        // We can fetch processes by segment.
        const segmentId = await this.dbClient.getSegmentByCompany(cycle.company_id)
        let processes: any[] = []
        if (segmentId) {
            processes = await this.dbClient.getProcessesBySegment(segmentId)
        }
        const processMap = new Map(processes.map(p => [p.process_id, p]))

        // Sort candidates by priority (process.display_order)
        candidates.sort((a: any, b: any) => {
            const pa = processMap.get(a.process_id)
            const pb = processMap.get(b.process_id)
            const orderA = pa ? pa.display_order : 99
            const orderB = pb ? pb.display_order : 99
            return orderA - orderB
        })

        // Determine Block Index
        // Index based on COMPLETED blocks?
        // block size max 3. 
        // Logic: filtered out N selected.
        // Current batch is next 3.
        // Index = floor(selectedActions.length / 3) + 1 (1-based)
        const blockIndex = Math.floor(selectedActions.length / 3) + 1

        const blockSize = Math.min(candidates.length, 3)
        const suggestions = candidates.slice(0, blockSize).map((rec: any) => {
            const process = processMap.get(rec.process_id)
            const areaId = process ? process.area_id : null
            return {
                recommendation_id: rec.recommendation_id,
                title: rec.recommendation_text,
                area: areaId ? areaMap.get(areaId) || 'Unknown' : 'Unknown',
                priority: process ? process.display_order : 99
            }
        })

        // is_last if we exhausted candidates or remaining < what?
        // "Último bloco pode ser 1 ou 2".
        // If we took 3, and remaining was 3, is it last? Yes.
        // If candidates.length <= 3, it is last.
        const isLast = candidates.length <= 3

        return {
            cycle_id: cycle.assessment_cycle_id,
            block: {
                index: blockIndex,
                size: suggestions.length, // use actual size
                is_last: isLast
            },
            suggestions
        }
    }

    async getDashboard(cycleId: string) {
        const cycle = await this.dbClient.getCycleById(cycleId)
        const selectedActions = await this.dbClient.getSelectedActionsByCycle(cycleId)

        return {
            cycle,
            selected_actions: selectedActions
        }
    }

    async getDiagnosticStatus(companyId: string, cycleId?: string) {
        let cycle

        if (cycleId) {
            cycle = await this.dbClient.getCycleById(cycleId)
            if (!cycle) {
                throw new NotFoundError('CYCLE_NOT_FOUND', 'Company or cycle not found')
            }
        } else {
            cycle = await this.dbClient.getActiveCycle(companyId)
            if (!cycle) {
                // If checking for active cycle and none exists, we also check if company exists to be precise?
                // But Prompt says "When company associated to user DOES NOT EXIST OR When ...".
                // We'll rely on the fact that if we got here, user exists. We need to check if company exists?
                // The middleware gets companyId from user. If companyId is null?
                // RequestContextService throws if company not found for user. So companyId is valid.
                // So if no active cycle -> 404.
                throw new NotFoundError('NO_ACTIVE_CYCLE', 'Company or cycle not found')
            }
        }

        // Check if cycle is closed
        // The prompt says: "Quando o ciclo (ativo ou informado) estiver com status = closed"
        // CycleRecord status is 'in_progress' | 'completed'. 'completed' means closed.
        if (cycle.status === 'completed') {
            throw new ConflictError('CYCLE_CLOSED', 'Cycle is closed')
        }

        // Calculate progress
        const segmentId = await this.dbClient.getSegmentByCompany(cycle.company_id)
        if (!segmentId) {
            throw new NotFoundError('SEGMENT_NOT_FOUND', 'Company segment not found')
        }

        const processIds = await this.dbClient.getProcessIdsBySegment(segmentId)
        const totalQuestions = await this.dbClient.countQuestionsByProcessIds(processIds)
        const answeredQuestions = await this.dbClient.countResponsesByCycle(cycle.assessment_cycle_id)

        let status: 'not_started' | 'in_progress' | 'completed' = 'in_progress'
        if (answeredQuestions === 0) {
            status = 'not_started'
        } else if (answeredQuestions === totalQuestions && totalQuestions > 0) {
            status = 'completed'
        }

        return {
            cycle_id: cycle.assessment_cycle_id,
            assessment: {
                status,
                progress: {
                    answered: answeredQuestions,
                    total: totalQuestions
                }
            }
        }
    }

    async getResultsStatus(companyId: string, cycleId?: string) {
        let cycle
        if (cycleId) {
            cycle = await this.dbClient.getCycleById(cycleId)
            if (!cycle) {
                throw new NotFoundError('NOT_FOUND', 'Cycle not found')
            }
        } else {
            cycle = await this.dbClient.getActiveCycle(companyId)
            if (!cycle) {
                throw new NotFoundError('NOT_FOUND', 'Cycle not found')
            }
        }

        if (cycle.status !== 'completed') {
            throw new ConflictError('CONFLICT', 'Diagnostic not completed')
        }

        // Fetch required data
        const scores = await this.dbClient.getScoresByCycle(cycle.assessment_cycle_id)
        const recommendations = await this.dbClient.getRecommendationsByCycle(cycle.assessment_cycle_id)
        const selectedActions = await this.dbClient.getSelectedActionsByCycle(cycle.assessment_cycle_id)
        const areas = await this.dbClient.getAreas()

        // We need process info to map to areas
        // Since we don't have getProcessById efficiently for all, and getProcessesBySegment requires segmentId
        // We can get segmentId from company
        const segmentId = await this.dbClient.getSegmentByCompany(cycle.company_id)
        if (!segmentId) throw new Error('Segment not found')

        const processes = await this.dbClient.getProcessesBySegment(segmentId)

        // Maps
        const areaMap = new Map(areas.map(a => [a.area_id, a.name]))
        const processAreaMap = new Map(processes.map(p => [p.process_id, p.area_id]))
        const processMap = new Map(processes.map(p => [p.process_id, p]))

        // Calculate Scores
        // Overall
        const overallScore = scores.length > 0
            ? scores.reduce((acc, curr) => acc + Number(curr.score), 0) / scores.length
            : 0

        // By Area
        const areaScoresMap = new Map<string, { total: number, count: number }>()

        for (const score of scores) {
            const areaId = processAreaMap.get(score.process_id)
            if (areaId) {
                const current = areaScoresMap.get(areaId) || { total: 0, count: 0 }
                areaScoresMap.set(areaId, {
                    total: current.total + Number(score.score),
                    count: current.count + 1
                })
            }
        }

        const by_area = Array.from(areaScoresMap.entries()).map(([areaId, data]) => ({
            area: areaMap.get(areaId) || 'Unknown',
            score: data.total / data.count
        }))

        // Map Recommendations
        const mappedRecommendations = recommendations.map(rec => {
            const areaId = processAreaMap.get(rec.process_id)
            const process = processMap.get(rec.process_id)
            return {
                id: rec.recommendation_id,
                title: rec.recommendation_text, // or cut?
                area: areaId ? areaMap.get(areaId) || 'Unknown' : 'Unknown',
                priority: process ? process.display_order : 99
            }
        })

        // Actions Pool
        // "Total" = selected actions count? Or total possible?
        // Usually "Actions Pool" in dashboard context means the SELECTED actions to work on.
        const totalActions = selectedActions.length
        const completedActions = selectedActions.filter((a: any) => a.status === 'completed').length
        const remainingActions = totalActions - completedActions

        return {
            cycle_id: cycle.assessment_cycle_id,
            scores: {
                overall: overallScore,
                by_area
            },
            recommendations: mappedRecommendations,
            actions_pool: {
                total: totalActions,
                completed: completedActions,
                remaining: remainingActions
            }
        }
    }
    async getDashboardData(companyId: string, cycleId?: string) {
        let cycle
        if (cycleId) {
            cycle = await this.dbClient.getCycleById(cycleId)
            // If requested cycle explicitly not found, technically we could 404, 
            // but the prompt says "Cases 1 (No Active) -> 200 Empty" applies when "cycle_id NOT provided AND there is no active cycle".
            // If cycle_id PROVIDED and not found, Standard 404 is appropriate or we fallback to empty?
            // "If cycle_id provided, use that cycle..."
            // We will adhere to standard logic: if specific ID requested and missing -> 404.
            if (!cycle) {
                throw new NotFoundError('NOT_FOUND', 'Cycle not found')
            }
        } else {
            cycle = await this.dbClient.getActiveCycle(companyId)
        }

        // CASE 1: No active cycle (and no specific cycle requested)
        if (!cycle) {
            return {
                cycle_id: null,
                assessment_status: null,
                actions: {
                    active: [],
                    completed_count: 0,
                    total_recommendations: 0 // Logic says total reccomendations? Prompt says "total_recommendations". Zero.
                },
                next: {
                    can_open_next_block: false,
                    reason: "NO_ACTIVE_CYCLE"
                }
            }
        }

        // CASE 2: Diagnostic not completed
        // Cycle status 'in_progress' implies diagnostic might not be finished OR actions in progress.
        // But "Diagnostic not completed" specifically refers to the Assessment Phase.
        // We check if cycle.status == 'completed' ?
        // Actually, in this domain, 'cycle.status' = 'in_progress' until closed?
        // Let's check getResultsStatus logic: it throws specific error if cycle.status !== 'completed'.
        // Wait, "Diagnostic Completed" usually transitions the cycle state or is a separate flag?
        // Looking at `getDiagnosticStatus`:
        // status = 'completed' if answered == total.
        // But the cycle entity itself has a status.
        // In `getResultsStatus`, we check `if (cycle.status !== 'completed')`.
        // So we assume `cycle.status` MUST be 'completed' for the dashboard to show the full view.
        // Prompt says: "user has active cycle but diagnostic not completed — MUST block" -> 409

        // HOWEVER, `cycle.status` == 'completed' usually implies the WHOLE cycle is done? 
        // Or just the diagnostic phase?
        // In `CloseCycleUseCase`, it sets status to 'completed'.
        // But `SubmitDiagnosticUseCase` with `finalize=true` might set something?
        // Let's look at `getResultsStatus` implementation again (line 217):
        // `if (cycle.status !== 'completed') { throw Conflict }`
        // This implies `cycle.status` tracks the diagnostic completion in this context OR the cycle lifecycle.
        // Checking `SubmitDiagnosticUseCase` (not visible but inferred from previous prompts): 
        // usually `finalize: true` closes the *assessment* phase.
        // If `cycle.status` remains `in_progress` during Action Selection, then `getResultsStatus` throwing 409 might be invalid for Action Selection phase?
        // BUT, let's stick to the prompt's `CASE 2` & `CASE 3`.
        // "ACTIVE CYCLE + DIAGNOSTIC COMPLETED" -> success
        // If `cycle.status` is used as the gate, we use it. 
        // Let's assume `cycle.status` === 'completed' means Diagnostic is done. 
        // (Wait, if `cycle.status` === 'completed', does it mean ACTIONS are done too? 
        // Usually "Cycle Closed" = Done. 
        // Perhaps `cycle.status` 'in_progress' covers both Diagnostic and Actions?
        // Let's check `getDiagnosticStatus` (line 188): it calculates status based on questions.
        // It DOES NOT rely on `cycle.status`.

        // Let's rely on `getDiagnosticStatus` logic to determine if assessment is completed.
        // Re-read `getDiagnosticStatus`:
        // status = 'completed' if answered == total.
        // So we should calculate it.

        const segmentId = await this.dbClient.getSegmentByCompany(companyId)
        if (!segmentId) throw new Error('Segment not found') // Should not happen for valid cycle

        const processIds = await this.dbClient.getProcessIdsBySegment(segmentId)
        const totalQuestions = await this.dbClient.countQuestionsByProcessIds(processIds)
        const answeredQuestions = await this.dbClient.countResponsesByCycle(cycle.assessment_cycle_id)

        const isDiagnosticCompleted = totalQuestions > 0 && answeredQuestions === totalQuestions

        // If diagnostic NOT completed:
        if (!isDiagnosticCompleted) {
            throw new ConflictError('ASSESSMENT_NOT_COMPLETED', 'Diagnostic must be completed before dashboard access')
        }

        // CASE 3: Active Cycle + Diagnostic Completed

        const selectedActions = await this.dbClient.getSelectedActionsByCycle(cycle.assessment_cycle_id)

        // actions.active: list of actions (uuid, title, status)
        const activeActions = selectedActions.map((a: any) => ({
            action_id: a.selected_action_id,
            title: a.recommendation_text || 'Ação',
            status: a.status
        }))

        // actions.completed_count
        const completedCount = selectedActions.filter((a: any) => a.status === 'completed' || a.status === 'concluida').length

        // actions.total_recommendations
        // Is this "Total Recommendations available" or "Total Actions Selected"?
        // Prompt says "total_recommendations". likely total available in pool? 
        // Or "Total Recommendations" generated from results?
        // `getResultsStatus` has `actions_pool`.
        // Let's assume it means "Total Actions Selected" based on `completed_count` pairing?
        // OR it means count of RECOMMENDATIONS generated.
        // Let's look at `actions` structure: { active, completed_count, total_recommendations }
        // If `active` contains ALL selected actions (including completed?), then `completed_count` is subset.
        // But `active` usually implies "In Progress" or "Todo"?
        // "active": [ { status: "nao_iniciada|em_andamento|concluida" } ]
        // So "active" list contains even concluded ones? Yes, based on the status enum allowed.
        // So `active` = `selectedActions`.

        // "total_recommendations":
        // Could be the total number of recommendations generated for the cycle.
        const recommendations = await this.dbClient.getRecommendationsByCycle(cycle.assessment_cycle_id)
        const totalRecommendations = recommendations.length

        // Next Block Logic
        // "can_open_next_block"
        // Condition: Current block completed?
        // Block logic from `getActionSuggestions`:
        // "Active block = exists selected_action with status != 'completed'"
        // If hasPending -> can_open_next_block = false, reason = "PENDING_ACTIONS"
        // If no pending -> can_open_next_block = true (if more available?), reason = null

        const hasPending = selectedActions.some((a: any) => a.status !== 'completed' && a.status !== 'concluida')

        // Check if there are more recommendations to select?
        // If all recommendations selected, can we open next? No.
        const selectedRecIds = new Set(selectedActions.map((a: any) => a.recommendation_id))
        const remainingRecs = recommendations.filter((r: any) => !selectedRecIds.has(r.recommendation_id)).length

        let canOpen = false
        let reason: string | null = null

        if (hasPending) {
            canOpen = false
            reason = "PENDING_ACTIONS"
        } else if (remainingRecs === 0) {
            canOpen = false
            reason = "NO_MORE_RECOMMENDATIONS"
        } else {
            canOpen = true
            reason = null
        }

        return {
            cycle_id: cycle.assessment_cycle_id,
            assessment_status: "completed",
            actions: {
                active: activeActions.map((a: any) => ({
                    action_id: a.action_id,
                    title: a.title || "Ação Selecionada", // Fallback if join missing
                    status: a.status
                })),
                completed_count: completedCount,
                total_recommendations: totalRecommendations
            },
            next: {
                can_open_next_block: canOpen,
                reason
            }
        }
    }
    async getDashboardStatus(companyId: string) {
        // 1. has_company
        const company = await this.dbClient.getCompanyById(companyId)
        const has_company = !!company

        if (!has_company) {
            return {
                has_company: false,
                has_active_cycle: false,
                assessment_completed: false,
                has_active_block: false,
                can_select_next_block: false,
                cycle_closed: false
            }
        }

        // 2. has_active_cycle
        const activeCycle = await this.dbClient.getActiveCycle(companyId)
        const has_active_cycle = !!activeCycle

        // 3. cycle_closed (Only true if NO active cycle AND recent cycle is closed)
        let cycle_closed = false
        if (!has_active_cycle) {
            const recentCycle = await this.dbClient.getMostRecentCycle(companyId)
            if (recentCycle && recentCycle.status === 'completed') {
                cycle_closed = true
            }
        }

        // 4. assessment_completed
        let assessment_completed = false
        let has_active_block = false
        let can_select_next_block = false

        if (has_active_cycle && activeCycle) {
            // Calculate assessment completion
            const segmentId = await this.dbClient.getSegmentByCompany(companyId)
            // Safety check
            if (segmentId) {
                const processIds = await this.dbClient.getProcessIdsBySegment(segmentId)
                const totalQuestions = await this.dbClient.countQuestionsByProcessIds(processIds)
                const answeredQuestions = await this.dbClient.countResponsesByCycle(activeCycle.assessment_cycle_id)
                assessment_completed = (totalQuestions > 0 && answeredQuestions === totalQuestions)
            }

            // 5. has_active_block
            const selectedActions = await this.dbClient.getSelectedActionsByCycle(activeCycle.assessment_cycle_id)
            has_active_block = selectedActions.some((a: any) => a.status !== 'completed' && a.status !== 'concluida')

            // 6. can_select_next_block
            // •	assessment_completed = true
            // •	cycle_closed = false (active cycle implies cycle_closed is FALSE logic wise? "cycle_closed = true se NÃO existir ciclo ativo")
            //    So if active cycle exists, cycle_closed is always false by definition above.
            // •	has_active_block = false
            // •	existir pool disponível
            if (assessment_completed && !has_active_block) {
                const recommendations = await this.dbClient.getRecommendationsByCycle(activeCycle.assessment_cycle_id)
                const selectedRecIds = new Set(selectedActions.map((a: any) => a.recommendation_id))
                const remainingRecs = recommendations.filter((r: any) => !selectedRecIds.has(r.recommendation_id)).length

                if (remainingRecs > 0) {
                    can_select_next_block = true
                }
            }
        }

        return {
            has_company,
            has_active_cycle,
            assessment_completed,
            has_active_block,
            can_select_next_block,
            cycle_closed
        }
    }
}
