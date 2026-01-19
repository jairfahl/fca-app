
import { IagoService } from '../../domain/services/iago.service';
import { IagoReframingResult } from '../../domain/types/iago.types';

export class ReframingProblemUseCase {
    constructor(
        private iagoService: IagoService
    ) { }

    async execute(report: string): Promise<IagoReframingResult> {
        return this.iagoService.reframingProblem(report);
    }
}
