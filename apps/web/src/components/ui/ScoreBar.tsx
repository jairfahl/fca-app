/**
 * Barra de progresso de score (0–100).
 * Muda de cor conforme a banda (LOW/MEDIUM/HIGH).
 */
import { scoreToColor } from '@/lib/scoring';

interface ScoreBarProps {
  score: number;       // 0–100
  height?: number;
  showLabel?: boolean;
  className?: string;
}

export default function ScoreBar({ score, height = 8, showLabel = false, className = '' }: ScoreBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const color = scoreToColor(clamped);

  return (
    <div className={className}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: '#666' }}>
          <span>{clamped}/100</span>
        </div>
      )}
      <div
        style={{
          background: '#E5E7EB',
          borderRadius: height,
          height,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <div
          style={{
            background: color,
            borderRadius: height,
            height: '100%',
            width: `${clamped}%`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}
