/**
 * Cycle Types
 * 
 * Defines assessment cycle lifecycle states and related entities.
 */

export type CycleStatus = 'OPEN' | 'CLOSED';

export const CYCLE_STATUSES: CycleStatus[] = ['OPEN', 'CLOSED'];

export interface Cycle {
    assessment_cycle_id: string;
    company_id: string;
    started_at: Date;
    completed_at: Date | null;
    status: CycleStatus;
    created_at: Date;
}

export interface CreateCycleInput {
    company_id: string;
}

export interface CycleState {
    cycleId: string;
    companyId: string;
    status: CycleStatus;
    startedAt: Date;
    completedAt: Date | null;
}

export interface ActionProgress {
    cycleId: string;
    totalActions: number;
    completedActions: number;
    pendingActions: number;
    canCloseCycle: boolean;
}

export function isValidCycleStatus(value: unknown): value is CycleStatus {
    return typeof value === 'string' && CYCLE_STATUSES.includes(value as CycleStatus);
}
