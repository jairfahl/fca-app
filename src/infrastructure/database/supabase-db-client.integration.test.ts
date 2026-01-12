/**
 * SupabaseDbClient Integration Tests
 * 
 * Tests real database operations against Supabase.
 * These tests require a running Supabase instance with proper schema.
 * 
 * To run: npm test -- --testPathPattern=integration
 * 
 * @group integration
 */

import { SupabaseDbClient } from './supabase-db-client';
import { resetSupabaseClient } from './supabase.client';
import { getSupabaseClient } from './supabase.client';

describe('SupabaseDbClient Integration Tests', () => {
    let dbClient: SupabaseDbClient;
    let testCycleId: string;
    let testCompanyId: string;

    beforeAll(() => {
        // Reset client to force loading updated env vars
        resetSupabaseClient();

        // Verify Supabase credentials are set
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            throw new Error(
                'Integration tests require SUPABASE_URL and SUPABASE_ANON_KEY environment variables'
            );
        }

        dbClient = new SupabaseDbClient();
    });

    beforeEach(async () => {
        // Use valid UUID for test company
        testCompanyId = '00000000-0000-0000-0000-000000000001';
        // Don't delete all cycles here - let afterEach handle specific cleanup
    });

    afterEach(async () => {
        // Cleanup: Remove test data created during tests
        if (testCycleId) {
            try {
                const supabase = getSupabaseClient();
                await supabase
                    .from('assessment_cycle')
                    .delete()
                    .eq('assessment_cycle_id', testCycleId);
            } catch (error) {
                console.warn('Cleanup failed:', error);
            }
        }
    });

    describe('Cycle Operations', () => {
        it('should create and retrieve a cycle', async () => {
            // Test real INSERT operation
            const cycleData = {
                company_id: testCompanyId,
                status: 'in_progress',
                started_at: new Date().toISOString(),
            };

            const createdCycle = await dbClient.createCycle(cycleData);
            testCycleId = createdCycle.assessment_cycle_id;

            expect(createdCycle).toBeDefined();
            expect(createdCycle.company_id).toBe(testCompanyId);
            expect(createdCycle.status).toBe('in_progress');

            // Test real SELECT operation
            const retrievedCycle = await dbClient.getCycleById(testCycleId);

            expect(retrievedCycle).not.toBeNull();
            expect(retrievedCycle?.assessment_cycle_id).toBe(testCycleId);
            expect(retrievedCycle?.company_id).toBe(testCompanyId);
        });

        it('should update a cycle', async () => {
            // Create test cycle
            const cycleData = {
                company_id: testCompanyId,
                status: 'in_progress',
                started_at: new Date().toISOString(),
            };

            const createdCycle = await dbClient.createCycle(cycleData);
            testCycleId = createdCycle.assessment_cycle_id;

            // Test real UPDATE operation
            const updatedCycle = await dbClient.updateCycle(testCycleId, {
                status: 'completed',
                completed_at: new Date().toISOString(),
            });

            expect(updatedCycle.status).toBe('completed');
            expect(updatedCycle.completed_at).not.toBeNull();
        });
    });

    describe('Diagnostic Operations', () => {
        it('should retrieve processes by segment', async () => {
            // Test real SELECT with filter
            const processes = await dbClient.getProcessesBySegment('C');

            expect(Array.isArray(processes)).toBe(true);
            // If seed data exists, we should have processes
            if (processes.length > 0) {
                expect(processes[0]).toHaveProperty('process_id');
                expect(processes[0]).toHaveProperty('segment_id');
                expect(processes[0].segment_id).toBe('C');
            }
        });

        it('should count questions by process IDs', async () => {
            // Get real process IDs first
            const processes = await dbClient.getProcessesBySegment('C');

            if (processes.length > 0) {
                const processIds = processes.map((p) => p.process_id);
                const count = await dbClient.countQuestionsByProcessIds(processIds);

                expect(typeof count).toBe('number');
                expect(count).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('Action Catalog Operations', () => {
        it('should retrieve current actions', async () => {
            // Test real SELECT with filter
            const actions = await dbClient.getCurrentActions();

            expect(Array.isArray(actions)).toBe(true);
            // All returned actions should be current
            actions.forEach((action) => {
                expect(action.is_current).toBe(true);
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle non-existent cycle gracefully', async () => {
            // Use valid UUID format that doesn't exist
            const result = await dbClient.getCycleById('00000000-0000-0000-0000-999999999999');
            expect(result).toBeNull();
        });

        it('should throw error on invalid data', async () => {
            // Attempt to create cycle with invalid company_id
            await expect(
                dbClient.createCycle({
                    company_id: '', // Invalid
                    status: 'in_progress',
                    started_at: new Date().toISOString(),
                })
            ).rejects.toThrow();
        });
    });
});
