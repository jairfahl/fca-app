import { Request, Response, NextFunction } from 'express'
import { RequestContextService } from '../../../application/services/request-context.service'

export function requestContextMiddleware(
    requestContextService: RequestContextService
) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const userId = req.userId
            if (!userId) {
                throw new Error('User ID not found in request')
            }

            const companyId = await requestContextService.getCompanyForUser(userId)

            req.context = {
                userId,
                companyId
            }

            next()
        } catch (error) {
            next(error)
        }
    }
}
