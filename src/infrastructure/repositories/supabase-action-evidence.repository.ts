import { ActionEvidenceRepository } from '../../application/repositories/action-evidence.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseActionEvidenceRepository implements ActionEvidenceRepository {
    constructor(private supabase: SupabaseClient) { }

    async add(evidence: {
        selectedActionId: string;
        cycleId: string;
        companyId: string;
        content: string;
        createdBy: string;
    }): Promise<void> {
        const { error } = await this.supabase
            .from('action_evidence')
            .insert({
                selected_action_id: evidence.selectedActionId,
                cycle_id: evidence.cycleId,
                company_id: evidence.companyId,
                content: evidence.content,
                created_by: evidence.createdBy
            });

        if (error) {
            throw error;
        }
    }

    async existsForAction(selectedActionId: string): Promise<boolean> {
        const { count, error } = await this.supabase
            .from('action_evidence')
            .select('*', { count: 'exact', head: true })
            .eq('selected_action_id', selectedActionId);

        if (error) {
            throw error;
        }

        return (count ?? 0) > 0;
    }
}
