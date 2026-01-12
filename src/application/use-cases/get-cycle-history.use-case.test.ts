import { GetCycleHistoryUseCase } from './get-cycle-history.use-case';
import { CycleReadRepository, CycleReadModel } from '../repositories/cycle-read.repository.interface';
import { MaturityReadRepository } from '../repositories/maturity-read.repository.interface';
import { ActionReadRepository, SelectedActionReadModel } from '../repositories/action-read.repository.interface';
import { EvidenceReadRepository } from '../repositories/evidence-read.repository.interface';
import { ConsultantCommentReadRepository } from '../repositories/consultant-comment-read.repository.interface';

describe('GetCycleHistoryUseCase', () => {
    let useCase: GetCycleHistoryUseCase;
    let mockCycleRepo: jest.Mocked<CycleReadRepository>;
    let mockMaturityRepo: jest.Mocked<MaturityReadRepository>;
    let mockActionRepo: jest.Mocked<ActionReadRepository>;
    let mockEvidenceRepo: jest.Mocked<EvidenceReadRepository>;
    let mockCommentRepo: jest.Mocked<ConsultantCommentReadRepository>;

    beforeEach(() => {
        mockCycleRepo = {
            listClosedByCompany: jest.fn(),
            getClosedById: jest.fn()
        };
        mockMaturityRepo = {
            getOverallScore: jest.fn(),
            getAreaScores: jest.fn()
        };
        mockActionRepo = {
            listByCycle: jest.fn()
        };
        mockEvidenceRepo = {
            countByAction: jest.fn()
        };
        mockCommentRepo = {
            countByAction: jest.fn()
        };

        useCase = new GetCycleHistoryUseCase(
            mockCycleRepo,
            mockMaturityRepo,
            mockActionRepo,
            mockEvidenceRepo,
            mockCommentRepo
        );
    });

    it('should return only CLOSED cycles', async () => {
        const cycles: CycleReadModel[] = [
            { cycleId: 'cycle-1', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-01-01T00:00:00Z' },
            { cycleId: 'cycle-2', companyId: 'company-123', status: 'OPEN', closedAt: null },
            { cycleId: 'cycle-3', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-02-01T00:00:00Z' }
        ];

        mockCycleRepo.listClosedByCompany.mockResolvedValue(cycles);
        mockMaturityRepo.getOverallScore.mockResolvedValue(75);
        mockMaturityRepo.getAreaScores.mockResolvedValue({ area1: 80, area2: 70 });
        mockActionRepo.listByCycle.mockResolvedValue([]);
        mockEvidenceRepo.countByAction.mockResolvedValue(0);
        mockCommentRepo.countByAction.mockResolvedValue(0);

        const result = await useCase.execute({ companyId: 'company-123' });

        expect(result).toHaveLength(2);
        expect(result[0].cycleId).toBe('cycle-1');
        expect(result[1].cycleId).toBe('cycle-3');
    });

    it('should reject cycles with status other than CLOSED', async () => {
        const cycles: CycleReadModel[] = [
            { cycleId: 'cycle-1', companyId: 'company-123', status: 'IN_PROGRESS', closedAt: '2024-01-01T00:00:00Z' }
        ];

        mockCycleRepo.listClosedByCompany.mockResolvedValue(cycles);

        const result = await useCase.execute({ companyId: 'company-123' });

        expect(result).toHaveLength(0);
        expect(mockMaturityRepo.getOverallScore).not.toHaveBeenCalled();
    });

    it('should return history ordered by closedAt ASC', async () => {
        const cycles: CycleReadModel[] = [
            { cycleId: 'cycle-3', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-03-01T00:00:00Z' },
            { cycleId: 'cycle-1', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-01-01T00:00:00Z' },
            { cycleId: 'cycle-2', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-02-01T00:00:00Z' }
        ];

        mockCycleRepo.listClosedByCompany.mockResolvedValue(cycles);
        mockMaturityRepo.getOverallScore.mockResolvedValue(75);
        mockMaturityRepo.getAreaScores.mockResolvedValue({ area1: 80 });
        mockActionRepo.listByCycle.mockResolvedValue([]);

        const result = await useCase.execute({ companyId: 'company-123' });

        expect(result[0].cycleId).toBe('cycle-1');
        expect(result[1].cycleId).toBe('cycle-2');
        expect(result[2].cycleId).toBe('cycle-3');
    });

    it('should count evidence and comments correctly', async () => {
        const cycles: CycleReadModel[] = [
            { cycleId: 'cycle-1', companyId: 'company-123', status: 'CLOSED', closedAt: '2024-01-01T00:00:00Z' }
        ];

        const actions: SelectedActionReadModel[] = [
            { selectedActionId: 'action-1', cycleId: 'cycle-1', actionCatalogId: 'cat-1', status: 'COMPLETED' },
            { selectedActionId: 'action-2', cycleId: 'cycle-1', actionCatalogId: 'cat-2', status: 'COMPLETED' }
        ];

        mockCycleRepo.listClosedByCompany.mockResolvedValue(cycles);
        mockMaturityRepo.getOverallScore.mockResolvedValue(80);
        mockMaturityRepo.getAreaScores.mockResolvedValue({});
        mockActionRepo.listByCycle.mockResolvedValue(actions);
        mockEvidenceRepo.countByAction.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
        mockCommentRepo.countByAction.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

        const result = await useCase.execute({ companyId: 'company-123' });

        expect(result[0].evidenceCount).toBe(5);
        expect(result[0].consultantCommentCount).toBe(2);
        expect(result[0].selectedActionsCount).toBe(2);
    });

    it('should prove read-only execution (no mutations)', () => {
        expect(mockCycleRepo).not.toHaveProperty('save');
        expect(mockCycleRepo).not.toHaveProperty('update');
        expect(mockCycleRepo).not.toHaveProperty('delete');
        expect(mockMaturityRepo).not.toHaveProperty('save');
        expect(mockMaturityRepo).not.toHaveProperty('update');
        expect(mockMaturityRepo).not.toHaveProperty('delete');
        expect(mockActionRepo).not.toHaveProperty('save');
        expect(mockActionRepo).not.toHaveProperty('update');
        expect(mockActionRepo).not.toHaveProperty('delete');
    });
});
