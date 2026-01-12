/**
 * UC-04: Generate Recommendations
 * 
 * Orchestrates recommendation generation based on process scores.
 */

import { RecommendationService } from '../../domain/services/recommendation.service';
import { RecommendationOutput } from '../../domain/types/diagnostic.types';

export interface GenerateRecommendationsInput {
    cycleId: string;
}

export interface GenerateRecommendationsOutput {
    recommendations: RecommendationOutput[];
}

export class GenerateRecommendationsUseCase {
    constructor(
        private recommendationService: RecommendationService
    ) { }

    async execute(input: GenerateRecommendationsInput): Promise<GenerateRecommendationsOutput> {
        // Generate recommendations using domain service
        const result = await this.recommendationService.generateRecommendations(input.cycleId);

        return { recommendations: result.recommendations };
    }
}
