import { ActionReadRepository, SelectedActionReadModel } from '../../application/repositories/action-read.repository.interface';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseActionReadRepository implements ActionReadRepository {
    constructor(private supabase: SupabaseClient) { }

    async listByCycle(cycleId: string): Promise<SelectedActionReadModel[]> {
        const { data, error } = await this.supabase
            .from('selected_actions')
            .select('selected_action_id, cycle_id, action_catalog_id, status')
            .eq('cycle_id', cycleId);

        if (error) {
            throw error;
        }

        if (!data) {
            return [];
        }

        return data.map(row => ({
            selectedActionId: row.selected_action_id,
            cycleId: row.cycle_id,
            actionCatalogId: row.action_catalog_id,
            status: row.status
        }));
    }
}
