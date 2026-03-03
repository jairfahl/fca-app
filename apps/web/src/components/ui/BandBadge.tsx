/**
 * Badge de banda de maturidade (LOW/MEDIUM/HIGH).
 * Componente compartilhado — usa lib/scoring.ts.
 */
import { Band, bandLabel, bandColor, bandBgColor, bandIcon } from '@/lib/scoring';

interface BandBadgeProps {
  band: Band | string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export default function BandBadge({ band, showIcon = true, size = 'md', className = '' }: BandBadgeProps) {
  const color = bandColor(band);
  const bg = bandBgColor(band);
  const label = bandLabel(band);
  const icon = bandIcon(band);

  const padding = size === 'sm' ? '2px 8px' : '4px 12px';
  const fontSize = size === 'sm' ? '11px' : '13px';

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg,
        color,
        border: `1px solid ${color}`,
        borderRadius: 20,
        padding,
        fontSize,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {showIcon && <span>{icon}</span>}
      {label}
    </span>
  );
}
