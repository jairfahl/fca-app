/**
 * UC-03: Calculate Maturity Scores - Unit Tests
 */

import { CalculateMaturityScoresUseCase } from './calculate-maturity-scores.use-case';
import { IDiagnosticRepository } from '../repositories/diagnostic.repository.interface';
import { ScoringService } from '../../domain/services/scoring.service';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('CalculateMaturityScoresUseCase', () => {
    let useCase: CalculateMaturityScoresUseCase;
    let mockDiagnosticRepo: jest.Mocked<IDiagnosticRepository>;
    let scoringService: ScoringService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDiagnosticRepo = {
            isDiagnosticComplete: jest.fn(),
        } as any;

        mockDb = {
            getCompanyIdByCycle: jest.fn(),
            getSegmentByCompany: jest.fn(),
            getProcessIdsBySegment: jest.fn(),
            getQuestionIdsByProcess: jest.fn(),
            getResponsesWithScores: jest.fn(),
            saveProcessScores: jest.fn(),
        } as any;

        scoringService = new ScoringService(mockDb);
        useCase = new CalculateMaturityScoresUseCase(mockDiagnosticRepo, scoringService);
    });

    it('should calculate and save scores when diagnostic complete', async () => {
        mockDiagnosticRepo.isDiagnosticComplete.mockResolvedValue(true);
        mockDb.getCompanyIdByCycle.mockResolvedValue('company-1');
        mockDb.getSegmentByCompany.mockResolvedValue('C');
        mockDb.getProcessIdsBySegment.mockResolvedValue(['p1']);
        mockDb.getQuestionIdsByProcess.mockResolvedValue(['q1']);
        mockDb.getResponsesWithScores.mockResolvedValue([
            { response_id: 'r1', answer_option: { score_value: 80 } },
        ]);
        mockDb.saveProcessScores.mockResolvedValue();

        const result = await useCase.execute({ cycleId: 'cycle-1' });

        expect(result.processScores).toHaveLength(1);
        expect(result.overallMaturity).toBeDefined();
        expect(mockDb.saveProcessScores).toHaveBeenCalled();
    });

    it('should throw error when diagnostic not complete', async () => {
        mockDiagnosticRepo.isDiagnosticComplete.mockResolvedValue(false);

        await expect(
            useCase.execute({ cycleId: 'cycle-1' })
        ).rejects.toThrow('Cannot calculate scores: diagnostic is not complete');
    });
});
