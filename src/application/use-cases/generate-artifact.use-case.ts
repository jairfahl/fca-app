
import { IagoService } from '../../domain/services/iago.service';
import { IagoArtifactResult, StructuralHypothesis } from '../../domain/types/iago.types';

export class GenerateArtifactUseCase {
    constructor(
        private iagoService: IagoService
    ) { }

    async execute(
        hypotheses: StructuralHypothesis[],
        diagnosticContext: string
    ): Promise<IagoArtifactResult> {
        return this.iagoService.generatePreliminaryArtifact(hypotheses, diagnosticContext);
    }
}
