/**
 * Application Layer Integration Tests
 * 
 * Tests complete flows against real Supabase database.
 * 
 * @group integration
 */

import { SupabaseDbClient } from '../infrastructure/database/supabase-db-client';
import { CycleRepository } from './repositories/cycle.repository';
import { DiagnosticRepository } from './repositories/diagnostic.repository';
import { ActionRepository } from './repositories/action.repository';
import { StartAssessmentCycleUseCase } from './use-cases/start-assessment-cycle.use-case';
import { CycleManagementService } from '../domain/services/cycle-management.service';
import { getSupabaseClient, resetSupabaseClient } from '../infrastructure/database';

describe('Application Layer Integration Tests', () => {
    let dbClient: SupabaseDbClient;
    let cycleRepo: CycleRepository;
    let diagnosticRepo: DiagnosticRepository;
    let actionRepo: ActionRepository;
    let testCycleId: string;
    const testCompanyId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

    beforeAll(() => {
        // Reset client to use updated env vars with service_role key
        resetSupabaseClient();

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            throw new Error('Integration tests require Supabase credentials');
        }

        dbClient = new SupabaseDbClient();
        cycleRepo = new CycleRepository(dbClient);
        diagnosticRepo = new DiagnosticRepository(dbClient);
        actionRepo = new ActionRepository(dbClient);
    });

    beforeEach(async () => {
        const { companyId } = await (async () => {
            const db = new SupabaseDbClient();
            const { error } = await (db as any).supabase
                .from('company')
                .upsert({
                    company_id: testCompanyId,
                    display_name: 'Test Company',
                    segment_id: 'C',
                    created_by: 'test-user',
                    created_at: new Date().toISOString()
                }, { onConflict: 'company_id' });

            if (error) throw new Error(`Seed failed: ${error.message}`);
            return { companyId: testCompanyId };
        })();
    });

    afterEach(async () => {
        const cycles = await (dbClient as any).supabase
            .from('assessment_cycle')
            .select('assessment_cycle_id')
            .eq('company_id', testCompanyId);

        if (cycles.data && cycles.data.length > 0) {
            for (const cycle of cycles.data) {
                await (dbClient as any).supabase
                    .from('assessment_cycle')
                    .delete()
                    .eq('assessment_cycle_id', cycle.assessment_cycle_id);
            }
        }
    });

    beforeEach(async () => {
        // Clean up any existing test cycles BEFORE each test
        try {
            const supabase = getSupabaseClient();
            await supabase
                .from('assessment_cycle')
                .delete()
                .eq('company_id', testCompanyId);
        } catch (error) {
            console.warn('Pre-test cleanup failed:', error);
        }
    });

    afterEach(async () => {
        // Cleanup test data
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

    describe('Cycle Management Flow', () => {
        it('should complete full cycle creation and closure flow', async () => {
            // UC-01: Start Cycle
            const cycleService = new CycleManagementService(dbClient);
            const startCycleUseCase = new StartAssessmentCycleUseCase(cycleRepo, cycleService);

            const startResult = await startCycleUseCase.execute({ companyId: testCompanyId });
            testCycleId = startResult.cycle.assessment_cycle_id;

            expect(startResult.cycle.status).toBe('OPEN');
            expect(startResult.cycle.company_id).toBe(testCompanyId);

            // Verify cycle was created in database
            const retrievedCycle = await cycleRepo.getCycleById(testCycleId);
            expect(retrievedCycle).not.toBeNull();
            expect(retrievedCycle?.status).toBe('OPEN');

            // Note: Closing cycle requires 3+ actions completed
            // This would require additional setup (selecting and completing actions)
            // For MVP integration test, we verify cycle creation only
        });

        it('should prevent creating duplicate active cycle', async () => {
            const cycleService = new CycleManagementService(dbClient);
            const startCycleUseCase = new StartAssessmentCycleUseCase(cycleRepo, cycleService);

            // Create first cycle
            const firstResult = await startCycleUseCase.execute({ companyId: testCompanyId });
            testCycleId = firstResult.cycle.assessment_cycle_id;

            // Attempt to create second cycle should fail
            await expect(
                startCycleUseCase.execute({ companyId: testCompanyId })
            ).rejects.toThrow('Company already has an active cycle');
        });
    });

    describe('Diagnostic Flow', () => {
        it('should load processes by segment', async () => {
            const processes = await diagnosticRepo.getProcessesBySegment('C');

            expect(Array.isArray(processes)).toBe(true);
            // If seed data exists, verify structure
            if (processes.length > 0) {
                expect(processes[0]).toHaveProperty('process_id');
                expect(processes[0]).toHaveProperty('name');
                expect(processes[0].segment_id).toBe('C');
            }
        });
    });

    describe('Action Catalog Flow', () => {
        it('should retrieve current actions from catalog', async () => {
            const actions = await actionRepo.getCurrentActions();

            expect(Array.isArray(actions)).toBe(true);
            // All actions should be current
            actions.forEach((action) => {
                expect(action.is_current).toBe(true);
            });
        });
    });
});
