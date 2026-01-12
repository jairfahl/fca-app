/**
 * Recommendation Service
 * 
 * Generates recommendations based on process maturity levels.
 * Only generates recommendations for LOW and MEDIUM maturity.
 */

import { DbClient } from '../../infrastructure/database/db-client.interface';
import {
    Recommendation,
    RecommendationOutput,
    GenerateRecommendationsOutput,
} from '../types/diagnostic.types';
import { MaturityLevel } from '../types/maturity.types';
import { recommendationNotFoundError } from '../errors';

export class RecommendationService {
    constructor(private db: DbClient) { }

    /**
     * Generate recommendations for all processes in a cycle
     * Only generates for processes with LOW or MEDIUM maturity
     */
    async generateRecommendations(cycleId: string): Promise<GenerateRecommendationsOutput> {
        // Get all process scores for this cycle
        const processScores = await this.db.getProcessScoresByCycle(cycleId);

        const recommendations: RecommendationOutput[] = [];
        let priority = 1;

        for (const score of processScores) {
            // Only generate recommendations for LOW or MEDIUM maturity
            if (this.shouldGenerateRecommendation(score.maturity_level)) {
                try {
                    const recommendation = await this.getRecommendationForProcess(
                        score.process_id,
                        score.maturity_level
                    );

                    recommendations.push({
                        recommendation_id: recommendation.recommendation_id,
                        process_id: recommendation.process_id,
                        priority: priority++,
                        recommendation_text: recommendation.recommendation_text,
                    });
                } catch (error) {
                    // Skip if no recommendation found (shouldn't happen with proper seed data)
                    console.warn(`No recommendation found for process ${score.process_id}`);
                }
            }
        }

        return { recommendations };
    }

    /**
     * Get recommendation for a specific process and maturity level
     */
    async getRecommendationForProcess(
        processId: string,
        maturityLevel: string
    ): Promise<Recommendation> {
        const data = await this.db.getRecommendation(processId, maturityLevel);

        if (!data) {
            throw recommendationNotFoundError(processId, maturityLevel);
        }

        return {
            recommendation_id: data.recommendation_id,
            process_id: data.process_id,
            maturity_level: data.maturity_level.toUpperCase() as MaturityLevel,
            recommendation_text: data.recommendation_text,
            version: data.version,
            valid_from: new Date(data.valid_from),
            valid_to: data.valid_to ? new Date(data.valid_to) : null,
            is_current: data.is_current,
            created_at: new Date(data.created_at),
        };
    }

    /**
     * Determine if recommendation should be generated
     * HIGH maturity = no recommendations needed
     */
    shouldGenerateRecommendation(maturityLevel: string): boolean {
        const level = maturityLevel.toUpperCase();
        return (
            level === 'INICIANTE' ||
            level === 'EM_DESENVOLVIMENTO' ||
            level === 'LOW' ||
            level === 'MEDIUM'
        );
    }
}
