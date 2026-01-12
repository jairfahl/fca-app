import { z } from 'zod'

export const StartCycleRequest = z.object({})

export type StartCycleRequestDTO = z.infer<typeof StartCycleRequest>
