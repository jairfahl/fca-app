# FULL Relatórios e Versionamento — Schema

## Objetivo

- **Relatório PDF completo** ao concluir o FULL (diagnóstico + recomendações + ações + evidências + ganhos)
- **Refazer diagnóstico** (2º, 3º…) e **comparar evolução** entre versões/ciclos
- **DB soberano**: nada recalcula retroativamente; cada versão mantém seu snapshot

## Versionamento

### full_assessments (colunas adicionadas em 027)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `full_version` | INT NOT NULL | Sequência 1..N por company. Refazer = nova versão. |
| `parent_full_assessment_id` | UUID NULL | Versão anterior (para comparação de evolução). |
| `closed_at` | TIMESTAMPTZ NULL | Momento em que o ciclo foi fechado (status CLOSED). |

**Unicidade:** `(company_id, full_version)` único.

### Identificar versão atual e anteriores

```sql
-- Versão atual (maior full_version da company)
SELECT * FROM full_assessments
WHERE company_id = $1
ORDER BY full_version DESC
LIMIT 1;

-- Versões anteriores (para comparação)
SELECT * FROM full_assessments
WHERE company_id = $1
  AND full_version < $2
ORDER BY full_version DESC;
```

## Snapshot do diagnóstico (028)

Tabela `full_diagnostic_snapshot` — gravada no **SUBMIT** e atualizada no **CLOSE**.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `company_id` | UUID | |
| `full_assessment_id` | UUID | UNIQUE — um snapshot por assessment |
| `full_version` | INT | Cópia para queries rápidas |
| `segment` | TEXT | C/I/S |
| `processes` | JSONB | Scores/bandas por processo |
| `raios_x` | JSONB | `{vazamentos: [...], alavancas: [...]}` |
| `recommendations` | JSONB | Recomendações derivadas |
| `plan` | JSONB | 3 ações (dono, métrica, checkpoint, status) |
| `evidence_summary` | JSONB | Antes/depois + ganho declarado por ação |

**Regra:** Snapshot não inventa dados; grava apenas o que existe no momento do SUBMIT/CLOSE. Textos finais renderizáveis vêm do catálogo/estrutura canônica; fallbacks marcados com `is_fallback`.

**Implementação:** `apps/api/src/lib/fullSnapshot.js` — `persistSnapshotOnSubmit` (SUBMIT) e `persistSnapshotOnClose` (CLOSE).

## Relatórios PDF (029)

Tabela `full_reports` — artefatos de geração de PDF.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `company_id` | UUID | |
| `full_assessment_id` | UUID | |
| `full_version` | INT | |
| `status` | TEXT | PENDING \| READY \| FAILED |
| `generated_at` | TIMESTAMPTZ | Quando foi gerado (READY) |
| `file_path` | TEXT | Caminho no storage (ou null se bytea) |
| `checksum` | TEXT | Integridade |
| `meta` | JSONB | pages, locale, template_version |
| `error` | TEXT | Mensagem se FAILED |

**Unicidade:** `(company_id, full_assessment_id)` — um relatório por assessment.

**Re-gerável:** PDF pode ser reconstruído a partir do `full_diagnostic_snapshot`; `file_path` armazena o binário pronto para download quando disponível.

## Comparação entre versões

**Preferência: on-the-fly** a partir dos snapshots. Não há tabela `full_comparisons` separada.

```sql
-- Comparar versão N com N-1
SELECT
  a.full_version,
  a.processes,
  a.raios_x,
  a.plan,
  a.evidence_summary
FROM full_diagnostic_snapshot a
JOIN full_assessments fa ON fa.id = a.full_assessment_id
WHERE fa.company_id = $1
  AND fa.full_version IN ($2, $3)
ORDER BY fa.full_version;
```

## Migrações

| Migração | Arquivo | Descrição |
|----------|---------|-----------|
| 027 | `027_full_versioning.sql` | full_version, parent_full_assessment_id, closed_at em full_assessments |
| 028 | `028_full_diagnostic_snapshot.sql` | Snapshot por versão (processes, raios_x, plan, evidence_summary) |
| 029 | `029_full_reports.sql` | Relatórios PDF (status PENDING/READY/FAILED) |

## Fluxo de dados

1. **SUBMIT** → grava/atualiza `full_diagnostic_snapshot` (processes, raios_x, recommendations, plan vazio ou parcial)
2. **CLOSE** → atualiza `full_diagnostic_snapshot` (plan completo, evidence_summary); define `closed_at` em full_assessments
3. **Geração PDF** → cria/atualiza `full_reports` (status PENDING → READY ou FAILED)
4. **Refazer** → novo `full_assessments` com `full_version = max+1`, `parent_full_assessment_id = anterior`

## API

Ver `docs/FULL_REPORTS_API.md` para endpoints REST.
