import { randomUUID } from 'crypto'
import { Request, Response, NextFunction } from 'express'

export function requestIdMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).requestId = requestId
    res.setHeader('x-request-id', requestId)
    next()
}
