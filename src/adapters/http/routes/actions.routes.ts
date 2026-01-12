import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership } from '../middlewares/ownership.middleware'
import { GetActionSuggestionsRequest, SelectActionsRequest } from '../dtos/actions.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ReadModelService } from '../../../application/services/read-model.service'
import { SelectActionsForCycleUseCase } from '../../../application/use-cases/select-actions-for-cycle.use-case'

export function createActionsRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService,
    selectActionsUC: SelectActionsForCycleUseCase
): Router {
    const router = Router()

    router.get('/suggestions',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { cycle_id } = GetActionSuggestionsRequest.parse(req.query)
                const actions = await readModelService.getActionSuggestions(cycle_id)
                res.json({ actions })
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
                const userId = req.context.userId

                await selectActionsUC.execute({
                    cycleId: body.cycle_id,
                    userId,
                    actions: body.actions.map(a => ({ action_catalog_id: a.action_id, sequence: a.sequence }))
                })

                res.json({ ok: true })
            } catch (error) {
                next(error)
            }
        }
    )

    return router
}
