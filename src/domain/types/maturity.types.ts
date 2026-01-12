/**
 * Maturity Types
 * 
 * Defines maturity classification bands based on score ranges:
 * - LOW: 0-40 points
 * - MEDIUM: 41-70 points
 * - HIGH: 71-100 points
 */

export type MaturityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export const MATURITY_LEVELS: MaturityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export interface MaturityBand {
    level: MaturityLevel;
    minScore: number;
    maxScore: number;
    label: string;
}

export const MATURITY_BANDS: MaturityBand[] = [
    { level: 'LOW', minScore: 0, maxScore: 40, label: 'Iniciante' },
    { level: 'MEDIUM', minScore: 41, maxScore: 70, label: 'Em Desenvolvimento' },
    { level: 'HIGH', minScore: 71, maxScore: 100, label: 'Maduro' },
];

export interface MaturityClassification {
    score: number;
    level: MaturityLevel;
    band: MaturityBand;
    gapToNextLevel: number | null;
}

export function isValidMaturityLevel(value: unknown): value is MaturityLevel {
    return typeof value === 'string' && MATURITY_LEVELS.includes(value as MaturityLevel);
}
