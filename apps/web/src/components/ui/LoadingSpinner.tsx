/**
 * Spinner de carregamento reutilizável.
 */
interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  message?: string;
  fullPage?: boolean;
}

export default function LoadingSpinner({
  size = 32,
  color = '#3B82F6',
  message,
  fullPage = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, size / 10)}px solid #E5E7EB`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }}
      />
      {message && <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>{message}</p>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (fullPage) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        {spinner}
      </div>
    );
  }

  return spinner;
}
