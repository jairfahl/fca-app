/**
 * UC-07: Close Cycle
 * 
 * Orchestrates cycle closure with validation.
 */

import { CycleManagementService } from '../../domain/services/cycle-management.service';
import { Cycle } from '../../domain/types/cycle.types';

export interface CloseCycleInput {
    cycleId: string;
}

export interface CloseCycleOutput {
    cycle: Cycle;
}

export class CloseCycleUseCase {
    constructor(
        private cycleService: CycleManagementService
    ) { }

    async execute(input: CloseCycleInput): Promise<CloseCycleOutput> {
        // Precondition: Check if cycle can be closed
        const canClose = await this.cycleService.canCloseCycle(input.cycleId);
        if (!canClose) {
            throw new Error('Cannot close cycle: all actions must be completed');
        }

        // Close cycle using domain service
        const cycle = await this.cycleService.closeCycle(input.cycleId);

        return { cycle };
    }
}
