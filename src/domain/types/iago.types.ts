/**
 * IAGO Types
 * 
 * Definitions for IAGO analysis, specifically for Prompt 01 (Contradictions).
 */



export enum FailureClassification {
    PROCESSO = 'Processo',
    GOVERNANCA = 'Governança',
    METRICA = 'Métrica',
    DECISAO = 'Decisão',
    EXECUCAO = 'Execução',
    CULTURA = 'Cultura'
}

export interface Contradiction {
    description: string;
    related_responses: string[]; // IDs or text summaries if IDs not sufficient for context
    conflicting_evidence: string[]; // IDs or text summaries
    classification: FailureClassification;
}

export interface IagoAnalysisResult {
    has_contradictions: boolean;
    contradictions: Contradiction[];
    raw_output: string; // Keep original output for audit
}

export interface StructuralHypothesis {
    hypothesis: string;
    related_symptoms: string[];
}

export interface IagoHypothesisResult {
    has_hypotheses: boolean;
    hypotheses: StructuralHypothesis[];
    raw_output: string;
}

export interface IagoReframingResult {
    has_reframing: boolean;
    reframed_text: string;
    structural_correspondence: { original: string, reframed: string }[];
    raw_output: string;
}

export interface IagoArtifactResult {
    has_artifact: boolean;
    artifact_title: string;
    artifact_content: string;
    refinement_suggestion: string;
    raw_output: string;
}

export interface IagoPressureResult {
    has_pressure: boolean;
    questions: string[];
    raw_output: string;
}

export const NO_CONTRADICTIONS_MESSAGE = "Nenhuma contradição estrutural identificada entre respostas e evidências fornecidas.";
export const NO_HYPOTHESIS_MESSAGE = "Não foi possível formular hipóteses estruturais válidas a partir dos sintomas apresentados.";
export const NO_REFRAMING_MESSAGE = "O texto apresentado já se encontra em linguagem estrutural e não requer reenquadramento.";
export const NO_ARTIFACT_MESSAGE = "Não há base estrutural suficiente para gerar artefatos cognitivos preliminares.";
export const NO_PRESSURE_MESSAGE = "A evidência apresentada não apresenta fragilidade estrutural adicional passível de questionamento cognitivo.";
