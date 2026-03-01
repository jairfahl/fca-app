# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

### Development

```bash
# Start API + Web together (from repo root)
npm run dev

# Start individually
npm run dev --workspace=apps/api    # API on :3001
npm run dev --workspace=apps/web    # Web on :3000
```

### Testing

```bash
# API — run all tests
cd apps/api && npx jest

# API — run a single test file
cd apps/api && npx jest test/fullPdfReport.test.js --no-coverage

# API — run tests matching a name pattern
cd apps/api && npx jest --testNamePattern="DRAFT" --no-coverage

# Web — run all tests
cd apps/web && npm test

# Web — run in watch mode
cd apps/web && npm run test:watch
```

### Database

```bash
npm run db:migrate        # Apply pending SQL migrations
npm run db:seed           # Seed recommendations + FULL catalog
npm run db:seed:full      # Seed FULL catalog only (catalogs/full/*.json)
npm run db:seed:cause     # Seed cause taxonomy
```

### Health check

```bash
curl http://localhost:3001/ping
# → { ok: true, service: "api", db: { ok: true, now: "..." } }
```

### Auth utilities

```bash
npm run auth:bootstrap    # Create/update test users (fca@fca.com, consultor@fca.com, admin@fca.com, senha123)
npm run auth:diagnose     # Diagnose Supabase Auth connectivity issues
npm run e2e:full          # End-to-end FULL flow (requires API running + TEST_EMAIL/TEST_PASSWORD in .env)
```

---

## Architecture

### Monorepo layout

```
fca-mtr/
├── apps/api/        Node.js + Express (port 3001) — CommonJS
├── apps/web/        Next.js 14 App Router (port 3000) — TypeScript
├── db/
│   ├── migrations/  NNN_description.sql  (numbered, idempotent)
│   └── seed/        JSON → DB seeders
├── catalogs/full/   Canonical FULL catalog (processes, questions, recommendations, actions)
└── docs/            API contracts, schema docs, architecture reference
```

### Request lifecycle (API)

```
HTTP → CORS → JSON parser
     → populateAuth (middleware/auth.js)  — populates req.user from JWT or leaves undefined; NEVER rejects
     → Route handler
         → requireAuth             — 401 if req.user missing
         → requireFullEntitlement  — 403 if no FULL/ACTIVE entitlement (bypassed for CONSULTOR/ADMIN)
         → blockConsultorOnMutation — 403 if role=CONSULTOR on write routes
         → ensureCompanyAccess / ensureConsultantOrOwnerAccess  — ownership gate
```

### Key middleware files

| File | Purpose |
|---|---|
| `middleware/auth.js` | `populateAuth` — JWKS/ES256 JWT validation, sets `req.user = { id, email, role }`. Fails open (no rejection). |
| `middleware/requireAuth.js` | Returns 401 if `req.user` is absent. |
| `middleware/guards.js` | `blockConsultorOnMutation`, `requireConsultorOrAdmin`, `requireAnyRole`. |
| `middleware/requireRole.js` | Re-exports from `guards.js`. |
| `middleware/requireFullEntitlement.js` | 403 gate — checks `FULL_TEST_MODE`, `FULL_ADMIN_WHITELIST`, or DB entitlement. |
| `lib/companyAccess.js` | `ensureCompanyAccess(userId, companyId)` — USER must own company. `ensureConsultantOrOwnerAccess(userId, companyId, email, role)` — CONSULTOR/ADMIN bypass ownership check. |

### Route files (apps/api/src/routes/)

| File | Prefix | Scope |
|---|---|---|
| `full.js` | `/full/*` | Entire FULL cycle: catalog, answers, scores, findings, plan, actions, evidence, reports, versions |
| `assessments.js` | `/assessments` | LIGHT assessment lifecycle |
| `f3.js` | `/` | F3 recommendations + free actions + light plans |
| `f4.js` | `/` | Entitlements + paywall events |
| `f4b.js` | `/` | FULL initiatives catalog |
| `gateC.js` | `/` | Executive summary + next-best-actions |
| `consultor.js` | `/consultor` | Transversal consultant views (CONSULTOR/ADMIN only) |
| `admin/` | `/admin` | Admin user/company management |

### FULL module flow

The FULL diagnostic cycle lives entirely in `routes/full.js` (4000+ lines). Key stages:

1. **Catalog** — `GET /full/catalog` — processes + questions from DB/JSON
2. **Answers** — `POST /full/answers` — persists to `full_answers`
3. **Submit** — `POST /full/assessments/:id/submit` — computes scores → `full_process_scores`, generates findings → `full_findings`, closes DRAFT to SUBMITTED
4. **Results** — `GET /full/results` — returns six_pack (3 vazamentos + 3 alavancas) from findings
5. **Cause engine** — `POST /full/causes/answer`, `POST /full/cause/evaluate` — classifies root causes
6. **Plan** — `POST /full/cycle/select-actions` or `POST /full/assessments/:id/plan/select` — persists to `full_selected_actions`
7. **Evidence** — `POST /full/assessments/:id/plan/:action_key/evidence` — writes to `full_action_evidence`
8. **Close** — `POST /full/assessments/:id/close` — SUBMITTED → CLOSED
9. **Reports** — `GET /full/reports/:assessmentId.pdf` (sync), `POST /full/reports/generate` (async job)

