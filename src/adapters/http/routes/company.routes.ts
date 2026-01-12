import { Router, Request, Response, NextFunction } from 'express'
import { CreateCompanyRequest } from '../dtos/company.dto'
import { RequestContextService } from '../../../application/services/request-context.service'
import { ReadModelService } from '../../../application/services/read-model.service'
import { authMiddleware } from '../middlewares/auth.middleware'

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

    // ...

    router.get('/me', authMiddleware, (req: Request, res: Response) => {
        // Mock response for now as services are not connected
        res.json({
            id: 'c0000000-0000-0000-0000-000000000001',
            name: 'QA Test Company',
            segment: 'QA Segment',
            user_id: (req as any).userId
        })
    })

    return router
}
