/**
 * UC-06: Update Action Progress
 * 
 * Orchestrates action status updates.
 */

import { ActionStatus } from '../../domain/types/action.types';
import { CycleManagementService } from '../../domain/services/cycle-management.service';

export interface UpdateActionProgressInput {
    actionId: string;
    status: ActionStatus;
}

export interface UpdateActionProgressOutput {
    success: boolean;
}

export class UpdateActionProgressUseCase {
    constructor(
        private cycleService: CycleManagementService
    ) { }

    async execute(input: UpdateActionProgressInput): Promise<UpdateActionProgressOutput> {
        // Update action status using domain service
        await this.cycleService.updateActionStatus(input.actionId, input.status);

        return { success: true };
    }
}
