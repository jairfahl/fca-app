/**
 * Action Repository Interface
 */

import { Action, SelectedAction } from '../../domain/types/action.types';

export interface IActionRepository {
    /**
     * Get all current actions from catalog
     */
    getCurrentActions(): Promise<Action[]>;

    /**
     * Get actions by recommendation ID
     */
    getActionsByRecommendation(recommendationId: string): Promise<Action[]>;

    /**
     * Get action by ID
     */
    getActionById(actionId: string): Promise<Action | null>;

    /**
     * Save selected actions for a cycle
     */
    saveSelectedActions(
        cycleId: string,
        userId: string,
        actions: Array<{ actionCatalogId: string; sequence: number }>
    ): Promise<SelectedAction[]>;

    /**
     * Get selected actions for a cycle
     */
    getSelectedActions(cycleId: string): Promise<SelectedAction[]>;
}
