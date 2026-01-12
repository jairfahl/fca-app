/**
 * ScoringService Unit Tests
 */

import { ScoringService } from './scoring.service';
import { ErrorCode } from '../errors';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('ScoringService', () => {
    let service: ScoringService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            getQuestionIdsByProcess: jest.fn(),
            getResponsesWithScores: jest.fn(),
            saveProcessScores: jest.fn(),
            getCompanyIdByCycle: jest.fn(),
            getSegmentByCompany: jest.fn(),
            getProcessIdsBySegment: jest.fn(),
        } as any;

        service = new ScoringService(mockDb);
    });

    describe('calculateProcessScore', () => {
        it('should calculate score and classify as LOW', async () => {
            mockDb.getQuestionIdsByProcess.mockResolvedValue(['q1', 'q2']);
            mockDb.getResponsesWithScores.mockResolvedValue([
                { response_id: 'r1', answer_option: { score_value: 20 } },
                { response_id: 'r2', answer_option: { score_value: 30 } },
            ]);

            const result = await service.calculateProcessScore('cycle-1', 'process-1');

            expect(result.score).toBe(25); // AVG(20, 30)
            expect(result.maturity_band).toBe('LOW');
        });

        it('should calculate score and classify as MEDIUM', async () => {
            mockDb.getQuestionIdsByProcess.mockResolvedValue(['q1']);
            mockDb.getResponsesWithScores.mockResolvedValue([
                { response_id: 'r1', answer_option: { score_value: 55 } },
            ]);

            const result = await service.calculateProcessScore('cycle-1', 'process-1');

            expect(result.score).toBe(55);
            expect(result.maturity_band).toBe('MEDIUM');
        });

        it('should calculate score and classify as HIGH', async () => {
            mockDb.getQuestionIdsByProcess.mockResolvedValue(['q1']);
            mockDb.getResponsesWithScores.mockResolvedValue([
                { response_id: 'r1', answer_option: { score_value: 85 } },
            ]);

            const result = await service.calculateProcessScore('cycle-1', 'process-1');

            expect(result.score).toBe(85);
            expect(result.maturity_band).toBe('HIGH');
        });

        it('should throw error if no responses found', async () => {
            mockDb.getQuestionIdsByProcess.mockResolvedValue(['q1']);
            mockDb.getResponsesWithScores.mockResolvedValue([]);

            await expect(
                service.calculateProcessScore('cycle-1', 'process-1')
            ).rejects.toMatchObject({
                code: ErrorCode.INCOMPLETE_RESPONSES,
            });
        });
    });

    describe('saveScores', () => {
        it('should save scores to database', async () => {
            mockDb.saveProcessScores.mockResolvedValue();

            const scores = [
                { process_id: 'p1', score: 50, maturity_band: 'MEDIUM' as const },
                { process_id: 'p2', score: 80, maturity_band: 'HIGH' as const },
            ];

            await expect(service.saveScores('cycle-1', scores)).resolves.not.toThrow();
            expect(mockDb.saveProcessScores).toHaveBeenCalled();
        });
    });
});
