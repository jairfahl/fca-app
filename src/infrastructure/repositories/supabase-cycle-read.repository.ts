import { CycleReadRepository, CycleReadModel } from '../../application/repositories/cycle-read.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseCycleReadRepository implements CycleReadRepository {
    constructor(private supabase: SupabaseClient) { }

    async listClosedByCompany(companyId: string): Promise<CycleReadModel[]> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .select('assessment_cycle_id, company_id, status, closed_at')
            .eq('company_id', companyId)
            .eq('status', 'CLOSED');

        if (error) {
            throw error;
        }

        if (!data) {
            return [];
        }

        return data.map(row => ({
            cycleId: row.assessment_cycle_id,
            companyId: row.company_id,
            status: row.status,
            closedAt: row.closed_at
        }));
    }

    async getClosedById(cycleId: string): Promise<CycleReadModel | null> {
        const { data, error } = await this.supabase
            .from('assessment_cycle')
            .select('assessment_cycle_id, company_id, status, closed_at')
            .eq('assessment_cycle_id', cycleId)
            .eq('status', 'CLOSED')
            .single();

        // PGRST116 = no rows returned
        // This is an expected technical case, not a business error
        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (!data) {
            return null;
        }

        return {
            cycleId: data.assessment_cycle_id,
            companyId: data.company_id,
            status: data.status,
            closedAt: data.closed_at
        };
    }
}
