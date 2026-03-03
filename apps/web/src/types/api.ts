/**
 * Interfaces TypeScript para respostas da API backend.
 * Elimina uso de `any` nos componentes frontend.
 *
 * Baseado nos contratos documentados em docs/ e no código de routes/full/*.
 */

// ─── Primitivos ──────────────────────────────────────────────────────────────

export type Band = 'LOW' | 'MEDIUM' | 'HIGH';
export type AssessmentStatus = 'DRAFT' | 'SUBMITTED' | 'CLOSED';
export type Role = 'USER' | 'CONSULTOR' | 'ADMIN';
export type EntitlementPlan = 'FULL' | 'LIGHT' | 'FREE';
export type EntitlementStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL';

// ─── Auth / Me ───────────────────────────────────────────────────────────────

export interface MeResponse {
  id: string;
  email: string;
  role: Role;
  company_id?: string;
}

// ─── Company ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  owner_user_id: string;
  segment?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Assessment ──────────────────────────────────────────────────────────────

export interface FullAssessment {
  id: string;
  company_id: string;
  status: AssessmentStatus;
  segment?: string;
  full_version?: number;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
}

export interface AssessmentCurrentResponse {
  assessment: FullAssessment;
  is_new: boolean;
}

// ─── Answers ─────────────────────────────────────────────────────────────────

export interface Answer {
  process_key: string;
  question_key: string;
  answer_value: number; // 1–5
}

export interface AnswerSaveResponse {
  saved: number;
  assessment_id: string;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface CatalogQuestion {
  question_key: string;
  question_text: string;
  dimension?: string;
  tooltip?: string;
}

export interface CatalogProcess {
  process_key: string;
  process_name: string;
  description?: string;
  questions: CatalogQuestion[];
}

export interface CatalogResponse {
  processes: CatalogProcess[];
  segment?: string;
}

// ─── Scores / Results ────────────────────────────────────────────────────────

export interface ProcessScore {
  process_key: string;
  score_numeric: number;    // 0–10 interno
  score_external: number;   // 0–100 externo
  band: Band;
}

export interface Finding {
  finding_type: 'VAZAMENTO' | 'ALAVANCA';
  position: number;
  payload: {
    processo: string;
    maturity_band: Band;
    o_que_esta_acontecendo: string;
    custo_de_nao_agir: string;
    o_que_muda_em_30_dias: string;
    primeiro_passo: {
      action_key: string;
      action_title: string;
    };
    gap_label?: string;
    cause_primary?: string;
    cause_label?: string;
    mechanism_label?: string;
  };
  is_fallback?: boolean;
}

export interface SixPackResponse {
  vazamentos: Finding[];
  alavancas: Finding[];
  assessment_id: string;
  status: AssessmentStatus;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

export interface SelectedAction {
  action_key: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';
  title?: string;
  process_key?: string;
  band?: Band;
  evidence_before?: string;
  evidence_after?: string;
  evidence_url?: string;
  declared_gain?: string;
  dod_confirmed?: boolean;
  updated_at?: string;
}

export interface PlanSelectPayload {
  company_id: string;
  action_keys: string[];
}

export interface PlanStatusResponse {
  can_select: boolean;
  remaining_count: number;
  required_count: number;
  current_plan: SelectedAction[];
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export interface EvidencePayload {
  before_value: string;
  after_value: string;
  evidence_url?: string;
  declared_gain?: string;
}

export interface EvidenceResponse {
  ok: boolean;
  declared_gain?: string;
}

// ─── DoD ─────────────────────────────────────────────────────────────────────

export interface DodItem {
  item: string;
  required: boolean;
}

export interface DodResponse {
  action_key: string;
  checklist: DodItem[];
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface ActionBlock {
  action_key: string;
  title: string;
  status: SelectedAction['status'];
  process_key?: string;
  band?: Band;
  evidence_before?: string;
  evidence_after?: string;
  evidence_url?: string;
  declared_gain?: string;
  dod_confirmed?: boolean;
  benefit_text?: string;
  metric_hint?: string;
  steps_3?: string[];
}

export interface DashboardResponse {
  assessment: FullAssessment;
  actions: ActionBlock[];
  can_close: boolean;
  close_blockers?: string[];
}

// ─── Close ───────────────────────────────────────────────────────────────────

export interface CloseSummaryResponse {
  assessment: FullAssessment;
  actions_completed: number;
  actions_total: number;
  can_close: boolean;
  blockers?: string[];
}

export interface CloseResponse {
  ok: boolean;
  assessment: FullAssessment;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface ReportGenerateResponse {
  job_id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'DONE' | 'ERROR';
}

export interface ReportStatusResponse {
  status: ReportGenerateResponse['status'];
  url?: string;
  error?: string;
}

// ─── Versions ────────────────────────────────────────────────────────────────

export interface VersionSummary {
  full_version: number;
  assessment_id: string;
  status: AssessmentStatus;
  created_at: string;
  closed_at?: string;
  scores?: ProcessScore[];
}

export interface VersionsResponse {
  versions: VersionSummary[];
  current_version?: number;
}

// ─── Light (F3) ──────────────────────────────────────────────────────────────

export interface LightRecommendation {
  id: string;
  process_key: string;
  title: string;
  description?: string;
  priority?: number;
}

export interface FreeAction {
  id: string;
  title: string;
  process_key: string;
  status: 'PENDING' | 'DONE';
  evidence_before?: string;
  evidence_after?: string;
}

// ─── Consultor ───────────────────────────────────────────────────────────────

export interface ConsultorCompany extends Company {
  entitlement_plan?: EntitlementPlan;
  entitlement_status?: EntitlementStatus;
  plan_progress?: {
    total: number;
    done: number;
  };
}

export interface ConsultorUser {
  user_id: string;
  email: string;
  role: Role;
  companies: { id: string; name: string }[];
  last_seen_at?: string;
}

// ─── Generic API responses ───────────────────────────────────────────────────

export interface ApiErrorResponse {
  code: string;
  message_user: string;
  error: string;
  issues?: { field: string; message: string }[];
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total?: number;
}
