import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'
import { NotFoundError } from '../../adapters/http/errors'

export class RequestContextService {
    constructor(private dbClient: SupabaseDbClient) { }

    async getCompanyForUser(userId: string): Promise<string> {
        const company = await this.dbClient.getCompanyByUserId(userId)

        if (!company) {
            throw new NotFoundError('NO_COMPANY', 'User not associated with any company')
        }

        return company.company_id
    }
}
