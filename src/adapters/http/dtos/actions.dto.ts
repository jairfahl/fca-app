import { z } from 'zod'

export const GetActionSuggestionsRequest = z.object({
    cycle_id: z.string().uuid()
})

export const SelectActionsRequest = z.object({
    cycle_id: z.string().uuid(),
    actions: z.array(z.object({
        action_id: z.string().uuid(),
        sequence: z.number().int().min(1).max(3)
    })).length(3)
})

export type GetActionSuggestionsRequestDTO = z.infer<typeof GetActionSuggestionsRequest>
export type SelectActionsRequestDTO = z.infer<typeof SelectActionsRequest>
