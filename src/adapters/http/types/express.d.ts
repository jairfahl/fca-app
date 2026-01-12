import 'express';

declare module 'express-serve-static-core' {
    interface Request {
        userId?: string;
        requestId: string;
        context: {
            userId: string;
            companyId: string;
        };
    }
}

export { };
