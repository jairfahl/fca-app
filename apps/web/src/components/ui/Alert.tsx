type AlertVariant = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  children: React.ReactNode;
  variant?: AlertVariant;
};

const styles: Record<AlertVariant, React.CSSProperties> = {
  info: { backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' },
  success: { backgroundColor: '#ecfdf3', color: '#166534', borderColor: '#bbf7d0' },
  warning: { backgroundColor: '#fffbeb', color: '#92400e', borderColor: '#fde68a' },
  error: { backgroundColor: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }
};

export default function Alert({ children, variant = 'info' }: AlertProps) {
  return (
    <div style={{
      border: '1px solid',
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      ...styles[variant]
    }}>
      {children}
    </div>
  );
}
