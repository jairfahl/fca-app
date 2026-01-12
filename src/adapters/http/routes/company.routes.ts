import { Router, Request, Response, NextFunction } from 'express'
import { CreateCompanyRequest } from '../dtos/company.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { ReadModelService } from '../../../application/services/read-model.service'

export function createCompanyRoutes(
    _requestContextService: RequestContextService,
    _readModelService: ReadModelService
): Router {
    const router = Router()

    router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = CreateCompanyRequest.parse(req.body)

            // Generate UUID for company
            const id = crypto.randomUUID()

            res.status(201).json({
                id,
                name: body.name,
                segment: body.segment
            })
        } catch (error) {
            // Zod validation errors
            if (error instanceof Error && error.name === 'ZodError') {
                const zodError = error as any
                const firstIssue = zodError.issues[0]
                res.status(400).json({
                    error: 'ValidationError',
                    message: firstIssue.message
                })
                return
            }
            next(error)
        }
    })

    router.get('/me', (_req: Request, res: Response) => {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        })
    })

    return router
}
