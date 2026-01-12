import { SubmitEvidenceUseCase } from './submit-evidence.use-case';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';
import { DomainError, ErrorCode } from '../../domain/errors/domain-error';

describe('SubmitEvidenceUseCase', () => {
    let useCase: SubmitEvidenceUseCase;
    let mockRepository: jest.Mocked<ActionEvidenceRepository>;
    let mockAuthRepository: jest.Mocked<SelectedActionAuthorizationRepository>;

    beforeEach(() => {
        mockRepository = {
            add: jest.fn(),
            existsForAction: jest.fn()
        };
        mockAuthRepository = {
            assertBelongsToCompanyAndCycle: jest.fn()
        };
        useCase = new SubmitEvidenceUseCase(mockRepository, mockAuthRepository);
    });

    it('should submit evidence successfully', async () => {
        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            content: 'Implemented sales tracking system',
            userId: 'user-123'
        };

        await useCase.execute(input);

        expect(mockAuthRepository.assertBelongsToCompanyAndCycle).toHaveBeenCalledWith({
            selectedActionId: 'action-123',
            companyId: 'company-123',
            cycleId: 'cycle-123'
        });

        expect(mockRepository.add).toHaveBeenCalledWith({
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            content: 'Implemented sales tracking system',
            createdBy: 'user-123'
        });
    });

    it('should reject evidence for action from wrong tenant', async () => {
        mockAuthRepository.assertBelongsToCompanyAndCycle.mockRejectedValue(
            new DomainError({
                code: ErrorCode.FORBIDDEN,
                message: 'Action does not belong to this company/cycle'
            })
        );

        const input = {
            selectedActionId: 'action-999',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            content: 'Malicious evidence',
            userId: 'user-123'
        };

        await expect(useCase.execute(input)).rejects.toThrow(DomainError);
        await expect(useCase.execute(input)).rejects.toThrow('Action does not belong to this company/cycle');
        expect(mockRepository.add).not.toHaveBeenCalled();
    });

    it('should reject empty evidence content', async () => {
        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            content: '   ',
            userId: 'user-123'
        };

        await expect(useCase.execute(input)).rejects.toThrow(DomainError);
        await expect(useCase.execute(input)).rejects.toThrow('Evidence content cannot be empty');
        expect(mockRepository.add).not.toHaveBeenCalled();
    });

    it('should not provide update or delete methods', () => {
        expect(mockRepository).not.toHaveProperty('update');
        expect(mockRepository).not.toHaveProperty('delete');
        expect(mockRepository).not.toHaveProperty('remove');
    });
});
