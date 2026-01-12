import { DomainError, ErrorCode } from '../../domain/errors/domain-error';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { ConsultantCommentRepository } from '../repositories/consultant-comment.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';

export interface AddConsultantCommentInput {
    selectedActionId: string;
    cycleId: string;
    companyId: string;
    consultantId: string;
    content: string;
}

export class AddConsultantCommentUseCase {
    constructor(
        private actionEvidenceRepository: ActionEvidenceRepository,
        private consultantCommentRepository: ConsultantCommentRepository,
        private authorizationRepository: SelectedActionAuthorizationRepository
    ) { }

    async execute(input: AddConsultantCommentInput): Promise<void> {
        await this.authorizationRepository.assertBelongsToCompanyAndCycle({
            selectedActionId: input.selectedActionId,
            companyId: input.companyId,
            cycleId: input.cycleId
        });

        const hasEvidence = await this.actionEvidenceRepository.existsForAction(
            input.selectedActionId
        );

        if (!hasEvidence) {
            throw new DomainError({
                code: ErrorCode.EVIDENCE_REQUIRED,
                message: 'Cannot add comment without evidence for this action',
                context: { selectedActionId: input.selectedActionId }
            });
        }

        if (!input.content || input.content.trim().length === 0) {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Comment content cannot be empty'
            });
        }

        await this.consultantCommentRepository.add({
            selectedActionId: input.selectedActionId,
            cycleId: input.cycleId,
            companyId: input.companyId,
            consultantId: input.consultantId,
            content: input.content
        });
    }
}
