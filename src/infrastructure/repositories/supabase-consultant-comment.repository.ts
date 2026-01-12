import { ConsultantCommentRepository, ConsultantComment } from '../../application/repositories/consultant-comment.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseConsultantCommentRepository implements ConsultantCommentRepository {
    constructor(private supabase: SupabaseClient) { }

    async add(comment: {
        selectedActionId: string;
        cycleId: string;
        companyId: string;
        consultantId: string;
        content: string;
    }): Promise<void> {
        const { error } = await this.supabase
            .from('consultant_comments')
            .insert({
                selected_action_id: comment.selectedActionId,
                cycle_id: comment.cycleId,
                company_id: comment.companyId,
                consultant_id: comment.consultantId,
                content: comment.content
            });

        if (error) {
            throw error;
        }
    }

    async getLastForAction(selectedActionId: string): Promise<ConsultantComment | null> {
        const { data, error } = await this.supabase
            .from('consultant_comments')
            .select('*')
            .eq('selected_action_id', selectedActionId)
            .order('created_at', { ascending: false })
            .limit(1)
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
            id: data.id,
            selectedActionId: data.selected_action_id,
            cycleId: data.cycle_id,
            companyId: data.company_id,
            consultantId: data.consultant_id,
            content: data.content,
            createdAt: new Date(data.created_at)
        };
    }
}
