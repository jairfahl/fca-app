/**
 * Database Client Interface
 * 
 * Internal contract for database operations.
 * Isolates domain services from external database SDK.
 */

import { SegmentId } from '../../domain/types/segment.types';

// Cycle operations
export interface CreateCycleData {
    company_id: string;
    status: string;
    started_at: string;
}

export interface CycleRecord {
    assessment_cycle_id: string;
    company_id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    created_at: string;
}

export interface UpdateCycleData {
    status?: string;
    completed_at?: string;
}

// Diagnostic operations
export interface ProcessRecord {
    process_id: string;
    area_id: string;
    segment_id: string;
    name: string;
    description: string;
    display_order: number;
    created_at: string;
}

export interface QuestionRecord {
    question_id: string;
    process_id: string;
    question_text: string;
    version: number;
    valid_from: string;
    valid_to: string | null;
    is_current: boolean;
    created_at: string;
}

export interface DiagnosticResponseRecord {
    response_id: string;
    assessment_cycle_id: string;
    question_id: string;
    answer_option_id: string;
    responded_at: string;
    created_at: string;
}

export interface CreateDiagnosticResponseData {
    assessment_cycle_id: string;
    question_id: string;
    answer_option_id: string;
    responded_at: string;
}

// Scoring operations
export interface AnswerWithScore {
    response_id: string;
    answer_option: {
        score_value: number;
    };
}

export interface ProcessScoreRecord {
    assessment_cycle_id: string;
    process_id: string;
    score: number;
    maturity_level: string;
    calculated_at: string;
}

// Recommendation operations
export interface ProcessScoreWithMaturity {
    process_id: string;
    maturity_level: string;
}

export interface RecommendationRecord {
    recommendation_id: string;
    process_id: string;
    maturity_level: string;
    recommendation_text: string;
    version: number;
    valid_from: string;
    valid_to: string | null;
    is_current: boolean;
    created_at: string;
}

// Action catalog operations
export interface ActionRecord {
    action_catalog_id: string;
    recommendation_id: string;
    action_title: string;
    action_description: string;
    version: number;
    valid_from: string;
    valid_to: string | null;
    is_current: boolean;
    created_at: string;
}

export interface ActionStatusRecord {
    status: string;
}

/**
 * DbClient Interface
 * 
 * Provides database operations for domain services.
 */
export interface DbClient {
    // Cycle operations
    createCycle(data: CreateCycleData): Promise<CycleRecord>;
    getActiveCycle(companyId: string): Promise<CycleRecord | null>;
    getCycleById(cycleId: string): Promise<CycleRecord | null>;
    updateCycle(cycleId: string, data: UpdateCycleData): Promise<CycleRecord>;
    getActionStatuses(cycleId: string): Promise<ActionStatusRecord[]>;
    updateActionStatus(actionId: string, status: string, completedAt?: string): Promise<void>;

    // Diagnostic operations
    getProcessesBySegment(segmentId: SegmentId): Promise<ProcessRecord[]>;
    getQuestionsByProcess(processId: string): Promise<QuestionRecord[]>;
    getExistingResponse(cycleId: string, questionId: string): Promise<{ response_id: string } | null>;
    createDiagnosticResponse(data: CreateDiagnosticResponseData): Promise<DiagnosticResponseRecord>;
    getCompanyIdByCycle(cycleId: string): Promise<string | null>;
    getSegmentByCompany(companyId: string): Promise<SegmentId | null>;
    countQuestionsByProcessIds(processIds: string[]): Promise<number>;
    countResponsesByCycle(cycleId: string): Promise<number>;

    // Scoring operations
    getQuestionIdsByProcess(processId: string): Promise<string[]>;
    getResponsesWithScores(cycleId: string, questionIds: string[]): Promise<AnswerWithScore[]>;
    saveProcessScores(scores: ProcessScoreRecord[]): Promise<void>;
    getProcessIdsBySegment(segmentId: SegmentId): Promise<string[]>;

    // Recommendation operations
    getProcessScoresByCycle(cycleId: string): Promise<ProcessScoreWithMaturity[]>;
    getRecommendation(processId: string, maturityLevel: string): Promise<RecommendationRecord | null>;

    // Action catalog operations
    getCurrentActions(): Promise<ActionRecord[]>;
    getActionsByRecommendation(recommendationId: string): Promise<ActionRecord[]>;
    getActionById(actionId: string): Promise<ActionRecord | null>;
    getActionsBySegment(segmentId: SegmentId): Promise<ActionRecord[]>;
}
