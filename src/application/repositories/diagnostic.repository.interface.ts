/**
 * Diagnostic Repository Interface
 * 
 * Encapsulates all diagnostic-related data access operations.
 */

import { Process, Question, DiagnosticResponse } from '../../domain/types/diagnostic.types';
import { SegmentId } from '../../domain/types/segment.types';

export interface IDiagnosticRepository {
    /**
     * Get processes for a specific segment
     */
    getProcessesBySegment(segmentId: SegmentId): Promise<Process[]>;

    /**
     * Get current questions for a process
     */
    getQuestionsByProcess(processId: string): Promise<Question[]>;

    /**
     * Save a diagnostic response
     */
    saveResponse(cycleId: string, questionId: string, answerOptionId: string): Promise<DiagnosticResponse>;

    /**
     * Check if diagnostic is complete for a cycle
     */
    isDiagnosticComplete(cycleId: string): Promise<boolean>;

    /**
     * Get company's segment ID by cycle
     */
    getSegmentByCycle(cycleId: string): Promise<SegmentId | null>;
}
