import { z } from 'zod'

export const GetQuestionsRequest = z.object({
    cycle_id: z.string().uuid()
})

export const SubmitAnswerRequest = z.object({
    cycle_id: z.string().uuid(),
    question_id: z.string().uuid(),
    option_id: z.string().uuid()
})

export const FinishDiagnosticRequest = z.object({
    cycle_id: z.string().uuid()
})

export type GetQuestionsRequestDTO = z.infer<typeof GetQuestionsRequest>
export type SubmitAnswerRequestDTO = z.infer<typeof SubmitAnswerRequest>
export type FinishDiagnosticRequestDTO = z.infer<typeof FinishDiagnosticRequest>
