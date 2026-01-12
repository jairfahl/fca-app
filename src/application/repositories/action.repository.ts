/**
 * Action Repository Implementation
 */

import { IActionRepository } from './action.repository.interface';
import { DbClient } from '../../infrastructure/database/db-client.interface';
import { Action, SelectedAction } from '../../domain/types/action.types';
import { getSupabaseClient } from '../../infrastructure/database';

export class ActionRepository implements IActionRepository {
    constructor(private db: DbClient) { }

    async getCurrentActions(): Promise<Action[]> {
        const data = await this.db.getCurrentActions();

        return data.map((a) => ({
            action_catalog_id: a.action_catalog_id,
            recommendation_id: a.recommendation_id,
            action_title: a.action_title,
            action_description: a.action_description,
            version: a.version,
            valid_from: new Date(a.valid_from),
            valid_to: a.valid_to ? new Date(a.valid_to) : null,
            is_current: a.is_current,
            created_at: new Date(a.created_at),
        }));
    }

    async getActionsByRecommendation(recommendationId: string): Promise<Action[]> {
        const data = await this.db.getActionsByRecommendation(recommendationId);

        return data.map((a) => ({
            action_catalog_id: a.action_catalog_id,
            recommendation_id: a.recommendation_id,
            action_title: a.action_title,
            action_description: a.action_description,
            version: a.version,
            valid_from: new Date(a.valid_from),
            valid_to: a.valid_to ? new Date(a.valid_to) : null,
            is_current: a.is_current,
            created_at: new Date(a.created_at),
        }));
    }

    async getActionById(actionId: string): Promise<Action | null> {
        const data = await this.db.getActionById(actionId);

        if (!data) {
            return null;
        }

        return {
            action_catalog_id: data.action_catalog_id,
            recommendation_id: data.recommendation_id,
            action_title: data.action_title,
            action_description: data.action_description,
            version: data.version,
            valid_from: new Date(data.valid_from),
            valid_to: data.valid_to ? new Date(data.valid_to) : null,
            is_current: data.is_current,
            created_at: new Date(data.created_at),
        };
    }

    async saveSelectedActions(
        cycleId: string,
        userId: string,
        actions: Array<{ actionCatalogId: string; sequence: number }>
    ): Promise<SelectedAction[]> {
        const supabase = getSupabaseClient();

        const insertData = actions.map((action) => ({
            assessment_cycle_id: cycleId,
            action_catalog_id: action.actionCatalogId,
            user_id: userId,
            status: 'PENDING',
            sequence: action.sequence,
            selected_at: new Date().toISOString(),
        }));

        const { data, error } = await supabase
            .from('selected_action')
            .insert(insertData)
            .select();

        if (error || !data) {
            throw new Error(`Failed to save selected actions: ${error?.message}`);
        }

        return data.map((a: any) => ({
            selected_action_id: a.selected_action_id,
            assessment_cycle_id: a.assessment_cycle_id,
            action_catalog_id: a.action_catalog_id,
            user_id: a.user_id,
            status: a.status,
            sequence: a.sequence,
            selected_at: new Date(a.selected_at),
            completed_at: a.completed_at ? new Date(a.completed_at) : null,
            created_at: new Date(a.created_at),
            updated_at: a.updated_at ? new Date(a.updated_at) : null,
        }));
    }

    async getSelectedActions(cycleId: string): Promise<SelectedAction[]> {
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
            .from('selected_action')
            .select('*')
            .eq('assessment_cycle_id', cycleId);

        if (error) {
            throw new Error(`Failed to get selected actions: ${error.message}`);
        }

        return (data || []).map((a: any) => ({
            selected_action_id: a.selected_action_id,
            assessment_cycle_id: a.assessment_cycle_id,
            action_catalog_id: a.action_catalog_id,
            user_id: a.user_id,
            status: a.status,
            sequence: a.sequence,
            selected_at: new Date(a.selected_at),
            completed_at: a.completed_at ? new Date(a.completed_at) : null,
            created_at: new Date(a.created_at),
            updated_at: a.updated_at ? new Date(a.updated_at) : null,
        }));
    }
}
