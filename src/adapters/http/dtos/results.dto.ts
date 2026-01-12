import { z } from 'zod'

export const GetResultsRequest = z.object({
    cycle_id: z.string().uuid()
})

export type GetResultsRequestDTO = z.infer<typeof GetResultsRequest>
