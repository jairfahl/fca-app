import { ConsultantCommentReadRepository } from '../../application/repositories/consultant-comment-read.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseConsultantCommentReadRepository implements ConsultantCommentReadRepository {
    constructor(private supabase: SupabaseClient) { }

    async countByAction(selectedActionId: string): Promise<number> {
        const { count, error } = await this.supabase
            .from('consultant_comments')
            .select('*', { count: 'exact', head: true })
            .eq('selected_action_id', selectedActionId);

        if (error) {
            throw error;
        }

        return count ?? 0;
    }
}
