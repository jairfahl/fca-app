/**
 * UC-02: Complete Diagnostic
 * 
 * Orchestrates recording diagnostic responses for a cycle.
 */

import { DiagnosticService } from '../../domain/services/diagnostic.service';
import { DiagnosticResponse } from '../../domain/types/diagnostic.types';

export interface CompleteDiagnosticInput {
    cycleId: string;
    responses: Array<{
        questionId: string;
        answerOptionId: string;
    }>;
}

export interface CompleteDiagnosticOutput {
    recordedResponses: DiagnosticResponse[];
    isComplete: boolean;
}

export class CompleteDiagnosticUseCase {
    constructor(
        private diagnosticService: DiagnosticService
    ) { }

    async execute(input: CompleteDiagnosticInput): Promise<CompleteDiagnosticOutput> {
        const recordedResponses: DiagnosticResponse[] = [];

        // Record each response
        for (const response of input.responses) {
            const recorded = await this.diagnosticService.recordResponse({
                cycle_id: input.cycleId,
                question_id: response.questionId,
                answer_option_id: response.answerOptionId,
            });
            recordedResponses.push(recorded);
        }

        // Check if diagnostic is complete
        const isComplete = await this.diagnosticService.isDiagnosticComplete(input.cycleId);

        return { recordedResponses, isComplete };
    }
}
