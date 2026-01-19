import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership } from '../middlewares/ownership.middleware'
import { GetSuggestionsRequest, SelectActionsRequest, completeActionSchema } from '../dtos/actions.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ReadModelService } from '../../../application/services/read-model.service'
import { SelectActionsForCycleUseCase } from '../../../application/use-cases/select-actions-for-cycle.use-case'
import { CompleteActionUseCase } from '../../../application/use-cases/complete-action.use-case'

export function createActionsRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService,
    selectActionsUC: SelectActionsForCycleUseCase,
    completeActionUseCase: CompleteActionUseCase
): Router {
    const router = Router()


    router.get('/suggestions',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const company_id = (req as any).context.companyId
                const { cycle_id } = GetSuggestionsRequest.parse(req.query)

                const result = await readModelService.getActionSuggestions(company_id, cycle_id)
                res.status(200).json(result)
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/select',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = SelectActionsRequest.parse(req.body)
                const userId = (req as any).context.userId

                const result = await selectActionsUC.execute({
                    cycleId: body.cycle_id,
                    userId,
                    selected: body.selected
                })

                res.status(201).json(result)
            } catch (error) {
                next(error)
            }
        }
    )

    // POST /complete - Update status & evidence
    router.post('/complete',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = completeActionSchema.parse(req.body);

                const result = await completeActionUseCase.execute({
                    actionId: body.action_id,
                    status: body.status as any,
                    evidenceText: body.evidence_text ?? null
                });

                res.status(200).json(result);
            } catch (error) {
                next(error);
            }
        }
    );

    return router
}
