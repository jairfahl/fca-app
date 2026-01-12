/**
 * CycleManagementService Unit Tests
 */

import { CycleManagementService } from './cycle-management.service';
import { DomainError, ErrorCode } from '../errors';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('CycleManagementService', () => {
    let service: CycleManagementService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            createCycle: jest.fn(),
            getActiveCycle: jest.fn(),
            getCycleById: jest.fn(),
            updateCycle: jest.fn(),
            getActionStatuses: jest.fn(),
            updateActionStatus: jest.fn(),
        } as any;

        service = new CycleManagementService(mockDb);
    });

    describe('createCycle', () => {
        it('should create a new cycle when no OPEN cycle exists', async () => {
            mockDb.getActiveCycle.mockResolvedValue(null);
            mockDb.createCycle.mockResolvedValue({
                assessment_cycle_id: 'cycle-123',
                company_id: 'company-456',
                status: 'in_progress',
                started_at: '2024-01-01T00:00:00Z',
                completed_at: null,
                created_at: '2024-01-01T00:00:00Z',
            });

            const result = await service.createCycle({ company_id: 'company-456' });

            expect(result.assessment_cycle_id).toBe('cycle-123');
            expect(result.status).toBe('OPEN');
            expect(result.completed_at).toBeNull();
            expect(mockDb.createCycle).toHaveBeenCalled();
        });

        it('should throw error if OPEN cycle already exists', async () => {
            mockDb.getActiveCycle.mockResolvedValue({
                assessment_cycle_id: 'existing-cycle',
                company_id: 'company-456',
                status: 'in_progress',
                started_at: '2024-01-01T00:00:00Z',
                completed_at: null,
                created_at: '2024-01-01T00:00:00Z',
            });

            await expect(
                service.createCycle({ company_id: 'company-456' })
            ).rejects.toMatchObject({
                code: ErrorCode.OPEN_CYCLE_EXISTS,
            });
        });
    });

    describe('getActiveCycle', () => {
        it('should return cycle if exists', async () => {
            mockDb.getActiveCycle.mockResolvedValue({
                assessment_cycle_id: 'cycle-123',
                company_id: 'company-456',
                status: 'in_progress',
                started_at: '2024-01-01T00:00:00Z',
                completed_at: null,
                created_at: '2024-01-01T00:00:00Z',
            });

            const result = await service.getActiveCycle('company-456');

            expect(result).not.toBeNull();
            expect(result?.status).toBe('OPEN');
        });

        it('should return null if no active cycle', async () => {
            mockDb.getActiveCycle.mockResolvedValue(null);

            const result = await service.getActiveCycle('company-456');

            expect(result).toBeNull();
        });
    });

    describe('closeCycle', () => {
        it('should close cycle when 3 actions completed', async () => {
            mockDb.getCycleById.mockResolvedValue({
                assessment_cycle_id: 'cycle-123',
                company_id: 'company-456',
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
                assessment_cycle_id: 'cycle-123',
                company_id: 'company-456',
                status: 'completed',
                started_at: '2024-01-01T00:00:00Z',
                completed_at: '2024-01-02T00:00:00Z',
                created_at: '2024-01-01T00:00:00Z',
            });

            const result = await service.closeCycle('cycle-123');

            expect(result.status).toBe('CLOSED');
            expect(result.completed_at).not.toBeNull();
            expect(mockDb.updateCycle).toHaveBeenCalledWith('cycle-123', expect.objectContaining({
                status: 'completed',
            }));
        });

        it('should throw error if less than 3 actions completed', async () => {
            mockDb.getCycleById.mockResolvedValue({
                assessment_cycle_id: 'cycle-123',
                company_id: 'company-456',
                status: 'in_progress',
                started_at: '2024-01-01T00:00:00Z',
                completed_at: null,
                created_at: '2024-01-01T00:00:00Z',
            });

            mockDb.getActionStatuses.mockResolvedValue([
                { status: 'DONE' },
                { status: 'DONE' },
                { status: 'PENDING' },
            ]);

            await expect(service.closeCycle('cycle-123')).rejects.toThrow(DomainError);
        });
    });
});
