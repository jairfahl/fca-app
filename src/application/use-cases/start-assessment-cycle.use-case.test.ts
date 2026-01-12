/**
 * UC-01: Start Assessment Cycle - Unit Tests
 */

import { StartAssessmentCycleUseCase } from './start-assessment-cycle.use-case';
import { ICycleRepository } from '../repositories/cycle.repository.interface';
import { CycleManagementService } from '../../domain/services/cycle-management.service';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('StartAssessmentCycleUseCase', () => {
    let useCase: StartAssessmentCycleUseCase;
    let mockCycleRepo: jest.Mocked<ICycleRepository>;
    let cycleService: CycleManagementService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockCycleRepo = {
            getActiveCycle: jest.fn(),
            createCycle: jest.fn(),
            getCycleById: jest.fn(),
            updateCycleStatus: jest.fn(),
            getActionProgress: jest.fn(),
            updateActionStatus: jest.fn(),
        } as any;

        mockDb = {
            createCycle: jest.fn(),
            getActiveCycle: jest.fn(),
        } as any;

        cycleService = new CycleManagementService(mockDb);
        useCase = new StartAssessmentCycleUseCase(mockCycleRepo, cycleService);
    });

    it('should create a new cycle when no active cycle exists', async () => {
        mockCycleRepo.getActiveCycle.mockResolvedValue(null);
        mockDb.createCycle.mockResolvedValue({
            assessment_cycle_id: 'cycle-1',
            company_id: 'company-1',
            status: 'in_progress',
            started_at: '2024-01-01T00:00:00Z',
            completed_at: null,
            created_at: '2024-01-01T00:00:00Z',
        });

        const result = await useCase.execute({ companyId: 'company-1' });

        expect(result.cycle.assessment_cycle_id).toBe('cycle-1');
        expect(result.cycle.status).toBe('OPEN');
        expect(mockCycleRepo.getActiveCycle).toHaveBeenCalledWith('company-1');
    });

    it('should throw error if active cycle already exists', async () => {
        mockCycleRepo.getActiveCycle.mockResolvedValue({
            assessment_cycle_id: 'existing-cycle',
            company_id: 'company-1',
            started_at: new Date(),
            completed_at: null,
            status: 'OPEN',
            created_at: new Date(),
        });

        await expect(
            useCase.execute({ companyId: 'company-1' })
        ).rejects.toThrow('Company already has an active cycle');
    });
});
