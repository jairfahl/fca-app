/**
 * Database Error Mapper
 * 
 * Maps PostgreSQL/Supabase errors to domain errors
 */

import { PostgrestError } from '@supabase/supabase-js';
import { DomainError, ErrorCode } from '../../domain/errors';

/**
 * Map Supabase error to DomainError
 */
export function mapDatabaseError(error: PostgrestError | Error): DomainError {
    // Handle Supabase PostgrestError
    if ('code' in error && 'details' in error) {
        const pgError = error as PostgrestError;

        // Foreign key violation
        if (pgError.code === '23503') {
            return new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Referenced record does not exist',
                context: { details: pgError.details, hint: pgError.hint },
            });
        }

        // Unique violation
        if (pgError.code === '23505') {
            return new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Record already exists',
                context: { details: pgError.details },
            });
        }

        // Check violation
        if (pgError.code === '23514') {
            return new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Data violates database constraint',
                context: { details: pgError.details },
            });
        }

        // Not null violation
        if (pgError.code === '23502') {
            return new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Required field is missing',
                context: { details: pgError.details },
            });
        }

        // Generic database error
        return new DomainError({
            code: ErrorCode.INVALID_INPUT,
            message: pgError.message || 'Database operation failed',
            context: {
                code: pgError.code,
                details: pgError.details,
                hint: pgError.hint,
            },
        });
    }

    // Handle generic Error
    return new DomainError({
        code: ErrorCode.INVALID_INPUT,
        message: error.message || 'Unknown database error',
    });
}

/**
 * Wrap database query with error handling
 */
export async function withErrorHandling<T>(
    queryPromise: Promise<{ data: T | null; error: PostgrestError | null }>
): Promise<T> {
    const { data, error } = await queryPromise;

    if (error) {
        throw mapDatabaseError(error);
    }

    if (data === null) {
        throw new DomainError({
            code: ErrorCode.INVALID_INPUT,
            message: 'Query returned no data',
        });
    }

    return data;
}

/**
 * Wrap database query with error handling for array results
 * Allows null/empty results
 */
export async function withErrorHandlingArray<T>(
    queryPromise: Promise<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
    const { data, error } = await queryPromise;

    if (error) {
        throw mapDatabaseError(error);
    }

    return data || [];
}
