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

import { SubmitDiagnosticUseCase } from '../../../application/use-cases/submit-diagnostic.use-case'
import { SubmitDiagnosticRequest } from '../dtos/diagnostic.dto'

export function createDiagnosticRoutes(
    requestContextService: RequestContextService,
    authService: AuthorizationService,
    readModelService: ReadModelService,
    submitDiagnosticUC: SubmitDiagnosticUseCase,
    finishDiagnosticUC: FinishDiagnosticUseCase
): Router {
    const router = Router()

    router.get('/status',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                // Manually parse optional query param since we don't have a specific DTO yet
                // and GetQuestionsRequest might enforce cycle_id
                const cycle_id = req.query.cycle_id as string | undefined
                const company_id = (req as any).context.companyId

                const result = await readModelService.getDiagnosticStatus(company_id, cycle_id)
                res.json(result)
            } catch (error) {
                next(error)
            }
        }
    )

    router.post('/submit',
        authMiddleware,
        requestContextMiddleware(requestContextService),
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const body = SubmitDiagnosticRequest.parse(req.body)
                const company_id = (req as any).context.companyId

                const result = await submitDiagnosticUC.execute({
                    cycleId: body.cycle_id,
                    companyId: company_id,
                    answers: body.answers,
                    finalize: body.finalize
                })

                if (result.assessment.status === 'completed') {
                    res.status(201).json(result)
                } else {
                    res.status(200).json(result)
                }
            } catch (error) {
                next(error)
            }
        }
    )

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
