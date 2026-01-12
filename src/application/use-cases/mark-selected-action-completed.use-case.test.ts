import { MarkSelectedActionCompletedUseCase } from './mark-selected-action-completed.use-case';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { SelectedActionRepository } from '../repositories/selected-action.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';
import { DomainError, ErrorCode } from '../../domain/errors/domain-error';

describe('MarkSelectedActionCompletedUseCase', () => {
    let useCase: MarkSelectedActionCompletedUseCase;
    let mockEvidenceRepository: jest.Mocked<ActionEvidenceRepository>;
    let mockActionRepository: jest.Mocked<SelectedActionRepository>;
    let mockAuthRepository: jest.Mocked<SelectedActionAuthorizationRepository>;

    beforeEach(() => {
        mockEvidenceRepository = {
            add: jest.fn(),
            existsForAction: jest.fn()
        };
        mockActionRepository = {
            markAsCompleted: jest.fn()
        };
        mockAuthRepository = {
            assertBelongsToCompanyAndCycle: jest.fn()
        };
        useCase = new MarkSelectedActionCompletedUseCase(
            mockEvidenceRepository,
            mockActionRepository,
            mockAuthRepository
        );
    });

    it('should mark action as completed when evidence exists', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(true);

        await useCase.execute({
            selectedActionId: 'action-123',
            companyId: 'company-123',
            cycleId: 'cycle-123'
        });

        expect(mockAuthRepository.assertBelongsToCompanyAndCycle).toHaveBeenCalledWith({
            selectedActionId: 'action-123',
            companyId: 'company-123',
            cycleId: 'cycle-123'
        });

        expect(mockEvidenceRepository.existsForAction).toHaveBeenCalledWith('action-123');
        expect(mockActionRepository.markAsCompleted).toHaveBeenCalledWith('action-123');
    });

    it('should throw EVIDENCE_REQUIRED error when no evidence exists', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(false);

        await expect(
            useCase.execute({
                selectedActionId: 'action-123',
                companyId: 'company-123',
                cycleId: 'cycle-123'
            })
        ).rejects.toThrow(DomainError);

        await expect(
            useCase.execute({
                selectedActionId: 'action-123',
                companyId: 'company-123',
                cycleId: 'cycle-123'
            })
        ).rejects.toThrow('Action cannot be completed without evidence');

        expect(mockEvidenceRepository.existsForAction).toHaveBeenCalledWith('action-123');
        expect(mockActionRepository.markAsCompleted).not.toHaveBeenCalled();
    });

    it('should throw domain error with EVIDENCE_REQUIRED code', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(false);

        try {
            await useCase.execute({
                selectedActionId: 'action-123',
                companyId: 'company-123',
                cycleId: 'cycle-123'
            });
            fail('Should have thrown error');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainError);
            expect((error as DomainError).code).toBe(ErrorCode.EVIDENCE_REQUIRED);
        }
    });

    it('should reject completion for action from wrong tenant', async () => {
        mockAuthRepository.assertBelongsToCompanyAndCycle.mockRejectedValue(
            new DomainError({
                code: ErrorCode.FORBIDDEN,
                message: 'Action does not belong to this company/cycle'
            })
        );

        await expect(
            useCase.execute({
                selectedActionId: 'action-999',
                companyId: 'company-123',
                cycleId: 'cycle-123'
            })
        ).rejects.toThrow(DomainError);

        await expect(
            useCase.execute({
                selectedActionId: 'action-999',
                companyId: 'company-123',
                cycleId: 'cycle-123'
            })
        ).rejects.toThrow('Action does not belong to this company/cycle');

        expect(mockEvidenceRepository.existsForAction).not.toHaveBeenCalled();
        expect(mockActionRepository.markAsCompleted).not.toHaveBeenCalled();
    });
});
