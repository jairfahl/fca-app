/**
 * UC-05: Select Actions for Cycle
 * 
 * Orchestrates action selection and validation.
 */

import { ICycleRepository } from '../repositories/cycle.repository.interface';
import { IActionRepository } from '../repositories/action.repository.interface';
import { ActionSelectionService } from '../../domain/services/action-selection.service';
import { ActionCatalogService } from '../../domain/services/action-catalog.service';
import { SelectedAction, ActionSelectionInput } from '../../domain/types/action.types';

export interface SelectActionsForCycleInput {
    cycleId: string;
    userId: string;
    actions: ActionSelectionInput[];
}

export interface SelectActionsForCycleOutput {
    selectedActions: SelectedAction[];
}

export class SelectActionsForCycleUseCase {
    constructor(
        private cycleRepository: ICycleRepository,
        private actionRepository: IActionRepository,
        private actionSelectionService: ActionSelectionService,
        private actionCatalogService: ActionCatalogService
    ) { }

    async execute(input: SelectActionsForCycleInput): Promise<SelectActionsForCycleOutput> {
        // Precondition: Cycle must be OPEN
        const cycle = await this.cycleRepository.getCycleById(input.cycleId);
        if (!cycle) {
            throw new Error('Cycle not found');
        }
        if (cycle.status !== 'OPEN') {
            throw new Error(`Cannot select actions: cycle is ${cycle.status}`);
        }

        // Validate action selection using domain service
        this.actionSelectionService.validateActionSelection({
            cycle_id: input.cycleId,
            user_id: input.userId,
            actions: input.actions,
        });

        // Validate actions exist in catalog
        for (const action of input.actions) {
            const exists = await this.actionCatalogService.validateActionExists(action.action_catalog_id);
            if (!exists) {
                throw new Error(`Action not found in catalog: ${action.action_catalog_id}`);
            }
        }

        // Save selected actions
        const selectedActions = await this.actionRepository.saveSelectedActions(
            input.cycleId,
            input.userId,
            input.actions.map((a) => ({
                actionCatalogId: a.action_catalog_id,
                sequence: a.sequence,
            }))
        );

        return { selectedActions };
    }
}
