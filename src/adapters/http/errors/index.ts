export class UnauthorizedError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'UnauthorizedError'
        this.code = code
    }
}

export class ForbiddenError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'ForbiddenError'
        this.code = code
    }
}

export class ValidationError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'ValidationError'
        this.code = code
    }
}

export class NotFoundError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'NotFoundError'
        this.code = code
    }
}

export class ConflictError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'ConflictError'
        this.code = code
    }
}
