import { IagoService } from '../../domain/services/iago.service';
import { IDiagnosticRepository } from '../repositories/diagnostic.repository.interface';
import { IagoHypothesisResult } from '../../domain/types/iago.types';

export class FormulateHypothesesUseCase {
    constructor(
        private iagoService: IagoService,
        private diagnosticRepository: IDiagnosticRepository
    ) { }

    async execute(cycleId: string, report: string): Promise<IagoHypothesisResult> {
        // 1. Fetch Diagnostic Responses
        const responses = await this.diagnosticRepository.getResponsesByCycle(cycleId);

        // 2. Call Iago Service with Report + Responses
        return this.iagoService.formulateHypotheses(responses, report);
    }
}
