import { Request, Response, NextFunction } from 'express'

export function loggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const start = Date.now()

    res.on('finish', () => {
        const duration = Date.now() - start
        const userId = (req as any).userId || null

        console.log(JSON.stringify({
            request_id: (req as any).requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            user_id: userId,
            duration_ms: duration,
            timestamp: new Date().toISOString()
        }))
    })

    next()
}
