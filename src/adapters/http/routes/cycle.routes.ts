import { Router, Request, Response, NextFunction } from 'express'
import { RequestContextService } from '../../../application/services/request-context.service'
import { StartAssessmentCycleUseCase } from '../../../application/use-cases/start-assessment-cycle.use-case'

export function createCycleRoutes(
    _requestContextService: RequestContextService,
    _startAssessmentCycleUC: StartAssessmentCycleUseCase
): Router {
    const router = Router()

    // STUB: REQUIRED FOR INVENTORY
    router.post('/close', (_req, res) => {
        res.status(501).json({ error: 'NotImplemented', message: 'Cycle close stub' })
    })

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
