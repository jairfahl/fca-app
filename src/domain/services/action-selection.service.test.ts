/**
 * Action Selection Service Unit Tests
 */

import { ActionSelectionService } from './action-selection.service';
import { DomainError, ErrorCode } from '../errors';
import { ActionSelectionInput } from '../types/action.types';

describe('ActionSelectionService', () => {
    let service: ActionSelectionService;

    beforeEach(() => {
        service = new ActionSelectionService();
    });

    describe('validateActionCount', () => {
        it('should pass with exactly 3 actions', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a3', sequence: 3 },
            ];
            expect(() => service.validateActionCount(actions)).not.toThrow();
        });

        it('should throw error with 0 actions', () => {
            expect(() => service.validateActionCount([])).toThrow(DomainError);
            try {
                service.validateActionCount([]);
            } catch (error) {
                expect((error as DomainError).code).toBe(ErrorCode.INVALID_ACTION_COUNT);
            }
        });

        it('should throw error with 1 action', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
            ];
            expect(() => service.validateActionCount(actions)).toThrow(DomainError);
        });

        it('should throw error with 2 actions', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 2 },
            ];
            expect(() => service.validateActionCount(actions)).toThrow(DomainError);
        });

        it('should throw error with 4 actions', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a3', sequence: 3 },
                { action_catalog_id: 'a4', sequence: 4 },
            ];
            expect(() => service.validateActionCount(actions)).toThrow(DomainError);
        });
    });

    describe('validateActionSequence', () => {
        it('should pass with sequence [1, 2, 3]', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a3', sequence: 3 },
            ];
            expect(() => service.validateActionSequence(actions)).not.toThrow();
        });

        it('should pass with sequence [2, 1, 3] (order does not matter)', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a3', sequence: 3 },
            ];
            expect(() => service.validateActionSequence(actions)).not.toThrow();
        });

        it('should throw error with sequence [1, 2, 4]', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a3', sequence: 4 },
            ];
            expect(() => service.validateActionSequence(actions)).toThrow(DomainError);
            try {
                service.validateActionSequence(actions);
            } catch (error) {
                expect((error as DomainError).code).toBe(ErrorCode.INVALID_SEQUENCE);
            }
        });

        it('should throw error with sequence [0, 1, 2]', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 0 },
                { action_catalog_id: 'a2', sequence: 1 },
                { action_catalog_id: 'a3', sequence: 2 },
            ];
            expect(() => service.validateActionSequence(actions)).toThrow(DomainError);
        });

        it('should throw error with duplicate sequence [1, 1, 3]', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 1 },
                { action_catalog_id: 'a2', sequence: 1 },
                { action_catalog_id: 'a3', sequence: 3 },
            ];
            expect(() => service.validateActionSequence(actions)).toThrow(DomainError);
            try {
                service.validateActionSequence(actions);
            } catch (error) {
                expect((error as DomainError).code).toBe(ErrorCode.DUPLICATE_ACTION_SEQUENCE);
            }
        });

        it('should throw error with all duplicate sequences [2, 2, 2]', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'a1', sequence: 2 },
                { action_catalog_id: 'a2', sequence: 2 },
                { action_catalog_id: 'a3', sequence: 2 },
            ];
            expect(() => service.validateActionSequence(actions)).toThrow(DomainError);
        });
    });

    describe('validateUniqueActions', () => {
        it('should pass with unique action IDs', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'action-1', sequence: 1 },
                { action_catalog_id: 'action-2', sequence: 2 },
                { action_catalog_id: 'action-3', sequence: 3 },
            ];
            expect(() => service.validateUniqueActions(actions)).not.toThrow();
        });

        it('should throw error with duplicate action IDs', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'action-1', sequence: 1 },
                { action_catalog_id: 'action-1', sequence: 2 },
                { action_catalog_id: 'action-3', sequence: 3 },
            ];
            expect(() => service.validateUniqueActions(actions)).toThrow(DomainError);
            try {
                service.validateUniqueActions(actions);
            } catch (error) {
                expect((error as DomainError).code).toBe(ErrorCode.DUPLICATE_ACTION_ID);
            }
        });

        it('should throw error with all duplicate action IDs', () => {
            const actions: ActionSelectionInput[] = [
                { action_catalog_id: 'same-action', sequence: 1 },
                { action_catalog_id: 'same-action', sequence: 2 },
                { action_catalog_id: 'same-action', sequence: 3 },
            ];
            expect(() => service.validateUniqueActions(actions)).toThrow(DomainError);
        });
    });

    describe('validateActionSelection', () => {
        it('should pass with valid input', () => {
            const input = {
                cycle_id: 'cycle-123',
                user_id: 'user-123',
                actions: [
                    { action_catalog_id: 'action-1', sequence: 1 },
                    { action_catalog_id: 'action-2', sequence: 2 },
                    { action_catalog_id: 'action-3', sequence: 3 },
                ],
            };
            expect(() => service.validateActionSelection(input)).not.toThrow();
        });

        it('should throw error if action count is invalid', () => {
            const input = {
                cycle_id: 'cycle-123',
                user_id: 'user-123',
                actions: [
                    { action_catalog_id: 'action-1', sequence: 1 },
                    { action_catalog_id: 'action-2', sequence: 2 },
                ],
            };
            expect(() => service.validateActionSelection(input)).toThrow(DomainError);
        });

        it('should throw error if sequences are invalid', () => {
            const input = {
                cycle_id: 'cycle-123',
                user_id: 'user-123',
                actions: [
                    { action_catalog_id: 'action-1', sequence: 1 },
                    { action_catalog_id: 'action-2', sequence: 2 },
                    { action_catalog_id: 'action-3', sequence: 5 },
                ],
            };
            expect(() => service.validateActionSelection(input)).toThrow(DomainError);
        });

        it('should throw error if action IDs are not unique', () => {
            const input = {
                cycle_id: 'cycle-123',
                user_id: 'user-123',
                actions: [
                    { action_catalog_id: 'action-1', sequence: 1 },
                    { action_catalog_id: 'action-1', sequence: 2 },
                    { action_catalog_id: 'action-3', sequence: 3 },
                ],
            };
            expect(() => service.validateActionSelection(input)).toThrow(DomainError);
        });
    });
});
