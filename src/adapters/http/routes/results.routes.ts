import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership } from '../middlewares/ownership.middleware'
import { GetResultsRequest } from '../dtos/results.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ReadModelService } from '../../../application/services/read-model.service'

export function createResultsRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService
): Router {
    const router = Router()

    router.get('/',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { cycle_id } = GetResultsRequest.parse(req.query)
                const result = await readModelService.getResultsForCycle(cycle_id)
                res.json(result)
            } catch (error) {
                next(error)
            }
        }
    )

    return router
}
