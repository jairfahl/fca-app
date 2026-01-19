import { DbClient } from '../../infrastructure/database/db-client.interface'
import { ReadModelService } from '../services/read-model.service'
import { NotFoundError, ConflictError } from '../../adapters/http/errors'

export interface SubmitDiagnosticInput {
    cycleId: string
    companyId: string
    answers: { question_id: string; value: string | number | boolean }[]
    finalize: boolean
}

export interface SubmitDiagnosticOutput {
    cycle_id: string
    assessment: {
        status: 'in_progress' | 'completed'
        progress?: { answered: number; total: number }
    }
}

export class SubmitDiagnosticUseCase {
    constructor(
        private dbClient: DbClient,
        private readModelService: ReadModelService
    ) { }

    async execute(input: SubmitDiagnosticInput): Promise<SubmitDiagnosticOutput> {
        // 1. Validate Cycle
        const cycle = await this.dbClient.getCycleById(input.cycleId)
        if (!cycle || cycle.company_id !== input.companyId) {
            throw new NotFoundError('NOT_FOUND', 'Company or cycle not found')
        }

        if (cycle.status === 'completed') {
            throw new ConflictError('CYCLE_CLOSED', 'Cycle is closed or assessment not complete')
        }

        // 2. Save Answers
        if (input.answers.length > 0) {
            const responses = input.answers.map(ans => ({
                assessment_cycle_id: input.cycleId,
                question_id: ans.question_id,
                // Assume value maps to answer_option_id for now as per DB schema
                answer_option_id: String(ans.value),
                responded_at: new Date().toISOString()
            }))
            await this.dbClient.saveDiagnosticResponses(responses)
        }

        // 3. Check Status / Finalize
        const status = await this.readModelService.getDiagnosticStatus(input.companyId, input.cycleId)

        if (input.finalize) {
            if (status.assessment.progress.answered < status.assessment.progress.total || status.assessment.progress.total === 0) {
                // Cannot finalize if incomplete
                throw new ConflictError('INCOMPLETE', 'Cycle is closed or assessment not complete')
            }

            // Close cycle
            await this.dbClient.updateCycle(input.cycleId, {
                status: 'completed',
                completed_at: new Date().toISOString()
            })

            return {
                cycle_id: input.cycleId,
                assessment: { status: 'completed' }
            }
        }

        // Return progress
        return {
            cycle_id: input.cycleId,
            assessment: {
                status: 'in_progress',
                progress: status.assessment.progress
            }
        }
    }
}
