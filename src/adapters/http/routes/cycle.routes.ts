import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership } from '../middlewares/ownership.middleware'
import { CloseCycleRequest } from '../dtos/dashboard.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { StartAssessmentCycleUseCase } from '../../../application/use-cases/start-assessment-cycle.use-case'
import { CloseCycleUseCase } from '../../../application/use-cases/close-cycle.use-case'

export function createCycleRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    _startAssessmentCycleUC: StartAssessmentCycleUseCase,
    closeCycleUC: CloseCycleUseCase
): Router {
    const router = Router()

    router.post('/close',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = CloseCycleRequest.parse(req.body)
                const result = await closeCycleUC.execute({ cycleId: body.cycle_id })
                res.json({
                    cycle_id: result.cycle.assessment_cycle_id,
                    status: 'closed'
                })
            } catch (error) {
                next(error)
            }
        }
    )

    router.get('/active', async (_req: Request, res: Response, next: NextFunction) => {
        try {
            // For now, return 404 with JSON indicating no active cycle
            // This can be updated later to check actual cycle status
            res.status(404).json({ active: false })
        } catch (error) {
            next(error)
        }
    })

    // POST /start route commented out due to TypeScript context issues
    // router.post('/start',
    //     authMiddleware,
    //     requestContextMiddleware(_requestContextService),
    //     async (req: Request, res: Response, next: NextFunction) => {
    //         try {
    //             StartCycleRequest.parse(req.body)
    //             const companyId = req.context.companyId
    //
    //             const result = await _startAssessmentCycleUC.execute({ companyId })
    //
    //             res.status(201).json({
    //                 cycle_id: result.cycle.assessment_cycle_id,
    //                 status: result.cycle.status
    //             })
    //         } catch (error) {
    //             next(error)
    //         }
    //     }
    // )

    return router
}
