/**
 * Action Catalog Service
 * 
 * Manages versioned action catalog access.
 * Always returns current version actions.
 */

import { DbClient } from '../../infrastructure/database/db-client.interface';
import { Action } from '../types/action.types';
import { SegmentId } from '../types/segment.types';
import { actionNotInCatalogError } from '../errors';

export class ActionCatalogService {
    constructor(private db: DbClient) { }

    /**
     * Get actions for a specific recommendation
     * Returns only current version actions
     */
    async getActionsForRecommendation(recommendationId: string): Promise<Action[]> {
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

    /**
     * Get all current version actions
     */
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

    /**
     * Get actions filtered by segment (transitively through recommendation → process)
     */
    async getActionsBySegment(segmentId: SegmentId): Promise<Action[]> {
        const data = await this.db.getActionsBySegment(segmentId);

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

    /**
     * Validate that an action exists in the current catalog
     */
    async validateActionExists(actionId: string): Promise<boolean> {
        const data = await this.db.getActionById(actionId);
        return data !== null;
    }

    /**
     * Get action by ID
     * @throws DomainError if action not found or not current
     */
    async getActionById(actionId: string): Promise<Action> {
        const data = await this.db.getActionById(actionId);

        if (!data) {
            throw actionNotInCatalogError(actionId);
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
}
