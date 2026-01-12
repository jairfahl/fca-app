import { DomainError, ErrorCode } from '../../domain/errors/domain-error';
import { CycleReadRepository } from '../repositories/cycle-read.repository.interface';
import { MaturityReadRepository } from '../repositories/maturity-read.repository.interface';
import { ActionReadRepository } from '../repositories/action-read.repository.interface';
import { EvidenceReadRepository } from '../repositories/evidence-read.repository.interface';
import { ConsultantCommentReadRepository } from '../repositories/consultant-comment-read.repository.interface';
import { CycleHistoryDTO } from '../dtos/mentorship-read.dto';

export interface GetCycleHistoryInput {
    companyId: string;
}

export class GetCycleHistoryUseCase {
    constructor(
        private cycleReadRepository: CycleReadRepository,
        private maturityReadRepository: MaturityReadRepository,
        private actionReadRepository: ActionReadRepository,
        private evidenceReadRepository: EvidenceReadRepository,
        private consultantCommentReadRepository: ConsultantCommentReadRepository
    ) { }

    async execute(input: GetCycleHistoryInput): Promise<CycleHistoryDTO[]> {
        if (!input.companyId) {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Company ID is required'
            });
        }

        const cycles = await this.cycleReadRepository.listClosedByCompany(input.companyId);

        const history: CycleHistoryDTO[] = [];

        for (const cycle of cycles) {
            if (cycle.status !== 'CLOSED' || !cycle.closedAt) {
                continue;
            }

            const overallScore = await this.maturityReadRepository.getOverallScore(cycle.cycleId);
            const scoresByArea = await this.maturityReadRepository.getAreaScores(cycle.cycleId);
            const actions = await this.actionReadRepository.listByCycle(cycle.cycleId);

            let evidenceCount = 0;
            let consultantCommentCount = 0;

            for (const action of actions) {
                evidenceCount += await this.evidenceReadRepository.countByAction(action.selectedActionId);
                consultantCommentCount += await this.consultantCommentReadRepository.countByAction(action.selectedActionId);
            }

            history.push({
                cycleId: cycle.cycleId,
                closedAt: cycle.closedAt,
                overallScore,
                scoresByArea,
                selectedActionsCount: actions.length,
                evidenceCount,
                consultantCommentCount
            });
        }

        return history.sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());
    }
}
