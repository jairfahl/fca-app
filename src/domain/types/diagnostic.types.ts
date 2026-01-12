/**
 * Diagnostic Types
 * 
 * Defines diagnostic inputs, outputs, and related entities.
 */

import { SegmentId } from './segment.types';
import { MaturityLevel } from './maturity.types';

export interface Process {
    process_id: string;
    area_id: string;
    segment_id: SegmentId;
    name: string;
    description: string | null;
    display_order: number;
    created_at: Date;
}

export interface Question {
    question_id: string;
    process_id: string;
    question_text: string;
    version: number;
    valid_from: Date;
    valid_to: Date | null;
    is_current: boolean;
    created_at: Date;
}

export interface AnswerOption {
    answer_option_id: string;
    question_id: string;
    option_text: string;
    score_value: number;
    display_order: number;
    created_at: Date;
}

export interface DiagnosticResponse {
    response_id: string;
    assessment_cycle_id: string;
    question_id: string;
    answer_option_id: string;
    responded_at: Date;
    created_at: Date;
}

export interface ProcessScore {
    process_score_id: string;
    assessment_cycle_id: string;
    process_id: string;
    score: number; // 0-100
    maturity_level: MaturityLevel;
    calculated_at: Date;
    created_at: Date;
}

export interface Recommendation {
    recommendation_id: string;
    process_id: string;
    maturity_level: MaturityLevel;
    recommendation_text: string;
    version: number;
    valid_from: Date;
    valid_to: Date | null;
    is_current: boolean;
    created_at: Date;
}

// Input/Output contracts per PROMPT 02

export interface StartDiagnosticInput {
    company_id: string;
    segment_id: SegmentId;
}

export interface StartDiagnosticOutput {
    cycle_id: string;
    processes: Process[];
}

export interface RecordResponseInput {
    cycle_id: string;
    question_id: string;
    answer_option_id: string;
}

export interface ProcessScoreOutput {
    process_id: string;
    score: number;
    maturity_band: MaturityLevel;
}

export interface CalculateScoresOutput {
    cycle_id: string;
    process_scores: ProcessScoreOutput[];
    overall_maturity: MaturityLevel;
}

export interface RecommendationOutput {
    recommendation_id: string;
    process_id: string;
    priority: number;
    recommendation_text: string;
}

export interface GenerateRecommendationsOutput {
    recommendations: RecommendationOutput[];
}
