/**
 * ActionCatalogService Unit Tests
 */

import { ActionCatalogService } from './action-catalog.service';
import { DomainError } from '../errors';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('ActionCatalogService', () => {
    let service: ActionCatalogService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            getCurrentActions: jest.fn(),
            getActionsByRecommendation: jest.fn(),
            getActionById: jest.fn(),
            getActionsBySegment: jest.fn(),
        } as any;

        service = new ActionCatalogService(mockDb);
    });

    describe('getCurrentActions', () => {
        it('should return only current actions', async () => {
            mockDb.getCurrentActions.mockResolvedValue([
                {
                    action_catalog_id: 'a1',
                    recommendation_id: 'r1',
                    action_title: 'Action 1',
                    action_description: 'Desc 1',
                    version: 1,
                    valid_from: '2024-01-01',
                    valid_to: null,
                    is_current: true,
                    created_at: '2024-01-01',
                },
            ]);

            const actions = await service.getCurrentActions();

            expect(actions).toHaveLength(1);
            expect(actions[0].is_current).toBe(true);
            expect(mockDb.getCurrentActions).toHaveBeenCalled();
        });
    });

    describe('validateActionExists', () => {
        it('should return true if action exists', async () => {
            mockDb.getActionById.mockResolvedValue({
                action_catalog_id: 'a1',
                recommendation_id: 'r1',
                action_title: 'Action 1',
                action_description: 'Desc 1',
                version: 1,
                valid_from: '2024-01-01',
                valid_to: null,
                is_current: true,
                created_at: '2024-01-01',
            });

            const exists = await service.validateActionExists('a1');

            expect(exists).toBe(true);
        });

        it('should return false if action does not exist', async () => {
            mockDb.getActionById.mockResolvedValue(null);

            const exists = await service.validateActionExists('a1');

            expect(exists).toBe(false);
        });
    });

    describe('getActionById', () => {
        it('should return action if found', async () => {
            mockDb.getActionById.mockResolvedValue({
                action_catalog_id: 'a1',
                recommendation_id: 'r1',
                action_title: 'Action 1',
                action_description: 'Desc 1',
                version: 1,
                valid_from: '2024-01-01',
                valid_to: null,
                is_current: true,
                created_at: '2024-01-01',
            });

            const action = await service.getActionById('a1');

            expect(action.action_catalog_id).toBe('a1');
        });

        it('should throw error if action not found', async () => {
            mockDb.getActionById.mockResolvedValue(null);

            await expect(service.getActionById('a1')).rejects.toThrow(DomainError);
        });
    });

    describe('getActionsBySegment', () => {
        it('should return actions for specific segment', async () => {
            mockDb.getActionsBySegment.mockResolvedValue([
                {
                    action_catalog_id: 'a1',
                    recommendation_id: 'r1',
                    action_title: 'Action for C',
                    action_description: 'Desc 1',
                    version: 1,
                    valid_from: '2024-01-01',
                    valid_to: null,
                    is_current: true,
                    created_at: '2024-01-01',
                },
            ]);

            const actions = await service.getActionsBySegment('C');

            expect(actions).toHaveLength(1);
            expect(mockDb.getActionsBySegment).toHaveBeenCalledWith('C');
        });
    });
});
