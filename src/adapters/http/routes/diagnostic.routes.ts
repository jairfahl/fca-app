import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requestContextMiddleware } from '../middlewares/request-context.middleware'
import { verifyCycleOwnership } from '../middlewares/ownership.middleware'
import {
    GetQuestionsRequest,
    SubmitAnswerRequest,
    FinishDiagnosticRequest
} from '../dtos/diagnostic.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ReadModelService } from '../../../application/services/read-model.service'
import { FinishDiagnosticUseCase } from '../../../application/use-cases/finish-diagnostic.use-case'

export function createDiagnosticRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService,
    finishDiagnosticUC: FinishDiagnosticUseCase
): Router {
    const router = Router()

    router.get('/questions',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { cycle_id } = GetQuestionsRequest.parse(req.query)
                const questions = await readModelService.getQuestionsForCycle(cycle_id)
                res.json({ questions })
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/answers',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                SubmitAnswerRequest.parse(req.body)
                res.json({ ok: true })
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/finish',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        verifyCycleOwnership(authService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = FinishDiagnosticRequest.parse(req.body)
                await finishDiagnosticUC.execute({ cycleId: body.cycle_id })
                res.json({ ok: true })
            } catch (error) {
                next(error)
            }
        }
    )

    return router
}
