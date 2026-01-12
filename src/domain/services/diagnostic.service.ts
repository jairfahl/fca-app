/**
 * Diagnostic Service
 * 
 * Manages diagnostic lifecycle and questionnaire flow.
 * Loads segment-specific processes and questions with version control.
 */

import { DbClient } from '../../infrastructure/database/db-client.interface';
import {
    Process,
    Question,
    DiagnosticResponse,
    RecordResponseInput,
} from '../types/diagnostic.types';
import { SegmentId } from '../types/segment.types';
import { DomainError, ErrorCode } from '../errors';

export class DiagnosticService {
    constructor(private db: DbClient) { }

    /**
     * Load processes for a specific segment
     * Only returns processes applicable to the segment
     */
    async loadProcessesForSegment(segmentId: SegmentId): Promise<Process[]> {
        const data = await this.db.getProcessesBySegment(segmentId);

        return data.map((p) => ({
            process_id: p.process_id,
            area_id: p.area_id,
            segment_id: p.segment_id as SegmentId,
            name: p.name,
            description: p.description,
            display_order: p.display_order,
            created_at: new Date(p.created_at),
        }));
    }

    /**
     * Load current version questions for a process
     */
    async loadQuestionsForProcess(processId: string): Promise<Question[]> {
        const data = await this.db.getQuestionsByProcess(processId);

        return data.map((q) => ({
            question_id: q.question_id,
            process_id: q.process_id,
            question_text: q.question_text,
            version: q.version,
            valid_from: new Date(q.valid_from),
            valid_to: q.valid_to ? new Date(q.valid_to) : null,
            is_current: q.is_current,
            created_at: new Date(q.created_at),
        }));
    }

    /**
     * Record a diagnostic response
     * Ensures no duplicate responses for the same question
     */
    async recordResponse(input: RecordResponseInput): Promise<DiagnosticResponse> {
        // Check for existing response
        const existing = await this.db.getExistingResponse(input.cycle_id, input.question_id);

        if (existing) {
            throw new DomainError({
                code: ErrorCode.RESPONSE_ALREADY_EXISTS,
                message: 'Response already recorded for this question',
                entity: 'diagnostic_response',
                entityId: existing.response_id,
            });
        }

        // Insert response
        const result = await this.db.createDiagnosticResponse({
            assessment_cycle_id: input.cycle_id,
            question_id: input.question_id,
            answer_option_id: input.answer_option_id,
            responded_at: new Date().toISOString(),
        });

        return {
            response_id: result.response_id,
            assessment_cycle_id: result.assessment_cycle_id,
            question_id: result.question_id,
            answer_option_id: result.answer_option_id,
            responded_at: new Date(result.responded_at),
            created_at: new Date(result.created_at),
        };
    }

    /**
     * Check if diagnostic is complete
     * Verifies all questions for all processes have been answered
     */
    async isDiagnosticComplete(cycleId: string): Promise<boolean> {
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
                entityId: companyId,
            });
        }

        // Get all process IDs for the segment
        const processIds = await this.db.getProcessIdsBySegment(segmentId);

        // Count total questions for segment
        const totalQuestions = await this.db.countQuestionsByProcessIds(processIds);

        // Count answered questions
        const answeredQuestions = await this.db.countResponsesByCycle(cycleId);

        return totalQuestions === answeredQuestions;
    }
}
