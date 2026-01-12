import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'
import { ForbiddenError } from '../../adapters/http/errors'

export class AuthorizationService {
    constructor(private dbClient: SupabaseDbClient) { }

    async verifyCycleOwnership(cycleId: string, companyId: string): Promise<void> {
        const cycle = await this.dbClient.getCycleById(cycleId)

        if (!cycle || cycle.company_id !== companyId) {
            throw new ForbiddenError('FORBIDDEN', 'Cycle does not belong to your company')
        }
    }

    async verifyActionOwnership(selectedActionId: string, companyId: string): Promise<void> {
        const action = await this.dbClient.getSelectedActionById(selectedActionId)

        if (!action) {
            throw new ForbiddenError('FORBIDDEN', 'Action not found')
        }

        const cycle = await this.dbClient.getCycleById(action.assessment_cycle_id)

        if (!cycle || cycle.company_id !== companyId) {
            throw new ForbiddenError('FORBIDDEN', 'Action does not belong to your company')
        }
    }
}
