import express, { Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { requestIdMiddleware } from './middlewares/request-id.middleware'
import { loggerMiddleware } from './middlewares/logger.middleware'
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware'
import { createCompanyRoutes } from './routes/company.routes'
import { createCycleRoutes } from './routes/cycle.routes'
import { createDiagnosticRoutes } from './routes/diagnostic.routes'
import { createResultsRoutes } from './routes/results.routes'
import { createActionsRoutes } from './routes/actions.routes'
import { createDashboardRoutes } from './routes/dashboard.routes'
import { createQARoutes } from './routes/qa.routes'
import { SubmitDiagnosticUseCase } from '../../application/use-cases/submit-diagnostic.use-case'
import { SelectActionsForCycleUseCase } from '../../application/use-cases/select-actions-for-cycle.use-case'
import { CompleteActionUseCase } from '../../application/use-cases/complete-action.use-case'
import { SupabaseDbClient } from '../../infrastructure/database/supabase-db-client'
import { RequestContextService } from '../../application/services/request-context.service'
import { ReadModelService } from '../../application/services/read-model.service'
import { AuthorizationService } from '../../application/services/authorization.service'

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

    // Services
    const dbClient = new SupabaseDbClient()

    // Core Services
    const requestContextService = new RequestContextService(dbClient)
    const readModelService = new ReadModelService(dbClient)
    const authService = new AuthorizationService(dbClient)
    const submitDiagnosticUC = new SubmitDiagnosticUseCase(dbClient, readModelService)
    const selectActionsUC = new SelectActionsForCycleUseCase(dbClient)
    const completeActionUC = new CompleteActionUseCase(dbClient)

    // Domain Services
    const { CycleManagementService } = require('../../domain/services/cycle-management.service')
    const cycleService = new CycleManagementService(dbClient)

    // Use Cases
    const { CloseCycleUseCase } = require('../../application/use-cases/close-cycle.use-case')
    const closeCycleUC = new CloseCycleUseCase(cycleService)

    app.get('/health', (_req, res) => res.json({ ok: true }))

    // QA-only routes - only available when QA_MODE=true and not in production
    if (isQAMode) {
        app.use('/api/__qa', createQARoutes())
    }

    // Mount company routes at /api/companies
    app.use('/api/companies', createCompanyRoutes(null as any, null as any))

    // Mount cycle routes at /api/cycles
    app.use('/api/cycles', createCycleRoutes(requestContextService, authService, null as any, closeCycleUC))

    // Mount diagnostic routes
    app.use('/api/diagnostic', createDiagnosticRoutes(
        requestContextService,
        authService,
        readModelService,
        submitDiagnosticUC,
        null as any
    ))

    // Mount results routes
    app.use('/api/results', createResultsRoutes(
        requestContextService,
        authService,
        readModelService
    ))

    // Mount actions routes
    // Mount actions routes
    app.use('/api/actions', createActionsRoutes(
        requestContextService,
        authService,
        readModelService,
        selectActionsUC,
        completeActionUC
    ))

    // Mount dashboard routes
    app.use('/api/dashboard', createDashboardRoutes(
        requestContextService,
        authService,
        readModelService,
        null as any,
        closeCycleUC
    ))

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
