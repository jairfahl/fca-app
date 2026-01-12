/**
 * RecommendationService Unit Tests
 */

import { RecommendationService } from './recommendation.service';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('RecommendationService', () => {
    let service: RecommendationService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            getProcessScoresByCycle: jest.fn(),
            getRecommendation: jest.fn(),
        } as any;

        service = new RecommendationService(mockDb);
    });

    describe('generateRecommendations', () => {
        it('should generate recommendations for LOW maturity only', async () => {
            mockDb.getProcessScoresByCycle.mockResolvedValue([
                { process_id: 'p1', maturity_level: 'low' },
                { process_id: 'p2', maturity_level: 'high' },
            ]);

            mockDb.getRecommendation.mockResolvedValue({
                recommendation_id: 'rec-1',
                process_id: 'p1',
                maturity_level: 'low',
                recommendation_text: 'Improve process 1',
                version: 1,
                valid_from: '2024-01-01',
                valid_to: null,
                is_current: true,
                created_at: '2024-01-01',
            });

            const result = await service.generateRecommendations('cycle-1');

            expect(result.recommendations).toHaveLength(1);
            expect(result.recommendations[0].priority).toBe(1);
            expect(mockDb.getRecommendation).toHaveBeenCalledTimes(1);
            expect(mockDb.getRecommendation).toHaveBeenCalledWith('p1', 'low');
        });

        it('should not generate recommendations for HIGH maturity', async () => {
            mockDb.getProcessScoresByCycle.mockResolvedValue([
                { process_id: 'p1', maturity_level: 'high' },
                { process_id: 'p2', maturity_level: 'high' },
            ]);

            const result = await service.generateRecommendations('cycle-1');

            expect(result.recommendations).toHaveLength(0);
            expect(mockDb.getRecommendation).not.toHaveBeenCalled();
        });

        it('should generate recommendations for MEDIUM maturity', async () => {
            mockDb.getProcessScoresByCycle.mockResolvedValue([
                { process_id: 'p1', maturity_level: 'medium' },
            ]);

            mockDb.getRecommendation.mockResolvedValue({
                recommendation_id: 'rec-1',
                process_id: 'p1',
                maturity_level: 'medium',
                recommendation_text: 'Enhance process 1',
                version: 1,
                valid_from: '2024-01-01',
                valid_to: null,
                is_current: true,
                created_at: '2024-01-01',
            });

            const result = await service.generateRecommendations('cycle-1');

            expect(result.recommendations).toHaveLength(1);
        });
    });

    describe('shouldGenerateRecommendation', () => {
        it('should return true for LOW', () => {
            expect(service.shouldGenerateRecommendation('low')).toBe(true);
            expect(service.shouldGenerateRecommendation('LOW')).toBe(true);
        });

        it('should return true for MEDIUM', () => {
            expect(service.shouldGenerateRecommendation('medium')).toBe(true);
            expect(service.shouldGenerateRecommendation('MEDIUM')).toBe(true);
        });

        it('should return false for HIGH', () => {
            expect(service.shouldGenerateRecommendation('high')).toBe(false);
            expect(service.shouldGenerateRecommendation('HIGH')).toBe(false);
        });
    });
});
