import { DomainError, ErrorCode } from '../../domain/errors/domain-error';
import { ActionEvidenceRepository } from '../repositories/action-evidence.repository.interface';
import { SelectedActionRepository } from '../repositories/selected-action.repository.interface';
import { SelectedActionAuthorizationRepository } from '../repositories/selected-action-authorization.repository.interface';

export interface MarkSelectedActionCompletedInput {
    selectedActionId: string;
    companyId: string;
    cycleId: string;
}

export class MarkSelectedActionCompletedUseCase {
    constructor(
        private actionEvidenceRepository: ActionEvidenceRepository,
        private selectedActionRepository: SelectedActionRepository,
        private authorizationRepository: SelectedActionAuthorizationRepository
    ) { }

    async execute(input: MarkSelectedActionCompletedInput): Promise<void> {
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
                message: 'Action cannot be completed without evidence',
                context: { selectedActionId: input.selectedActionId }
            });
        }

        await this.selectedActionRepository.markAsCompleted(input.selectedActionId);
    }
}
