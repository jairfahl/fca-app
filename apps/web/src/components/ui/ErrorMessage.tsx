/**
 * Mensagem de erro padronizada.
 */
interface ErrorMessageProps {
  message: string;
  code?: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, code, onRetry }: ErrorMessageProps) {
  return (
    <div
      style={{
        background: '#FDEDEC',
        border: '1px solid #C0392B',
        borderRadius: 8,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 20 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, color: '#922B21', fontWeight: 500, fontSize: 14 }}>{message}</p>
        {code && <p style={{ margin: '4px 0 0', color: '#A93226', fontSize: 12 }}>Código: {code}</p>}
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: 10,
              padding: '6px 14px',
              background: '#C0392B',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
