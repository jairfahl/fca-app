/**
 * Cycle Repository Implementation
 * 
 * Implements cycle-related data access using DbClient.
 */

import { ICycleRepository } from './cycle.repository.interface';
import { DbClient } from '../../infrastructure/database/db-client.interface';
import { Cycle, ActionProgress } from '../../domain/types/cycle.types';
import { ActionStatus } from '../../domain/types/action.types';

export class CycleRepository implements ICycleRepository {
    constructor(private db: DbClient) { }

    async createCycle(companyId: string): Promise<Cycle> {
        const result = await this.db.createCycle({
            company_id: companyId,
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

    async getCycleById(cycleId: string): Promise<Cycle | null> {
        const data = await this.db.getCycleById(cycleId);

        if (!data) {
            return null;
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

    async updateCycleStatus(
        cycleId: string,
        status: 'in_progress' | 'completed',
        completedAt?: Date
    ): Promise<Cycle> {
        const result = await this.db.updateCycle(cycleId, {
            status,
            completed_at: completedAt?.toISOString(),
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
            canCloseCycle: completedActions >= 3,
        };
    }

    async updateActionStatus(actionId: string, status: ActionStatus): Promise<void> {
        const completedAt =
            status === 'DONE' || status === 'DROPPED' ? new Date().toISOString() : undefined;

        await this.db.updateActionStatus(actionId, status, completedAt);
    }
}
