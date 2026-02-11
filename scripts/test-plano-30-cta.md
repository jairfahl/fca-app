# Teste: CTA Plano de 30 dias

## Critério de aceitação

- **Antes de concluir os 4:** CTA permanece "Continuar: montar Plano 30 dias" (data-testid="cta-montar-plano-30")
- **Após concluir os 4:** CTA muda para "Visualizar plano de 30 dias" (data-testid="cta-visualizar-plano-30")
- **Ao clicar:** usuário vê o plano de 30 dias consolidado em `/plano-30-dias`

## Passos para reproduzir

1. Fazer login e completar diagnóstico LIGHT
2. Ir para `/recommendations?assessment_id=...&company_id=...`
3. Selecionar 4 ações (1 por processo)
4. Verificar: botão "Continuar: montar Plano 30 dias" visível
5. Clicar em "Abrir plano (Comercial)" e salvar plano 30d
6. Voltar para recomendações
7. Repetir para Operações, Adm/Fin, Gestão (3 planos restantes)
8. Após salvar o 4º plano e voltar: CTA deve mudar para "Visualizar plano de 30 dias"
9. Clicar: navega para `/plano-30-dias` com os 4 planos exibidos

## Regra all_done

O backend retorna `all_done: true` quando:
- Os 4 processos (COMERCIAL, OPERACOES, ADM_FIN, GESTAO) têm `exists: true` E `has_plan_30d: true`
- `exists` = free_action criada
- `has_plan_30d` = light_action_plan salvo (step_1, step_2, step_3, etc.)
