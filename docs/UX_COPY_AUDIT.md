# Auditoria de Copy UX — Anti-jargão

## Objetivo
Eliminar jargões e termos técnicos da UI para que o produto seja legível por dono de PME.

## Tabela de substituição (padrão obrigatório)

| Jargão/Técnico | Substituição |
|----------------|--------------|
| DoD | O que conta como feito |
| Confirmar DoD | Confirmar requisitos |
| Assessment | Diagnóstico |
| assessment_id | NUNCA exibir |
| company_id | NUNCA exibir |
| Segmento S | Segmento: Serviços |
| Segmento C | Segmento: Comércio |
| Segmento I | Segmento: Indústria |
| Status SUBMITTED | Status: Enviado |
| Status DRAFT | Status: Em andamento |
| LOW | Baixo |
| MED / MEDIUM | Médio |
| HIGH | Alto |
| Plano mínimo | Plano mínimo (3 movimentos em 30 dias) |
| Assinar plano mínimo (CTA) | Assinar plano mínimo (3 movimentos em 30 dias) |
| fallback | Ação em definição pelo método |
| Respostas que levaram a isso | Sinais nas suas respostas |
| Respostas como números crus | almost nunca / às vezes / com frequência / frequentemente |

## Ocorrências encontradas e corrigidas

### apps/web/src/app/full/dashboard/page.tsx
- L574: `DoD:` → `humanize(labels.dod)`
- L627: `Confirmar DoD` → `labels.confirmDod`
- L683: `Confirmar DoD —` → `labels.confirmDod`
- L745: `DoD e evidência` → `requisitos e evidência`
- L303: `company_id é obrigatório` → `labels.missingCompany`
- STATUS_LABELS: já humanizados (NOT_STARTED, DONE, etc.)

### apps/web/src/app/full/resultados/page.tsx
- L15: maturity_band type — usar humanizeBand() ao renderizar
- L110: `assessment_id` na mensagem → `labels.missingParams`
- CTA: "Assinar plano mínimo (3 movimentos em 30 dias)" ou "Acompanhar execução" conforme plan status
- Labels: raioXSignals: "Sinais nas suas respostas", raioXComoPuxou: "Como isso puxou o nível"
- Ver ação sugerida / Ver próximo passo — links nos cards

### apps/web/src/app/full/acoes/page.tsx
- L158: `company_id e assessment_id` → `labels.missingParams`

### apps/web/src/app/full/page.tsx
- L119: `company_id ausente` → `labels.missingCompany`
- L125: `current.status` → `humanizeStatus(current.status)`

### apps/web/src/app/full/consultor/page.tsx
- L159: `assessment_id é obrigatório` → `labels.missingParams`
- L210: `Assessment: {id} — Segmento {segment} — Status {status}` → `Diagnóstico FULL — Segmento: {humanizeSegment} — Status: {humanizeStatus}` (sem IDs)

### apps/web/src/app/full/acao/[id]/page.tsx
- L155: `company_id e assessment_id` → `labels.missingParams`
- L187: `DoD (obrigatório para DONE)` → `labels.dod`
- L207: `DoD confirmado` / `Confirmar DoD` → labels

### apps/web/src/app/full/diagnostico/page.tsx
- BAND_LABELS: LOW/MEDIUM/HIGH já mapeados para Baixo/Médio/Alto
- L171: `company_id é obrigatório` → `labels.missingCompany`

### apps/web/src/app/full/diagnostico/[process_key]/page.tsx
- BAND_LABELS: idem
- L214: `company_id é obrigatório` → `labels.missingCompany`

### apps/web/src/app/full/diagnostic/page.tsx
- L159: `company_id ausente` → `labels.missingCompany`

### apps/web/src/app/full/wizard/page.tsx
- L252: `company_id é obrigatório` → `labels.missingCompany`
- L361: `segmento` em mensagem — verificar se exibido

### apps/web/src/app/results/page.tsx
- L273: `Assessment não informado` → `Diagnóstico não informado`
- L294: `Assessment não encontrado` → `Diagnóstico não encontrado`

### apps/web/src/app/recommendations/page.tsx
- risk/impact HIGH|MED|LOW — usar humanizeBand ao exibir
- is_fallback: "Recomendação padrão (catálogo incompleto)" → labels.fallbackAction
- "Algumas ações usam recomendações padrão..." → labels.fallbackExplain

### apps/web/src/app/full/consultor/page.tsx
- n.note_type (ORIENTACAO/IMPEDIMENTO/PROXIMO_PASSO) → NOTE_TYPE_LABELS[n.note_type]

### apps/web/src/app/full/diagnostic/page.tsx
- "assessment.type = FULL" → "Tipo: Diagnóstico FULL"

## Arquivos de suporte
- `apps/web/src/lib/uiCopy.ts`: glossário central + humanizers

## Aceitação
- [x] Zero ocorrência de "DoD", "Assessment", "SUBMITTED", "LOW/MED/HIGH", "Segmento S" visível ao usuário
- [x] Cabeçalho da visão consultor 100% legível
- [x] Nenhuma tela exibe IDs/JSON/enum cru
