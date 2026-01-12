/**
 * UC-01: Start Assessment Cycle
 * 
 * Orchestrates the creation of a new assessment cycle for a company.
 */

import { ICycleRepository } from '../repositories/cycle.repository.interface';
import { Cycle } from '../../domain/types/cycle.types';
import { CycleManagementService } from '../../domain/services/cycle-management.service';

export interface StartAssessmentCycleInput {
    companyId: string;
}

export interface StartAssessmentCycleOutput {
    cycle: Cycle;
}

export class StartAssessmentCycleUseCase {
    constructor(
        private cycleRepository: ICycleRepository,
        private cycleService: CycleManagementService
    ) { }

    async execute(input: StartAssessmentCycleInput): Promise<StartAssessmentCycleOutput> {
        // Precondition: Check for existing OPEN cycle
        const existingCycle = await this.cycleRepository.getActiveCycle(input.companyId);
        if (existingCycle) {
            throw new Error(`Company already has an active cycle: ${existingCycle.assessment_cycle_id}`);
        }

        // Create cycle using domain service (includes business rules)
        const cycle = await this.cycleService.createCycle({ company_id: input.companyId });

        return { cycle };
    }
}
