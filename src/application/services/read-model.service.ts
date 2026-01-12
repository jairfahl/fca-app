import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'

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

    async getActionSuggestions(_cycleId: string) {
        return await this.dbClient.getCurrentActions()
    }

    async getDashboard(cycleId: string) {
        const cycle = await this.dbClient.getCycleById(cycleId)
        const selectedActions = await this.dbClient.getSelectedActionsByCycle(cycleId)

        return {
            cycle,
            selected_actions: selectedActions
        }
    }
}
