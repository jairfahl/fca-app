/**
 * Maturity Service
 * 
 * Pure domain service for maturity classification.
 * No database dependencies - pure functions only.
 * 
 * Responsibility: Classify scores into maturity bands (LOW/MEDIUM/HIGH)
 */

import {
    MaturityLevel,
    MaturityBand,
    MaturityClassification,
    MATURITY_BANDS,
} from '../types/maturity.types';
import { invalidScoreError } from '../errors';

export class MaturityService {
    /**
     * Classify a score into a maturity level
     * @param score - Score between 0 and 100
     * @returns Maturity level (LOW, MEDIUM, or HIGH)
     * @throws DomainError if score is invalid
     */
    classifyMaturityLevel(score: number): MaturityLevel {
        this.validateScore(score);

        const band = this.getMaturityBand(score);
        return band.level;
    }

    /**
     * Get the complete maturity band for a score
     * @param score - Score between 0 and 100
     * @returns MaturityBand object
     * @throws DomainError if score is invalid
     */
    getMaturityBand(score: number): MaturityBand {
        this.validateScore(score);

        const band = MATURITY_BANDS.find(
            (b) => score >= b.minScore && score <= b.maxScore
        );

        if (!band) {
            throw invalidScoreError(score);
        }

        return band;
    }

    /**
     * Calculate points needed to reach next maturity level
     * @param score - Current score
     * @returns Points to next level, or null if already at highest level
     * @throws DomainError if score is invalid
     */
    calculateGapToNextLevel(score: number): number | null {
        this.validateScore(score);

        const currentBand = this.getMaturityBand(score);

        // Find next band
        const currentIndex = MATURITY_BANDS.findIndex((b) => b.level === currentBand.level);
        const nextBand = MATURITY_BANDS[currentIndex + 1];

        if (!nextBand) {
            // Already at highest level
            return null;
        }

        return nextBand.minScore - score;
    }

    /**
     * Get full maturity classification with all details
     * @param score - Score between 0 and 100
     * @returns Complete MaturityClassification object
     * @throws DomainError if score is invalid
     */
    getMaturityClassification(score: number): MaturityClassification {
        this.validateScore(score);

        const band = this.getMaturityBand(score);
        const gapToNextLevel = this.calculateGapToNextLevel(score);

        return {
            score,
            level: band.level,
            band,
            gapToNextLevel,
        };
    }

    /**
     * Validate score is within valid range
     * @param score - Score to validate
     * @throws DomainError if score is outside 0-100 range
     */
    private validateScore(score: number): void {
        if (score < 0 || score > 100) {
            throw invalidScoreError(score);
        }

        if (!Number.isFinite(score)) {
            throw invalidScoreError(score);
        }
    }
}
