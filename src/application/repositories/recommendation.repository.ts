/**
 * Recommendation Repository Implementation
 */

import { IRecommendationRepository } from './recommendation.repository.interface';
import { DbClient } from '../../infrastructure/database/db-client.interface';

export class RecommendationRepository implements IRecommendationRepository {
    constructor(private db: DbClient) { }

    async getProcessScores(
        cycleId: string
    ): Promise<Array<{ process_id: string; maturity_level: string }>> {
        return await this.db.getProcessScoresByCycle(cycleId);
    }

    async getRecommendation(
        processId: string,
        maturityLevel: string
    ): Promise<{
        recommendation_id: string;
        process_id: string;
        recommendation_text: string;
    } | null> {
        const data = await this.db.getRecommendation(processId, maturityLevel);

        if (!data) {
            return null;
        }

        return {
            recommendation_id: data.recommendation_id,
            process_id: data.process_id,
            recommendation_text: data.recommendation_text,
        };
    }
}
