/**
 * Scoring Service
 * 
 * Calculates process scores from diagnostic responses.
 * Uses MaturityService for classification.
 */

import { DbClient } from '../../infrastructure/database/db-client.interface';
import { ProcessScoreOutput, CalculateScoresOutput } from '../types/diagnostic.types';
import { MaturityService } from './maturity.service';
import { DomainError, ErrorCode } from '../errors';

export class ScoringService {
    private maturityService = new MaturityService();

    constructor(private db: DbClient) { }

    /**
     * Calculate score for a single process
     * Formula: AVG(answer_option.score_value) normalized to 0-100
     */
    async calculateProcessScore(cycleId: string, processId: string): Promise<ProcessScoreOutput> {
        // Get all question IDs for this process
        const questionIds = await this.db.getQuestionIdsByProcess(processId);

        // Get all responses for this process
        const responses = await this.db.getResponsesWithScores(cycleId, questionIds);

        if (!responses || responses.length === 0) {
            throw new DomainError({
                code: ErrorCode.INCOMPLETE_RESPONSES,
                message: 'No responses found for process',
                context: { processId },
            });
        }

        // Calculate average score
        const scoreValues = responses.map((r) => r.answer_option.score_value);
        const averageScore = scoreValues.reduce((sum, val) => sum + val, 0) / scoreValues.length;

        // Normalize to 0-100 scale (assuming score_value is already 0-100)
        const normalizedScore = Math.round(averageScore * 100) / 100;

        // Classify maturity
        const maturityLevel = this.maturityService.classifyMaturityLevel(normalizedScore);

        return {
            process_id: processId,
            score: normalizedScore,
            maturity_band: maturityLevel,
        };
    }

    /**
     * Calculate scores for all processes in a cycle
     */
    async calculateAllScores(cycleId: string): Promise<CalculateScoresOutput> {
        // Get company segment from cycle
        const companyId = await this.db.getCompanyIdByCycle(cycleId);
        if (!companyId) {
            throw new DomainError({
                code: ErrorCode.CYCLE_NOT_FOUND,
                message: 'Assessment cycle not found',
                entityId: cycleId,
            });
        }

        const segmentId = await this.db.getSegmentByCompany(companyId);
        if (!segmentId) {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Company not found',
            });
        }

        // Get all processes for segment
        const processIds = await this.db.getProcessIdsBySegment(segmentId);

        // Calculate score for each process
        const processScores: ProcessScoreOutput[] = [];
        for (const processId of processIds) {
            const score = await this.calculateProcessScore(cycleId, processId);
            processScores.push(score);
        }

        // Calculate overall maturity (average of all process scores)
        const overallScore =
            processScores.reduce((sum, ps) => sum + ps.score, 0) / processScores.length;
        const overallMaturity = this.maturityService.classifyMaturityLevel(overallScore);

        return {
            cycle_id: cycleId,
            process_scores: processScores,
            overall_maturity: overallMaturity,
        };
    }

    /**
     * Save calculated scores to database
     */
    async saveScores(cycleId: string, scores: ProcessScoreOutput[]): Promise<void> {
        const insertData = scores.map((score) => ({
            assessment_cycle_id: cycleId,
            process_id: score.process_id,
            score: score.score,
            maturity_level: score.maturity_band.toLowerCase(),
            calculated_at: new Date().toISOString(),
        }));

        await this.db.saveProcessScores(insertData);
    }
}
