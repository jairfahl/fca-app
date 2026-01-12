import { CalculateMaturityScoresUseCase } from './calculate-maturity-scores.use-case'
import { GenerateRecommendationsUseCase } from './generate-recommendations.use-case'

export class FinishDiagnosticUseCase {
    constructor(
        private calculateScoresUC: CalculateMaturityScoresUseCase,
        private generateRecommendationsUC: GenerateRecommendationsUseCase
    ) { }

    async execute(input: { cycleId: string }): Promise<void> {
        await this.calculateScoresUC.execute({ cycleId: input.cycleId })
        await this.generateRecommendationsUC.execute({ cycleId: input.cycleId })
    }
}
