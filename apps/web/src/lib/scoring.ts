/**
 * Helpers de scoring compartilhados — frontend.
 * Espelha a lógica do backend (apps/api/src/lib/fullHelpers.js) para uso no cliente.
 *
 * IMPORTANTE: A escala externa é 0–100 (score interno 0–10 multiplicado por 10).
 */

export type Band = 'LOW' | 'MEDIUM' | 'HIGH';

/** Converte score externo (0–100) para banda de maturidade. */
export function scoreToBand(s: number): Band {
  if (s < 40) return 'LOW';
  if (s < 70) return 'MEDIUM';
  return 'HIGH';
}

/** Label em português para cada banda. */
export function bandLabel(b: Band | string): string {
  const labels: Record<string, string> = {
    LOW: 'Crítico',
    MEDIUM: 'Em ajuste',
    HIGH: 'Sob controle',
  };
  return labels[b] ?? b;
}

/** Cor HEX para cada banda (compatível com CSS/inline styles). */
export function bandColor(b: Band | string): string {
  const colors: Record<string, string> = {
    LOW: '#C0392B',
    MEDIUM: '#E67E22',
    HIGH: '#27AE60',
  };
  return colors[b] ?? '#666';
}

/** Cor de fundo suave para cada banda (para tags/badges). */
export function bandBgColor(b: Band | string): string {
  const colors: Record<string, string> = {
    LOW: '#FDEDEC',
    MEDIUM: '#FEF9E7',
    HIGH: '#EAFAF1',
  };
  return colors[b] ?? '#F5F5F5';
}

/** Ícone de emoji para cada banda. */
export function bandIcon(b: Band | string): string {
  const icons: Record<string, string> = {
    LOW: '🔴',
    MEDIUM: '🟡',
    HIGH: '🟢',
  };
  return icons[b] ?? '⚪';
}

/**
 * Converte score interno (0–10) para escala externa (0–100).
 * Deve ser usado apenas se receber scores internos (improvável no frontend).
 */
export function toExternalScore(s: number): number {
  return Math.round((s ?? 0) * 10);
}

/**
 * Formata score externo para exibição.
 * Ex: 75 → "75/100" ou "75%"
 */
export function formatScore(s: number, format: 'fraction' | 'percent' = 'fraction'): string {
  const clamped = Math.min(100, Math.max(0, Math.round(s)));
  return format === 'percent' ? `${clamped}%` : `${clamped}/100`;
}

/** Interpola cor entre LOW e HIGH com base no score (0–100). */
export function scoreToColor(s: number): string {
  if (s < 40) return bandColor('LOW');
  if (s < 70) return bandColor('MEDIUM');
  return bandColor('HIGH');
}
