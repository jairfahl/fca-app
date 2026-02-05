type BadgeVariant = 'default' | 'success' | 'warning' | 'danger';

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
};

const colors: Record<BadgeVariant, React.CSSProperties> = {
  default: { backgroundColor: '#e5e7eb', color: '#111827' },
  success: { backgroundColor: '#dcfce7', color: '#166534' },
  warning: { backgroundColor: '#fef3c7', color: '#92400e' },
  danger: { backgroundColor: '#fee2e2', color: '#991b1b' }
};

export default function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      ...colors[variant]
    }}>
      {children}
    </span>
  );
}
