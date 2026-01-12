/**
 * UC-03: Calculate Maturity Scores
 * 
 * Orchestrates score calculation and storage for a cycle.
 */

import { IDiagnosticRepository } from '../repositories/diagnostic.repository.interface';
import { ScoringService } from '../../domain/services/scoring.service';
import { ProcessScoreOutput } from '../../domain/types/diagnostic.types';
import { MaturityLevel } from '../../domain/types/maturity.types';

export interface CalculateMaturityScoresInput {
    cycleId: string;
}

export interface CalculateMaturityScoresOutput {
    processScores: ProcessScoreOutput[];
    overallMaturity: MaturityLevel;
}

export class CalculateMaturityScoresUseCase {
    constructor(
        private diagnosticRepository: IDiagnosticRepository,
        private scoringService: ScoringService
    ) { }

    async execute(input: CalculateMaturityScoresInput): Promise<CalculateMaturityScoresOutput> {
        // Precondition: Diagnostic must be complete
        const isComplete = await this.diagnosticRepository.isDiagnosticComplete(input.cycleId);
        if (!isComplete) {
            throw new Error('Cannot calculate scores: diagnostic is not complete');
        }

        // Calculate all scores
        const result = await this.scoringService.calculateAllScores(input.cycleId);

        // Save scores
        await this.scoringService.saveScores(input.cycleId, result.process_scores);

        return {
            processScores: result.process_scores,
            overallMaturity: result.overall_maturity,
        };
    }
}
