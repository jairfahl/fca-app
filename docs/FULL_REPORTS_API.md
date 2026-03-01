# FULL Relatórios e Versionamento — API

## Endpoints

### 1. GET /full/versions?company_id=...

Lista versões do diagnóstico FULL, ordenadas por `full_version` desc.

**Resposta 200:**
```json
[
  {
    "full_version": 2,
    "assessment_id": "uuid",
    "status": "CLOSED",
    "created_at": "2025-01-02T...",
    "closed_at": "2025-01-03T...",
    "answered_count": 48,
    "is_current": false
  },
  {
    "full_version": 1,
    "assessment_id": "uuid",
    "status": "DRAFT",
    "created_at": "2025-01-01T...",
    "closed_at": null,
    "answered_count": 0,
    "is_current": true
  }
]
```

- `is_current`: true para o DRAFT ou SUBMITTED ativo (se existir).

---

### 2. POST /full/versions/new?company_id=...

Refazer diagnóstico — cria novo DRAFT com `full_version = last+1`. Idempotente: se já existir DRAFT, retorna o existente.

**Regras:**
- Se existir DRAFT atual → 200 com o DRAFT existente (não cria duplicado).
- Se último estiver SUBMITTED com plano de ações → 400 "Conclua ou feche o ciclo atual antes de refazer o diagnóstico."

**Resposta 200:**
```json
{
  "full_version": 2,
  "assessment_id": "uuid",
  "is_new": true
}
```

---

### 3. GET /full/versions/:full_version/summary?company_id=...

Retorna snapshot do diagnóstico (full_diagnostic_snapshot).

**Resposta 200:**
```json
{
  "full_version": 1,
  "assessment_id": "uuid",
  "segment": "C",
  "processes": [{ "process_key": "COMERCIAL", "band": "LOW", "score_numeric": 3.5 }],
  "raios_x": { "vazamentos": [...], "alavancas": [...] },
  "recommendations": [...],
  "plan": [...],
  "evidence_summary": [...],
  "created_at": "...",
  "updated_at": "..."
}
```

**404:** Diagnóstico não encontrado ou snapshot ainda não disponível.

---

### 4. GET /full/compare?company_id=...&from=1&to=2

Compara duas versões.

**Resposta 200:**
```json
{
  "from_version": 1,
  "to_version": 2,
  "evolution_by_process": [
    {
      "process_key": "COMERCIAL",
      "from": { "band": "LOW", "score_numeric": 3.5 },
      "to": { "band": "MEDIUM", "score_numeric": 5.2 }
    }
  ],
  "raio_x_entered": ["Novo item no raio-x"],
  "raio_x_left": ["Item que saiu"],
  "actions_completed_previous": 3,
  "gains_declared_previous": [{ "action_key": "...", "title": "...", "declared_gain": "..." }]
}
```

---

### 5. POST /full/reports/generate?company_id=...&full_version=...

Gera relatório PDF de forma síncrona. Usa snapshot do DB como única fonte. Salva em `data/reports/{company_id}/{assessment_id}.pdf`.

**Pré-requisitos:**
- Diagnóstico SUBMITTED ou CLOSED
- Snapshot disponível (full_diagnostic_snapshot)

**Resposta 200:**
```json
{
  "report_id": "uuid",
  "status": "READY",
  "generated_at": "2025-01-03T..."
}
```

**400:** Diagnóstico não concluído — "Conclua o diagnóstico para gerar relatório."
**400:** Snapshot ausente — "Conclua o diagnóstico para gerar relatório."

---

### 6. GET /full/reports/status?company_id=...&full_version=...

Retorna status do relatório.

**Resposta 200:**
```json
{
  "status": "READY",
  "generated_at": "2025-01-03T...",
  "download_url": "/full/reports/download?company_id=...&full_version=1",
  "error": null
}
```

---

### 7. GET /full/reports/download?company_id=...&full_version=...

Stream do PDF a partir do arquivo em disco.

- **200:** PDF (Content-Type: application/pdf, Content-Disposition: attachment)
- **202:** "Relatório em geração. Tente novamente em instantes." (status PENDING)
- **500:** status FAILED com mensagem de erro

**Como gerar e baixar:**
1. `POST /full/reports/generate?company_id=...&full_version=...` — gera PDF síncrono
2. `GET /full/reports/download?company_id=...&full_version=...` — baixa o arquivo

---

## Conteúdo do PDF

- Capa: Empresa + "Diagnóstico FULL vN" + data
- Sumário
- Seção 1: Diagnóstico por processo (tabela bandas)
- Seção 2: Raio-X (vazamentos e alavancas — apenas itens com fit)
- Seção 3: Recomendações derivadas (omitidos fallbacks)
- Seção 4: Plano de 30 dias (3 ações)
- Seção 5: Evidências e ganhos declarados (se CLOSED)
- Seção 6: Comparação com versão anterior (se existir)

Rodapé: FCA-MTR + versão do template (meta.template_version).

---

## Autenticação e acesso

- Todos os endpoints requerem `requireAuth` e `requireFullEntitlement`.
- `ensureConsultantOrOwnerAccess` valida company_id (owner ou consultor com entitlement FULL).
- Mensagens de erro em linguagem de dono (sem jargões como "assessment").
