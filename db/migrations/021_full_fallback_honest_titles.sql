-- Eliminar "Ação padrão X (Y)": usar títulos honestos para fallbacks
-- Prompt 4: fallback honesto ("Ação em definição pelo método")

UPDATE public.full_action_catalog
SET title = 'Ação em definição pelo método',
    benefit_text = 'Estamos finalizando esta recomendação.'
WHERE action_key LIKE 'fallback-%';

UPDATE public.full_recommendation_catalog
SET title = 'Recomendação em definição pelo método',
    owner_language_explanation = 'Estamos finalizando esta recomendação.'
WHERE recommendation_key LIKE 'fallback-%';
