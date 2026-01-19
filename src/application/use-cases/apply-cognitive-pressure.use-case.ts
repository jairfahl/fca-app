
import { IagoService } from '../../domain/services/iago.service';
import { IagoPressureResult } from '../../domain/types/iago.types';

export class ApplyCognitivePressureUseCase {
    constructor(
        private iagoService: IagoService
    ) { }

    async execute(
        evidence: string,
        status: string
    ): Promise<IagoPressureResult> {
        return this.iagoService.applyCognitivePressure(evidence, status);
    }
}
