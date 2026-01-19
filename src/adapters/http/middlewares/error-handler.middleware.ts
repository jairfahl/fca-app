import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { DomainError } from '../../../domain/errors/domain-error'

export function errorHandlerMiddleware(
    err: any,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    console.error('SERVER ERROR:', err)
    const requestId = (req as any).requestId

    let status = 500
    let errorCode = 'INTERNAL_ERROR'
    let message = 'Internal server error'
    let source: 'ADAPTER' | 'APPLICATION' | 'DOMAIN' = 'ADAPTER'

    if (err.name === 'UnauthorizedError') {
        status = 401
        errorCode = err.code
        message = err.message
        source = 'ADAPTER'
    } else if (err.name === 'ForbiddenError') {
        status = 403
        errorCode = err.code
        message = err.message
        source = 'APPLICATION'
    } else if (err.name === 'NotFoundError') {
        status = 404
        errorCode = err.code
        message = err.message
        source = 'APPLICATION'
    } else if (err.name === 'ConflictError') {
        status = 409
        errorCode = err.code
        message = err.message
        source = 'APPLICATION'
    } else if (err.name === 'ValidationError') {
        status = 400
        errorCode = err.code
        message = err.message
        source = 'ADAPTER'
    } else if (err instanceof z.ZodError) {
        status = 400
        errorCode = 'VALIDATION_ERROR'
        message = err.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')
        source = 'ADAPTER'
    } else if (err instanceof DomainError) {
        status = 409
        errorCode = err.code
        message = err.message
        source = 'DOMAIN'
    }

    res.status(status).json({
        error_code: errorCode,
        message,
        source,
        request_id: requestId
    })
}
