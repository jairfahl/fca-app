import { z } from 'zod'

export const CreateCompanyRequest = z.object({
    name: z.string().trim().min(1, 'name is required'),
    segment: z.string().trim().min(1, 'segment is required')
})

export type CreateCompanyRequestDTO = z.infer<typeof CreateCompanyRequest>
