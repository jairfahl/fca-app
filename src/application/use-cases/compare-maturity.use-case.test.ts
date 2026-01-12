import { CompareMaturityUseCase } from './compare-maturity.use-case';
import { CycleReadRepository, CycleReadModel } from '../repositories/cycle-read.repository.interface';
import { MaturityReadRepository } from '../repositories/maturity-read.repository.interface';
import { DomainError } from '../../domain/errors/domain-error';

describe('CompareMaturityUseCase', () => {
    let useCase: CompareMaturityUseCase;
    let mockCycleRepo: jest.Mocked<CycleReadRepository>;
    let mockMaturityRepo: jest.Mocked<MaturityReadRepository>;

    beforeEach(() => {
        mockCycleRepo = {
            listClosedByCompany: jest.fn(),
            getClosedById: jest.fn()
        };
        mockMaturityRepo = {
            getOverallScore: jest.fn(),
            getAreaScores: jest.fn()
        };

        useCase = new CompareMaturityUseCase(mockCycleRepo, mockMaturityRepo);
    });

    it('should calculate IMPROVEMENT trend for positive delta', async () => {
        const baseCycle: CycleReadModel = {
            cycleId: 'cycle-1',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-01-01T00:00:00Z'
        };

        const targetCycle: CycleReadModel = {
            cycleId: 'cycle-2',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-02-01T00:00:00Z'
        };

        mockCycleRepo.getClosedById.mockResolvedValueOnce(baseCycle).mockResolvedValueOnce(targetCycle);
        mockMaturityRepo.getOverallScore.mockResolvedValueOnce(60).mockResolvedValueOnce(75);
        mockMaturityRepo.getAreaScores.mockResolvedValueOnce({ area1: 50 }).mockResolvedValueOnce({ area1: 70 });

        const result = await useCase.execute({
            companyId: 'company-123',
            baseCycleId: 'cycle-1',
            targetCycleId: 'cycle-2'
        });

        expect(result.trend).toBe('IMPROVEMENT');
        expect(result.overallDelta).toBe(15);
        expect(result.areaDeltas.area1).toBe(20);
    });

    it('should calculate STAGNATION trend for zero delta', async () => {
        const baseCycle: CycleReadModel = {
            cycleId: 'cycle-1',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-01-01T00:00:00Z'
        };

        const targetCycle: CycleReadModel = {
            cycleId: 'cycle-2',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-02-01T00:00:00Z'
        };

        mockCycleRepo.getClosedById.mockResolvedValueOnce(baseCycle).mockResolvedValueOnce(targetCycle);
        mockMaturityRepo.getOverallScore.mockResolvedValueOnce(70).mockResolvedValueOnce(70);
        mockMaturityRepo.getAreaScores.mockResolvedValueOnce({ area1: 70 }).mockResolvedValueOnce({ area1: 70 });

        const result = await useCase.execute({
            companyId: 'company-123',
            baseCycleId: 'cycle-1',
            targetCycleId: 'cycle-2'
        });

        expect(result.trend).toBe('STAGNATION');
        expect(result.overallDelta).toBe(0);
    });

    it('should calculate REGRESSION trend for negative delta', async () => {
        const baseCycle: CycleReadModel = {
            cycleId: 'cycle-1',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-01-01T00:00:00Z'
        };

        const targetCycle: CycleReadModel = {
            cycleId: 'cycle-2',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-02-01T00:00:00Z'
        };

        mockCycleRepo.getClosedById.mockResolvedValueOnce(baseCycle).mockResolvedValueOnce(targetCycle);
        mockMaturityRepo.getOverallScore.mockResolvedValueOnce(80).mockResolvedValueOnce(65);
        mockMaturityRepo.getAreaScores.mockResolvedValueOnce({ area1: 80 }).mockResolvedValueOnce({ area1: 60 });

        const result = await useCase.execute({
            companyId: 'company-123',
            baseCycleId: 'cycle-1',
            targetCycleId: 'cycle-2'
        });

        expect(result.trend).toBe('REGRESSION');
        expect(result.overallDelta).toBe(-15);
        expect(result.areaDeltas.area1).toBe(-20);
    });

    it('should throw FORBIDDEN error for cross-company comparison', async () => {
        const baseCycle: CycleReadModel = {
            cycleId: 'cycle-1',
            companyId: 'company-123',
            status: 'CLOSED',
            closedAt: '2024-01-01T00:00:00Z'
        };

        const targetCycle: CycleReadModel = {
            cycleId: 'cycle-2',
            companyId: 'company-999',
            status: 'CLOSED',
            closedAt: '2024-02-01T00:00:00Z'
        };

        mockCycleRepo.getClosedById.mockResolvedValueOnce(baseCycle).mockResolvedValueOnce(targetCycle);

        try {
            await useCase.execute({
                companyId: 'company-123',
                baseCycleId: 'cycle-1',
                targetCycleId: 'cycle-2'
            });
            fail('Should have thrown FORBIDDEN error');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainError);
            expect((error as DomainError).message).toBe('Access denied to company data');
        }
    });

    it('should throw error for non-CLOSED base cycle', async () => {
        const baseCycle: CycleReadModel = {
            cycleId: 'cycle-1',
            companyId: 'company-123',
            status: 'OPEN',
            closedAt: null
        };

        mockCycleRepo.getClosedById.mockResolvedValueOnce(baseCycle);

        await expect(
            useCase.execute({
                companyId: 'company-123',
                baseCycleId: 'cycle-1',
                targetCycleId: 'cycle-2'
            })
        ).rejects.toThrow('Base cycle must be CLOSED');
    });

    it('should prove read-only execution (no mutations)', () => {
        expect(mockCycleRepo).not.toHaveProperty('save');
        expect(mockCycleRepo).not.toHaveProperty('update');
        expect(mockCycleRepo).not.toHaveProperty('delete');
        expect(mockMaturityRepo).not.toHaveProperty('save');
        expect(mockMaturityRepo).not.toHaveProperty('update');
        expect(mockMaturityRepo).not.toHaveProperty('delete');
    });
});
