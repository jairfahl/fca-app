/**
 * Action Types
 * 
 * Defines action catalog, selection, and execution tracking.
 */

export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';

export const ACTION_STATUSES: ActionStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE', 'DROPPED'];

export interface Action {
    action_catalog_id: string;
    recommendation_id: string;
    action_title: string;
    action_description: string;
    version: number;
    valid_from: Date;
    valid_to: Date | null;
    is_current: boolean;
    created_at: Date;
}

export interface SelectedAction {
    selected_action_id: string;
    assessment_cycle_id: string;
    action_catalog_id: string;
    user_id: string;
    status: ActionStatus;
    sequence: number;
    selected_at: Date;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date | null;
}

export interface ActionSelectionInput {
    action_catalog_id: string;
    sequence: number; // Must be 1, 2, or 3
}

export interface SelectActionsInput {
    cycle_id: string;
    user_id: string;
    actions: ActionSelectionInput[]; // Must be exactly 3
}

export function isValidActionStatus(value: unknown): value is ActionStatus {
    return typeof value === 'string' && ACTION_STATUSES.includes(value as ActionStatus);
}

export function isValidActionSequence(sequence: number): boolean {
    return [1, 2, 3].includes(sequence);
}
