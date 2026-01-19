/**
 * Cycle Management Service
 * 
 * Manages assessment cycle state machine and lifecycle.
 * Controls OPEN/CLOSED states and validates closure conditions.
 */

import { DbClient } from '../../infrastructure/database/db-client.interface';
import {
    Cycle,
    CreateCycleInput,
    ActionProgress,
} from '../types/cycle.types';
import { ActionStatus } from '../types/action.types';
import {
    DomainError,
    ErrorCode,
    openCycleExistsError,
    cycleNotOpenError,
    insufficientCompletedActionsError,
} from '../errors';

export class CycleManagementService {
    constructor(private db: DbClient) { }

    /**
     * Create a new assessment cycle
     * @throws DomainError if company already has an OPEN cycle
     */
    async createCycle(input: CreateCycleInput): Promise<Cycle> {
        // Check for existing OPEN cycle
        const existingCycle = await this.getActiveCycle(input.company_id);
        if (existingCycle) {
            throw openCycleExistsError(input.company_id, existingCycle.assessment_cycle_id);
        }

        // Create new cycle
        const result = await this.db.createCycle({
            company_id: input.company_id,
            status: 'in_progress',
            started_at: new Date().toISOString(),
        });

        return {
            assessment_cycle_id: result.assessment_cycle_id,
            company_id: result.company_id,
            started_at: new Date(result.started_at),
            completed_at: result.completed_at ? new Date(result.completed_at) : null,
            status: result.status === 'in_progress' ? 'OPEN' : 'CLOSED',
            created_at: new Date(result.created_at),
        };
    }

    /**
     * Get active (OPEN) cycle for a company
     * @returns Cycle if exists, null otherwise
     */
    async getActiveCycle(companyId: string): Promise<Cycle | null> {
        const data = await this.db.getActiveCycle(companyId);

        if (!data) {
            return null;
        }

        return {
            assessment_cycle_id: data.assessment_cycle_id,
            company_id: data.company_id,
            started_at: new Date(data.started_at),
            completed_at: data.completed_at ? new Date(data.completed_at) : null,
            status: 'OPEN',
            created_at: new Date(data.created_at),
        };
    }

    /**
     * Get cycle by ID
     */
    async getCycleById(cycleId: string): Promise<Cycle> {
        const data = await this.db.getCycleById(cycleId);

        if (!data) {
            throw new DomainError({
                code: ErrorCode.CYCLE_NOT_FOUND,
                message: 'Cycle not found',
                entityId: cycleId,
            });
        }

        return {
            assessment_cycle_id: data.assessment_cycle_id,
            company_id: data.company_id,
            started_at: new Date(data.started_at),
            completed_at: data.completed_at ? new Date(data.completed_at) : null,
            status: data.status === 'in_progress' ? 'OPEN' : 'CLOSED',
            created_at: new Date(data.created_at),
        };
    }

    /**
     * Check if cycle can be closed
     * Requires at least 3 actions in DONE or DROPPED status
     */
    async canCloseCycle(cycleId: string): Promise<boolean> {
        const progress = await this.getActionProgress(cycleId);
        return progress.canCloseCycle;
    }

    /**
     * Get action progress for a cycle
     */
    async getActionProgress(cycleId: string): Promise<ActionProgress> {
        const actions = await this.db.getActionStatuses(cycleId);

        const totalActions = actions.length;
        const completedActions = actions.filter(
            (a) => a.status === 'DONE' || a.status === 'DROPPED'
        ).length;
        const pendingActions = totalActions - completedActions;

        return {
            cycleId,
            totalActions,
            completedActions,
            pendingActions,
            canCloseCycle: totalActions > 0 && pendingActions === 0,
        };
    }

    /**
     * Close a cycle
     * @throws DomainError if cycle is not OPEN or insufficient actions completed
     */
    async closeCycle(cycleId: string): Promise<Cycle> {
        // Verify cycle is OPEN
        const cycle = await this.getCycleById(cycleId);
        if (cycle.status !== 'OPEN') {
            throw cycleNotOpenError(cycleId, cycle.status);
        }

        // Verify can close
        const progress = await this.getActionProgress(cycleId);
        if (!progress.canCloseCycle) {
            throw insufficientCompletedActionsError(cycleId, progress.completedActions);
        }

        // Close cycle
        const result = await this.db.updateCycle(cycleId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
        });

        return {
            assessment_cycle_id: result.assessment_cycle_id,
            company_id: result.company_id,
            started_at: new Date(result.started_at),
            completed_at: new Date(result.completed_at!),
            status: 'CLOSED',
            created_at: new Date(result.created_at),
        };
    }

    /**
     * Update action status
     */
    async updateActionStatus(actionId: string, status: ActionStatus): Promise<void> {
        const completedAt =
            status === 'DONE' || status === 'DROPPED' ? new Date().toISOString() : undefined;

        await this.db.updateActionStatus(actionId, status, completedAt);
    }
}
