import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import { UnauthorizedError } from '../errors'

const client = jwksClient({
    jwksUri: `${process.env.SUPABASE_URL}/auth/v1/jwks`
})

function getKey(header: any, callback: jwt.SigningKeyCallback): void {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            return callback(err)
        }
        const signingKey = key?.getPublicKey()
        callback(null, signingKey)
    })
}

export function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
        return next(new UnauthorizedError('MISSING_TOKEN', 'Authorization header required'))
    }

    const token = authHeader.substring(7)

    jwt.verify(
        token,
        getKey,
        {
            issuer: process.env.SUPABASE_URL,
            audience: 'authenticated',
            algorithms: ['RS256']
        },
        (err, decoded) => {
            if (err) {
                return next(new UnauthorizedError('INVALID_TOKEN', 'JWT validation failed'))
            }

            const payload = decoded as jwt.JwtPayload
            req.userId = payload.sub
            next()
        }
    )
}
