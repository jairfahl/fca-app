import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership, verifyActionOwnership } from '../middlewares/ownership.middleware'
import {
    GetDashboardRequest,
    SubmitEvidenceRequest,
    CloseCycleRequest
} from '../dtos/dashboard.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ReadModelService } from '../../../application/services/read-model.service'
import { UpdateActionProgressUseCase } from '../../../application/use-cases/update-action-progress.use-case'
import { CloseCycleUseCase } from '../../../application/use-cases/close-cycle.use-case'

export function createDashboardRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService,
    _updateActionProgressUC: UpdateActionProgressUseCase,
    closeCycleUC: CloseCycleUseCase
): Router {
    const router = Router()

    // STUB: REQUIRED FOR INVENTORY
    router.get('/', (_req, res) => {
        res.status(501).json({ error: 'NotImplemented', message: 'Dashboard stub' })
    })

    // STUB: REQUIRED FOR INVENTORY
    router.get('/status', (_req, res) => {
        res.status(501).json({ error: 'NotImplemented', message: 'Dashboard status stub' })
    })

    // STUB: REQUIRED FOR INVENTORY
    router.post('/cycles/close', (_req, res) => {
        res.status(501).json({ error: 'NotImplemented', message: 'Dashboard cycle close stub' })
    })

    router.get('/',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { cycle_id } = GetDashboardRequest.parse(req.query)
                const result = await readModelService.getDashboard(cycle_id)
                res.json(result)
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/evidence',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyActionOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                SubmitEvidenceRequest.parse(req.body)
                res.json({ ok: true })
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/cycles/close',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = CloseCycleRequest.parse(req.body)
                await closeCycleUC.execute({ cycleId: body.cycle_id })
                res.json({ ok: true })
            } catch (error) {
                next(error)
            }
        }
    )

    return router
}
