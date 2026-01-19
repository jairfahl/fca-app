import { z } from 'zod'

export const GetSuggestionsRequest = z.object({
    cycle_id: z.string().uuid().optional()
})

export type GetSuggestionsRequestDTO = z.infer<typeof GetSuggestionsRequest>

export const SelectActionsRequest = z.object({
    cycle_id: z.string().uuid(),
    selected: z.array(
        z.object({
            recommendation_id: z.string().uuid()
        })
    ).min(1).max(3)
        .refine((items) => new Set(items.map(i => i.recommendation_id)).size === items.length, {
            message: "Duplicate recommendations are not allowed"
        })
})

export type SelectActionsRequest = z.infer<typeof SelectActionsRequest>

export const completeActionSchema = z.object({
    action_id: z.string().uuid(),
    status: z.enum(['nao_iniciada', 'em_andamento', 'concluida']),
    evidence_text: z.string().nullable().optional()
});

export interface CompleteActionRequest {
    actionId: string;
    status: 'nao_iniciada' | 'em_andamento' | 'concluida';
    evidenceText: string | null;
}
