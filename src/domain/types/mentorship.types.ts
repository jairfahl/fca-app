export type EvidenceType = 'TEXT' | 'FILE';

export interface Evidence {
    evidence_id: string;
    selected_action_id: string;
    cycle_id: string;
    type: EvidenceType;
    content: string;
    file_url?: string;
    submitted_by: string;
    submitted_at: string;
}

export interface ConsultantComment {
    comment_id: string;
    selected_action_id: string;
    cycle_id: string;
    consultant_id: string;
    comment_text: string;
    created_at: string;
}

export interface CycleHistoryEntry {
    cycle_id: string;
    company_id: string;
    status: string;
    started_at: string;
    finished_at?: string;
    general_maturity_score?: number;
    area_scores: AreaScore[];
    selected_actions: SelectedActionSummary[];
}

export interface AreaScore {
    area_id: string;
    area_name: string;
    score: number;
}

export interface SelectedActionSummary {
    action_id: string;
    action_catalog_id: string;
    sequence: number;
    status: string;
    evidence_count: number;
    has_consultant_comment: boolean;
}

export interface MaturityComparison {
    company_id: string;
    previous_cycle: CycleSnapshot;
    current_cycle: CycleSnapshot;
    evolution: MaturityEvolution;
}

export interface CycleSnapshot {
    cycle_id: string;
    general_score: number;
    area_scores: AreaScore[];
    started_at: string;
    finished_at?: string;
}

export interface MaturityEvolution {
    general_score_change: number;
    area_score_changes: AreaScoreChange[];
    trend: 'IMPROVEMENT' | 'STAGNATION' | 'REGRESSION';
}

export interface AreaScoreChange {
    area_id: string;
    area_name: string;
    previous_score: number;
    current_score: number;
    change: number;
}
