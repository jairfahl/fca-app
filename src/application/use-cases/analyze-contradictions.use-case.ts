import { IagoService } from '../../domain/services/iago.service';
import { IDiagnosticRepository } from '../repositories/diagnostic.repository.interface';
import { IEvidenceRepository } from '../repositories/evidence.repository.interface';
import { IagoAnalysisResult } from '../../domain/types/iago.types';

export class AnalyzeContradictionsUseCase {
    constructor(
        private iagoService: IagoService,
        private diagnosticRepository: IDiagnosticRepository,
        private evidenceRepository: IEvidenceRepository
    ) { }

    async execute(cycleId: string): Promise<IagoAnalysisResult> {
        // 1. Fetch Diagnostic Responses
        const responses = await this.diagnosticRepository.getResponsesByCycle(cycleId);

        // 2. Fetch Evidence (from all actions in the cycle)
        const evidences = await this.evidenceRepository.getEvidencesByCycle(cycleId);

        // 3. Analyze
        return this.iagoService.analyzeContradictions(responses, evidences);
    }
}
