import { z } from 'zod'

export const GetDashboardRequest = z.object({
    cycle_id: z.string().uuid()
})

export const SubmitEvidenceRequest = z.object({
    selected_action_id: z.string().uuid(),
    type: z.enum(['NOTE', 'FILE', 'LINK']),
    content: z.string().min(1).max(1000)
})

export const CloseCycleRequest = z.object({
    cycle_id: z.string().uuid()
})

export type GetDashboardRequestDTO = z.infer<typeof GetDashboardRequest>
export type SubmitEvidenceRequestDTO = z.infer<typeof SubmitEvidenceRequest>
export type CloseCycleRequestDTO = z.infer<typeof CloseCycleRequest>
