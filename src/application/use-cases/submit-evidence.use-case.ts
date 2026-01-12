import { DomainError, ErrorCode } from '../../domain/errors/domain-error';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';

export interface SubmitEvidenceInput {
    selectedActionId: string;
    cycleId: string;
    companyId: string;
    content: string;
    userId: string;
}

export class SubmitEvidenceUseCase {
    constructor(
        private actionEvidenceRepository: ActionEvidenceRepository,
        private authorizationRepository: SelectedActionAuthorizationRepository
    ) { }

    async execute(input: SubmitEvidenceInput): Promise<void> {
        await this.authorizationRepository.assertBelongsToCompanyAndCycle({
            selectedActionId: input.selectedActionId,
            companyId: input.companyId,
            cycleId: input.cycleId
        });

        if (!input.content || input.content.trim().length === 0) {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Evidence content cannot be empty'
            });
        }

        await this.actionEvidenceRepository.add({
            selectedActionId: input.selectedActionId,
            cycleId: input.cycleId,
            companyId: input.companyId,
            content: input.content,
            createdBy: input.userId
        });
    }
}
