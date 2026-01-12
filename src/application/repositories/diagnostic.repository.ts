/**
 * Diagnostic Repository Implementation
 */

import { IDiagnosticRepository } from './diagnostic.repository.interface';
import { DbClient } from '../../infrastructure/database/db-client.interface';
import { Process, Question, DiagnosticResponse } from '../../domain/types/diagnostic.types';
import { SegmentId } from '../../domain/types/segment.types';

export class DiagnosticRepository implements IDiagnosticRepository {
    constructor(private db: DbClient) { }

    async getProcessesBySegment(segmentId: SegmentId): Promise<Process[]> {
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

    async getQuestionsByProcess(processId: string): Promise<Question[]> {
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

    async saveResponse(
        cycleId: string,
        questionId: string,
        answerOptionId: string
    ): Promise<DiagnosticResponse> {
        // Check for existing response
        const existing = await this.db.getExistingResponse(cycleId, questionId);
        if (existing) {
            throw new Error('Response already exists for this question');
        }

        const result = await this.db.createDiagnosticResponse({
            assessment_cycle_id: cycleId,
            question_id: questionId,
            answer_option_id: answerOptionId,
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

    async isDiagnosticComplete(cycleId: string): Promise<boolean> {
        const companyId = await this.db.getCompanyIdByCycle(cycleId);
        if (!companyId) {
            throw new Error('Cycle not found');
        }

        const segmentId = await this.db.getSegmentByCompany(companyId);
        if (!segmentId) {
            throw new Error('Company not found');
        }

        const processIds = await this.db.getProcessIdsBySegment(segmentId);
        const totalQuestions = await this.db.countQuestionsByProcessIds(processIds);
        const answeredQuestions = await this.db.countResponsesByCycle(cycleId);

        return totalQuestions === answeredQuestions;
    }

    async getSegmentByCycle(cycleId: string): Promise<SegmentId | null> {
        const companyId = await this.db.getCompanyIdByCycle(cycleId);
        if (!companyId) {
            return null;
        }

        return await this.db.getSegmentByCompany(companyId);
    }
}
