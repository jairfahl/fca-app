import { EvidenceReadRepository } from '../../application/repositories/evidence-read.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseEvidenceReadRepository implements EvidenceReadRepository {
    constructor(private supabase: SupabaseClient) { }

    async countByAction(selectedActionId: string): Promise<number> {
        const { count, error } = await this.supabase
            .from('action_evidence')
            .select('*', { count: 'exact', head: true })
            .eq('selected_action_id', selectedActionId);

        if (error) {
            throw error;
        }

        return count ?? 0;
    }
}
