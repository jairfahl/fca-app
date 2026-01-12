import express, { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { requestIdMiddleware } from './middlewares/request-id.middleware'
import { loggerMiddleware } from './middlewares/logger.middleware'
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware'
import { createCompanyRoutes } from './routes/company.routes'
import { createCycleRoutes } from './routes/cycle.routes'
import { createQARoutes } from './routes/qa.routes'

export function createServer(): Application {
    const app = express()

    // QA Mode check - must be explicitly enabled and never in production
    const isQAMode = process.env.QA_MODE === 'true' && process.env.NODE_ENV !== 'production'

    if (isQAMode) {
        console.log('⚠️  QA_MODE ENABLED - Test endpoints active. DO NOT USE IN PRODUCTION.')
    }

    const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173')
        .split(',')
        .map(o => o.trim())

    app.use(helmet())
    app.use(express.json({ limit: '100kb' }))
    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true)
            } else {
                callback(new Error('Not allowed by CORS'))
            }
        },
        credentials: true
    }))

    app.use(requestIdMiddleware)
    app.use(loggerMiddleware)

    app.get('/health', (_req, res) => res.json({ ok: true }))

    // QA-only routes - only available when QA_MODE=true and not in production
    if (isQAMode) {
        app.use('/qa', createQARoutes())
    }

    // Mount company routes at /api/companies
    // Pass null for services as they're not used by POST endpoint
    app.use('/api/companies', createCompanyRoutes(null as any, null as any))

    // Mount cycle routes at /api/cycles
    app.use('/api/cycles', createCycleRoutes(null as any, null as any))

    // 404 handler for API routes - must return JSON
    app.use((req, res, next): void => {
        if (req.path.startsWith('/api/')) {
            res.status(404).json({
                error: 'NotFound',
                message: req.path
            })
            return
        }
        next()
    })

    app.use(errorHandlerMiddleware)

    return app
}
