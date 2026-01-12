/**
 * UC-07: Close Cycle - Unit Tests
 */

import { CloseCycleUseCase } from './close-cycle.use-case';
import { CycleManagementService } from '../../domain/services/cycle-management.service';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('CloseCycleUseCase', () => {
    let useCase: CloseCycleUseCase;
    let cycleService: CycleManagementService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            getCycleById: jest.fn(),
            getActionStatuses: jest.fn(),
            updateCycle: jest.fn(),
        } as any;

        cycleService = new CycleManagementService(mockDb);
        useCase = new CloseCycleUseCase(cycleService);
    });

    it('should close cycle when 3+ actions completed', async () => {
        mockDb.getCycleById.mockResolvedValue({
            assessment_cycle_id: 'cycle-1',
            company_id: 'company-1',
            status: 'in_progress',
            started_at: '2024-01-01T00:00:00Z',
            completed_at: null,
            created_at: '2024-01-01T00:00:00Z',
        });

        mockDb.getActionStatuses.mockResolvedValue([
            { status: 'DONE' },
            { status: 'DONE' },
            { status: 'DONE' },
        ]);

        mockDb.updateCycle.mockResolvedValue({
            assessment_cycle_id: 'cycle-1',
            company_id: 'company-1',
            status: 'completed',
            started_at: '2024-01-01T00:00:00Z',
            completed_at: '2024-01-02T00:00:00Z',
            created_at: '2024-01-01T00:00:00Z',
        });

        const result = await useCase.execute({ cycleId: 'cycle-1' });

        expect(result.cycle.status).toBe('CLOSED');
        expect(result.cycle.completed_at).not.toBeNull();
    });

    it('should throw error when less than 3 actions completed', async () => {
        mockDb.getCycleById.mockResolvedValue({
            assessment_cycle_id: 'cycle-1',
            company_id: 'company-1',
            status: 'in_progress',
            started_at: '2024-01-01T00:00:00Z',
            completed_at: null,
            created_at: '2024-01-01T00:00:00Z',
        });

        mockDb.getActionStatuses.mockResolvedValue([
            { status: 'DONE' },
            { status: 'PENDING' },
        ]);

        await expect(
            useCase.execute({ cycleId: 'cycle-1' })
        ).rejects.toThrow('Cannot close cycle: insufficient completed actions');
    });
});
