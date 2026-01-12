/**
 * Cycle Repository Interface
 * 
 * Encapsulates all cycle-related data access operations.
 */

import { Cycle, ActionProgress } from '../../domain/types/cycle.types';
import { ActionStatus } from '../../domain/types/action.types';

export interface ICycleRepository {
    /**
     * Create a new assessment cycle
     */
    createCycle(companyId: string): Promise<Cycle>;

    /**
     * Get active (OPEN) cycle for a company
     */
    getActiveCycle(companyId: string): Promise<Cycle | null>;

    /**
     * Get cycle by ID
     */
    getCycleById(cycleId: string): Promise<Cycle | null>;

    /**
     * Update cycle status
     */
    updateCycleStatus(cycleId: string, status: 'in_progress' | 'completed', completedAt?: Date): Promise<Cycle>;

    /**
     * Get action progress for a cycle
     */
    getActionProgress(cycleId: string): Promise<ActionProgress>;

    /**
     * Update action status
     */
    updateActionStatus(actionId: string, status: ActionStatus): Promise<void>;
}
