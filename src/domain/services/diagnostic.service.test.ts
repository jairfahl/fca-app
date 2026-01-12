/**
 * DiagnosticService Unit Tests
 */

import { DiagnosticService } from './diagnostic.service';
import { ErrorCode } from '../errors';
import { DbClient } from '../../infrastructure/database/db-client.interface';

describe('DiagnosticService', () => {
    let service: DiagnosticService;
    let mockDb: jest.Mocked<DbClient>;

    beforeEach(() => {
        mockDb = {
            getProcessesBySegment: jest.fn(),
            getQuestionsByProcess: jest.fn(),
            getExistingResponse: jest.fn(),
            createDiagnosticResponse: jest.fn(),
            getCompanyIdByCycle: jest.fn(),
            getSegmentByCompany: jest.fn(),
            countQuestionsByProcessIds: jest.fn(),
            countResponsesByCycle: jest.fn(),
            getProcessIdsBySegment: jest.fn(),
        } as any;

        service = new DiagnosticService(mockDb);
    });

    describe('loadProcessesForSegment', () => {
        it('should load processes for segment C', async () => {
            mockDb.getProcessesBySegment.mockResolvedValue([
                {
                    process_id: 'p1',
                    area_id: 'a1',
                    segment_id: 'C',
                    name: 'Process 1',
                    description: 'Desc 1',
                    display_order: 1,
                    created_at: '2024-01-01T00:00:00Z',
                },
            ]);

            const processes = await service.loadProcessesForSegment('C');

            expect(processes).toHaveLength(1);
            expect(processes[0].segment_id).toBe('C');
        });

        it('should handle empty result', async () => {
            mockDb.getProcessesBySegment.mockResolvedValue([]);

            const processes = await service.loadProcessesForSegment('I');

            expect(processes).toHaveLength(0);
        });
    });

    describe('recordResponse', () => {
        it('should record new response', async () => {
            mockDb.getExistingResponse.mockResolvedValue(null);
            mockDb.createDiagnosticResponse.mockResolvedValue({
                response_id: 'resp-1',
                assessment_cycle_id: 'cycle-1',
                question_id: 'q1',
                answer_option_id: 'ans-1',
                responded_at: '2024-01-01T00:00:00Z',
                created_at: '2024-01-01T00:00:00Z',
            });

            const result = await service.recordResponse({
                cycle_id: 'cycle-1',
                question_id: 'q1',
                answer_option_id: 'ans-1',
            });

            expect(result.response_id).toBe('resp-1');
            expect(mockDb.createDiagnosticResponse).toHaveBeenCalled();
        });

        it('should throw error if response already exists', async () => {
            mockDb.getExistingResponse.mockResolvedValue({ response_id: 'existing' });

            await expect(
                service.recordResponse({
                    cycle_id: 'cycle-1',
                    question_id: 'q1',
                    answer_option_id: 'ans-1',
                })
            ).rejects.toMatchObject({
                code: ErrorCode.RESPONSE_ALREADY_EXISTS,
            });
        });
    });

    describe('isDiagnosticComplete', () => {
        it('should return true when all questions answered', async () => {
            mockDb.getCompanyIdByCycle.mockResolvedValue('company-1');
            mockDb.getSegmentByCompany.mockResolvedValue('C');
            mockDb.getProcessIdsBySegment.mockResolvedValue(['p1', 'p2']);
            mockDb.countQuestionsByProcessIds.mockResolvedValue(10);
            mockDb.countResponsesByCycle.mockResolvedValue(10);

            const result = await service.isDiagnosticComplete('cycle-1');

            expect(result).toBe(true);
        });

        it('should return false when questions missing', async () => {
            mockDb.getCompanyIdByCycle.mockResolvedValue('company-1');
            mockDb.getSegmentByCompany.mockResolvedValue('C');
            mockDb.getProcessIdsBySegment.mockResolvedValue(['p1']);
            mockDb.countQuestionsByProcessIds.mockResolvedValue(10);
            mockDb.countResponsesByCycle.mockResolvedValue(5);

            const result = await service.isDiagnosticComplete('cycle-1');

            expect(result).toBe(false);
        });
    });
});