Key helpers defined at the top of `full.js`:
- `toExternalScore(s)` — converts internal 0–10 score to 0–100
- `scoreToBand(score)` — returns `LOW`/`MEDIUM`/`HIGH` (internal scale)
- `getAssessment(id, companyId)` / `getAssessmentById(id)` — DB fetch helpers
- `loadFullResultsPayload(assessmentId)` — loads scores + findings + six_pack in one call

### Database

- **Client:** Supabase (`lib/supabase.js`) with `SERVICE_ROLE_KEY` — used for all backend queries. Never expose to frontend.
- **RLS:** All tables have RLS enabled. Backend enforces ownership as a second layer.
- **Score scale:** Internal scores are 0–10 (stored in `full_process_scores.score_numeric`). Always call `toExternalScore()` before returning to clients.
- **Migrations:** Numbered `NNN_*.sql` files applied in order by `db/run-migrations.js`. Tracked in `public.schema_migrations`. Always idempotent (`IF NOT EXISTS`). Next migration number: check the highest existing file in `db/migrations/`.

### Supabase mock pattern (tests)

All API tests mock `../src/lib/supabase` using a `createChain` factory that supports the full Supabase query builder chaining (`schema → from → select → eq → order → maybeSingle/then`). Use `global.__mockXxx` variables to control per-test return values. See `test/consultorEndpoints.test.js` for the canonical mock pattern.

```js
jest.mock('../src/lib/supabase', () => {
  const createChain = (data, error = null) => {
    const chain = {
      schema: () => chain, from: () => chain, select: () => chain,
      eq: () => chain, order: () => chain, limit: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error }),
      then: (fn) => Promise.resolve({ data, error }).then(fn),
      catch: (fn) => Promise.resolve({ data, error }).catch(fn),
    };
    return chain;
  };
  // dispatch by table name in the outer schema().from() call
  return { supabase: { schema: jest.fn().mockReturnValue({ from: jest.fn().mockImplementation((t) => createChain(getTableResult(t))) }), from: jest.fn().mockImplementation((t) => createChain(getTableResult(t))) } };
});
```

### Frontend (apps/web)

- **API calls:** Always use `apiFetch(path, options, accessToken)` from `src/lib/api.ts`. On 401 it auto-redirects to `/login`.
- **Auth:** Supabase client-side session. Access token is passed explicitly to `apiFetch`.
- **Role checks:** Fetch `GET /me` → `{ role: 'USER' | 'CONSULTOR' | 'ADMIN' }`. Use `fetchMe(accessToken)` from `src/lib/api.ts` (deduplicates in-flight calls).
- **FULL pages:** All live under `app/full/`. Each page receives `company_id` and `assessment_id` from URL query params.
- **UI copy:** User-facing strings for error codes live in `src/lib/api.ts` (`API_ERROR_MESSAGES`). Product-facing text in `src/lib/uiCopy.ts`.

### Roles

| Role | Can do |
|---|---|
| `USER` | Access own company only. Fill out diagnostics. |
| `CONSULTOR` | Read-only transversal access to any company. Cannot mutate assessments. |
| `ADMIN` | Same as CONSULTOR + can activate test mode. |

Test credentials: `fca@fca.com` (USER), `consultor@fca.com` (CONSULTOR), `admin@fca.com` (ADMIN) — password `senha123`.

### Error response shape

```js
// apiError helper (used throughout full.js)
apiError(res, status, code, messageUser, extra?)
// → { code: 'DIAG_NOT_READY', message_user: '...', ...extra }
```

### Audit log

Fire-and-forget. Never propagates exceptions. Call after successful mutations:

```js
logEvent(supabase, { event: 'plan_created', userId, companyId, assessmentId, meta: {} });
```

Instrumented events: `cause_classified`, `plan_created`, `evidence_recorded`, `gain_declared`, `report_generated`.

---

## Environment variables

Copy `.env.example` → `.env` at the repo root.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Frontend-safe public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Backend only — never expose |
| `PORT` | No | Default 3001 |
| `FRONTEND_ORIGINS` | No | CORS whitelist, comma-separated |
| `DB_SSL_RELAXED` | No | `true` for local dev (skips cert verify) |
| `FULL_TEST_MODE` | No | `true` → any user can access FULL (QA only) |
| `FULL_ADMIN_WHITELIST` | No | Comma-separated emails always allowed FULL |
