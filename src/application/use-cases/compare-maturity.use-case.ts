import { DomainError, ErrorCode } from '../../domain/errors/domain-error';
import { CycleReadRepository } from '../repositories/cycle-read.repository.interface';
import { MaturityReadRepository } from '../repositories/maturity-read.repository.interface';
import { MaturityComparisonDTO } from '../dtos/mentorship-read.dto';

export interface CompareMaturityInput {
    companyId: string;
    baseCycleId: string;
    targetCycleId: string;
}

export class CompareMaturityUseCase {
    constructor(
        private cycleReadRepository: CycleReadRepository,
        private maturityReadRepository: MaturityReadRepository
    ) { }

    async execute(input: CompareMaturityInput): Promise<MaturityComparisonDTO> {
        if (!input.companyId) {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Company ID is required'
            });
        }

        const baseCycle = await this.cycleReadRepository.getClosedById(input.baseCycleId);
        const targetCycle = await this.cycleReadRepository.getClosedById(input.targetCycleId);

        if (!baseCycle || baseCycle.status !== 'CLOSED') {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Base cycle must be CLOSED'
            });
        }

        if (!targetCycle || targetCycle.status !== 'CLOSED') {
            throw new DomainError({
                code: ErrorCode.INVALID_INPUT,
                message: 'Target cycle must be CLOSED'
            });
        }

        if (baseCycle.companyId !== input.companyId || targetCycle.companyId !== input.companyId) {
            throw new DomainError({
                code: ErrorCode.FORBIDDEN,
                message: 'Access denied to company data'
            });
        }

        const baseOverallScore = await this.maturityReadRepository.getOverallScore(input.baseCycleId);
        const targetOverallScore = await this.maturityReadRepository.getOverallScore(input.targetCycleId);

        const baseAreaScores = await this.maturityReadRepository.getAreaScores(input.baseCycleId);
        const targetAreaScores = await this.maturityReadRepository.getAreaScores(input.targetCycleId);

        const overallDelta = targetOverallScore - baseOverallScore;

        const areaDeltas: Record<string, number> = {};
        const allAreas = new Set([...Object.keys(baseAreaScores), ...Object.keys(targetAreaScores)]);

        for (const area of allAreas) {
            const baseScore = baseAreaScores[area] || 0;
            const targetScore = targetAreaScores[area] || 0;
            areaDeltas[area] = targetScore - baseScore;
        }

        let trend: 'IMPROVEMENT' | 'STAGNATION' | 'REGRESSION';
        if (overallDelta > 0) {
            trend = 'IMPROVEMENT';
        } else if (overallDelta === 0) {
            trend = 'STAGNATION';
        } else {
            trend = 'REGRESSION';
        }

        return {
            baseCycleId: input.baseCycleId,
            targetCycleId: input.targetCycleId,
            overallDelta,
            areaDeltas,
            trend
        };
    }
}
