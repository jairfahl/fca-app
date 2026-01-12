import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const QA_TEST_USER_ID = '00000000-0000-0000-0000-000000000qa1'
const QA_TEST_COMPANY_ID = 'c0000000-0000-0000-0000-000000000001'

export function createQARoutes(): Router {
    const router = Router()

    // QA-only endpoint to get test token
    router.get('/token', (_req: Request, res: Response) => {
        // Generate a JWT token for QA testing
        // This mimics what Supabase would provide
        const payload = {
            sub: QA_TEST_USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'qa-test@example.com',
            company_id: QA_TEST_COMPANY_ID,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours
            iat: Math.floor(Date.now() / 1000)
        }

        // Use a deterministic secret for QA
        const secret = process.env.QA_JWT_SECRET || 'qa-test-secret-do-not-use-in-production'
        const token = jwt.sign(payload, secret, { algorithm: 'HS256' })

        res.json({
            access_token: token,
            user_id: QA_TEST_USER_ID,
            company_id: QA_TEST_COMPANY_ID,
            expires_in: 86400,
            note: 'QA-only token. Not valid for production use.'
        })
    })

    return router
}
