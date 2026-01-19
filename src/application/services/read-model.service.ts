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
}
