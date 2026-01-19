import { Request, Response, NextFunction } from 'express'
import { AuthorizationService } from '../../../application/services/authorization.service'
import { ValidationError } from '../errors'

export function verifyCycleOwnership(
    authService: AuthorizationService
) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const cycleId = req.body.cycle_id || req.query.cycle_id

            if (!cycleId) {
                throw new ValidationError('MISSING_CYCLE_ID', 'cycle_id required')
            }

            const companyId = (req as any).context.companyId
            await authService.verifyCycleOwnership(cycleId, companyId)

            next()
        } catch (error) {
            next(error)
        }
    }
}

export function verifyActionOwnership(
    authService: AuthorizationService
) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const actionId = req.body.selected_action_id

            if (!actionId) {
                throw new ValidationError('MISSING_ACTION_ID', 'selected_action_id required')
            }

            const companyId = (req as any).context.companyId
            await authService.verifyActionOwnership(actionId, companyId)

            next()
        } catch (error) {
            next(error)
        }
    }
}
