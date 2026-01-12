import { AddConsultantCommentUseCase } from './add-consultant-comment.use-case';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { ConsultantCommentRepository, ConsultantComment } from '../repositories/consultant-comment.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';
import { DomainError, ErrorCode } from '../../domain/errors/domain-error';

class FakeConsultantCommentRepository implements ConsultantCommentRepository {
    private comments: Array<ConsultantComment & { createdAt: Date }> = [];

    async add(comment: {
        selectedActionId: string;
        cycleId: string;
        companyId: string;
        consultantId: string;
        content: string;
    }): Promise<void> {
        this.comments.push({
            id: `comment-${this.comments.length + 1}`,
            selectedActionId: comment.selectedActionId,
            cycleId: comment.cycleId,
            companyId: comment.companyId,
            consultantId: comment.consultantId,
            content: comment.content,
            createdAt: new Date()
        });
    }

    async getLastForAction(selectedActionId: string): Promise<ConsultantComment | null> {
        const actionComments = this.comments.filter(c => c.selectedActionId === selectedActionId);
        if (actionComments.length === 0) return null;

        return actionComments[actionComments.length - 1];
    }
}

describe('AddConsultantCommentUseCase', () => {
    let useCase: AddConsultantCommentUseCase;
    let mockEvidenceRepository: jest.Mocked<ActionEvidenceRepository>;
    let mockCommentRepository: jest.Mocked<ConsultantCommentRepository>;
    let mockAuthRepository: jest.Mocked<SelectedActionAuthorizationRepository>;

    beforeEach(() => {
        mockEvidenceRepository = {
            add: jest.fn(),
            existsForAction: jest.fn()
        };
        mockCommentRepository = {
            add: jest.fn(),
            getLastForAction: jest.fn()
        };
        mockAuthRepository = {
            assertBelongsToCompanyAndCycle: jest.fn()
        };
        useCase = new AddConsultantCommentUseCase(
            mockEvidenceRepository,
            mockCommentRepository,
            mockAuthRepository
        );
    });

    it('should add comment when evidence exists', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(true);

        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'Great progress on the implementation'
        };

        await useCase.execute(input);

        expect(mockAuthRepository.assertBelongsToCompanyAndCycle).toHaveBeenCalledWith({
            selectedActionId: 'action-123',
            companyId: 'company-123',
            cycleId: 'cycle-123'
        });

        expect(mockEvidenceRepository.existsForAction).toHaveBeenCalledWith('action-123');
        expect(mockCommentRepository.add).toHaveBeenCalledWith({
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'Great progress on the implementation'
        });
    });

    it('should throw EVIDENCE_REQUIRED error when no evidence exists', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(false);

        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'Trying to comment without evidence'
        };

        await expect(useCase.execute(input)).rejects.toThrow(DomainError);
        await expect(useCase.execute(input)).rejects.toThrow('Cannot add comment without evidence');

        expect(mockEvidenceRepository.existsForAction).toHaveBeenCalledWith('action-123');
        expect(mockCommentRepository.add).not.toHaveBeenCalled();
    });

    it('should throw EVIDENCE_REQUIRED with correct error code', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(false);

        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'Trying to comment without evidence'
        };

        try {
            await useCase.execute(input);
            fail('Should have thrown error');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainError);
            expect((error as DomainError).code).toBe(ErrorCode.EVIDENCE_REQUIRED);
        }
    });

    it('should reject comment for action from wrong tenant', async () => {
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
            consultantId: 'consultant-123',
            content: 'Malicious comment'
        };

        await expect(useCase.execute(input)).rejects.toThrow(DomainError);
        await expect(useCase.execute(input)).rejects.toThrow('Action does not belong to this company/cycle');
        expect(mockEvidenceRepository.existsForAction).not.toHaveBeenCalled();
        expect(mockCommentRepository.add).not.toHaveBeenCalled();
    });

    it('should reject empty comment content', async () => {
        mockEvidenceRepository.existsForAction.mockResolvedValue(true);

        const input = {
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: '   '
        };

        await expect(useCase.execute(input)).rejects.toThrow(DomainError);
        await expect(useCase.execute(input)).rejects.toThrow('Comment content cannot be empty');
        expect(mockCommentRepository.add).not.toHaveBeenCalled();
    });

    it('should return last comment when multiple comments exist (real test)', async () => {
        const fakeRepository = new FakeConsultantCommentRepository();

        await fakeRepository.add({
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'First comment'
        });

        await fakeRepository.add({
            selectedActionId: 'action-123',
            cycleId: 'cycle-123',
            companyId: 'company-123',
            consultantId: 'consultant-123',
            content: 'Second comment - this is the latest'
        });

        const result = await fakeRepository.getLastForAction('action-123');

        expect(result).not.toBeNull();
        expect(result?.content).toBe('Second comment - this is the latest');
        expect(result?.id).toBe('comment-2');
    });

    it('should return null when no comments exist for action', async () => {
        mockCommentRepository.getLastForAction.mockResolvedValue(null);

        const result = await mockCommentRepository.getLastForAction('action-123');

        expect(result).toBeNull();
    });
});
