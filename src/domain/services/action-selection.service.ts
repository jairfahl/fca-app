/**
 * Action Selection Service
 * 
 * Enforces the critical 3-action selection business rule.
 * This is one of the core constraints of the FCA method.
 * 
 * Responsibility: Validate and record exactly 3 selected actions per cycle
 */

import {
    SelectActionsInput,
    ActionSelectionInput,
} from '../types/action.types';
import {
    invalidActionCountError,
    invalidSequenceError,
    DomainError,
    ErrorCode,
} from '../errors';

export class ActionSelectionService {
    /**
     * Validate that exactly 3 actions are provided
     * @throws DomainError if count is not 3
     */
    validateActionCount(actions: ActionSelectionInput[]): void {
        if (actions.length !== 3) {
            throw invalidActionCountError(actions.length);
        }
    }

    /**
     * Validate that action sequences are exactly [1, 2, 3]
     * @throws DomainError if sequences are invalid
     */
    validateActionSequence(actions: ActionSelectionInput[]): void {
        const sequences = actions.map((a) => a.sequence).sort((a, b) => a - b);
        const expected = [1, 2, 3];

        // Check for duplicates FIRST
        const uniqueSequences = new Set(sequences);
        if (uniqueSequences.size !== 3) {
            throw new DomainError({
                code: ErrorCode.DUPLICATE_ACTION_SEQUENCE,
                message: 'Duplicate sequence numbers are not allowed',
                context: { sequences },
            });
        }

        // Then validate the actual sequence values
        if (sequences.length !== expected.length ||
            !sequences.every((seq, idx) => seq === expected[idx])) {
            throw invalidSequenceError(sequences);
        }
    }

    /**
     * Validate that all action IDs are unique
     * @throws DomainError if duplicate action IDs are found
     */
    validateUniqueActions(actions: ActionSelectionInput[]): void {
        const actionIds = actions.map((a) => a.action_catalog_id);
        const uniqueIds = new Set(actionIds);

        if (uniqueIds.size !== actionIds.length) {
            throw new DomainError({
                code: ErrorCode.DUPLICATE_ACTION_ID,
                message: 'Cannot select the same action multiple times',
                context: { actionIds },
            });
        }
    }

    /**
     * Validate action selection input
     * Performs all validation rules:
     * - Exactly 3 actions
     * - Sequences are [1, 2, 3]
     * - All action IDs are unique
     * 
     * @throws DomainError if any validation fails
     */
    validateActionSelection(input: SelectActionsInput): void {
        this.validateActionCount(input.actions);
        this.validateActionSequence(input.actions);
        this.validateUniqueActions(input.actions);
    }
}
