/**
 * Domain Error
 * 
 * Base class for all domain-level business rule violations.
 * Provides structured error codes and messages per PROMPT 02.
 */

export enum ErrorCode {
    // Cycle errors
    OPEN_CYCLE_EXISTS = 'OPEN_CYCLE_EXISTS',
    DUPLICATE_OPEN_CYCLE = 'DUPLICATE_OPEN_CYCLE',
    CYCLE_NOT_FOUND = 'CYCLE_NOT_FOUND',
    CYCLE_NOT_OPEN = 'CYCLE_NOT_OPEN',
    CYCLE_ALREADY_CLOSED = 'CYCLE_ALREADY_CLOSED',
    INSUFFICIENT_COMPLETED_ACTIONS = 'INSUFFICIENT_COMPLETED_ACTIONS',

    // Segment errors
    INVALID_SEGMENT = 'INVALID_SEGMENT',
    SEGMENT_NOT_FOUND = 'SEGMENT_NOT_FOUND',

    // Process errors
    PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
    PROCESS_NOT_FOR_SEGMENT = 'PROCESS_NOT_FOR_SEGMENT',

    // Question/Response errors
    QUESTION_NOT_FOUND = 'QUESTION_NOT_FOUND',
    INCOMPLETE_RESPONSES = 'INCOMPLETE_RESPONSES',
    RESPONSE_ALREADY_EXISTS = 'RESPONSE_ALREADY_EXISTS',
    INVALID_ANSWER_OPTION = 'INVALID_ANSWER_OPTION',

    // Score errors
    INVALID_SCORE = 'INVALID_SCORE',
    CALCULATION_ERROR = 'CALCULATION_ERROR',
    SCORE_NOT_CALCULATED = 'SCORE_NOT_CALCULATED',

    // Recommendation errors
    RECOMMENDATION_NOT_FOUND = 'RECOMMENDATION_NOT_FOUND',
    VERSION_MISMATCH = 'VERSION_MISMATCH',

    // Action errors
    ACTION_NOT_IN_CATALOG = 'ACTION_NOT_IN_CATALOG',
    ACTION_VERSION_EXPIRED = 'ACTION_VERSION_EXPIRED',
    ACTION_SEGMENT_MISMATCH = 'ACTION_SEGMENT_MISMATCH',
    ACTION_NOT_FROM_ASSESSMENT = 'ACTION_NOT_FROM_ASSESSMENT',
    ACTION_NOT_FOUND = 'ACTION_NOT_FOUND',

    // Action selection errors
    INVALID_ACTION_COUNT = 'INVALID_ACTION_COUNT',
    INVALID_SEQUENCE = 'INVALID_SEQUENCE',
    DUPLICATE_ACTION_SEQUENCE = 'DUPLICATE_ACTION_SEQUENCE',
    DUPLICATE_ACTION_ID = 'DUPLICATE_ACTION_ID',

    // Mentorship errors
    EVIDENCE_REQUIRED = 'EVIDENCE_REQUIRED',

    // General errors
    INVALID_INPUT = 'INVALID_INPUT',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
}

export interface DomainErrorDetails {
    code: ErrorCode;
    message: string;
    entity?: string;
    entityId?: string;
    context?: Record<string, unknown>;
}

export class DomainError extends Error {
    public readonly code: ErrorCode;
    public readonly entity?: string;
    public readonly entityId?: string;
    public readonly context?: Record<string, unknown>;
    public readonly timestamp: Date;

    constructor(details: DomainErrorDetails) {
        super(details.message);
        this.name = 'DomainError';
        this.code = details.code;
        this.entity = details.entity;
        this.entityId = details.entityId;
        this.context = details.context;
        this.timestamp = new Date();

        // Maintains proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DomainError);
        }
    }

    /**
     * Convert error to JSON for logging or API responses
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            entity: this.entity,
            entityId: this.entityId,
            context: this.context,
            timestamp: this.timestamp,
        };
    }
}

/**
 * Factory functions for common domain errors
 */

export function openCycleExistsError(companyId: string, cycleId: string): DomainError {
    return new DomainError({
        code: ErrorCode.OPEN_CYCLE_EXISTS,
        message: `Cannot start new diagnostic: company has an OPEN cycle`,
        entity: 'assessment_cycle',
        entityId: cycleId,
        context: { companyId },
    });
}

export function invalidSegmentError(segmentId: string): DomainError {
    return new DomainError({
        code: ErrorCode.INVALID_SEGMENT,
        message: `Invalid segment ID: must be 'C', 'I', or 'S'`,
        context: { segmentId },
    });
}

export function incompleteResponsesError(cycleId: string, missingCount: number): DomainError {
    return new DomainError({
        code: ErrorCode.INCOMPLETE_RESPONSES,
        message: `Diagnostic incomplete: ${missingCount} questions not answered`,
        entity: 'assessment_cycle',
        entityId: cycleId,
        context: { missingCount },
    });
}

export function invalidActionCountError(count: number): DomainError {
    return new DomainError({
        code: ErrorCode.INVALID_ACTION_COUNT,
        message: `Invalid action count: must select exactly 3 actions, received ${count}`,
        context: { count, required: 3 },
    });
}

export function invalidSequenceError(sequences: number[]): DomainError {
    return new DomainError({
        code: ErrorCode.INVALID_SEQUENCE,
        message: `Invalid action sequence: must be [1, 2, 3]`,
        context: { sequences, required: [1, 2, 3] },
    });
}

export function actionNotInCatalogError(actionId: string): DomainError {
    return new DomainError({
        code: ErrorCode.ACTION_NOT_IN_CATALOG,
        message: `Action not found in current catalog`,
        entity: 'action_catalog',
        entityId: actionId,
    });
}

export function cycleNotOpenError(cycleId: string, status: string): DomainError {
    return new DomainError({
        code: ErrorCode.CYCLE_NOT_OPEN,
        message: `Cycle is not OPEN: current status is ${status}`,
        entity: 'assessment_cycle',
        entityId: cycleId,
        context: { status },
    });
}

export function insufficientCompletedActionsError(
    cycleId: string,
    completedCount: number
): DomainError {
    return new DomainError({
        code: ErrorCode.INSUFFICIENT_COMPLETED_ACTIONS,
        message: `Cannot close cycle: only ${completedCount} actions completed, need 3`,
        entity: 'assessment_cycle',
        entityId: cycleId,
        context: { completedCount, required: 3 },
    });
}

export function recommendationNotFoundError(
    processId: string,
    maturityLevel: string
): DomainError {
    return new DomainError({
        code: ErrorCode.RECOMMENDATION_NOT_FOUND,
        message: `No recommendation found for process and maturity level`,
        context: { processId, maturityLevel },
    });
}

export function invalidScoreError(score: number): DomainError {
    return new DomainError({
        code: ErrorCode.INVALID_SCORE,
        message: `Invalid score: must be between 0 and 100`,
        context: { score, min: 0, max: 100 },
    });
}
