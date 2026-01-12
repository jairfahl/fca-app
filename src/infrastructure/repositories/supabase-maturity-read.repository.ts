import { MaturityReadRepository } from '../../application/repositories/maturity-read.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseMaturityReadRepository implements MaturityReadRepository {
    constructor(private supabase: SupabaseClient) { }

    async getOverallScore(cycleId: string): Promise<number> {
        const { data, error } = await this.supabase
            .from('maturity_scores')
            .select('overall_score')
            .eq('cycle_id', cycleId)
            .single();

        // PGRST116 = no rows returned
        // This is an expected technical case, not a business error
        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return data?.overall_score ?? 0;
    }

    async getAreaScores(cycleId: string): Promise<Record<string, number>> {
        const { data, error } = await this.supabase
            .from('process_scores')
            .select('process_id, score')
            .eq('cycle_id', cycleId);

        if (error) {
            throw error;
        }

        if (!data) {
            return {};
        }

        const scores: Record<string, number> = {};
        for (const row of data) {
            scores[row.process_id] = row.score;
        }

        return scores;
    }
}
