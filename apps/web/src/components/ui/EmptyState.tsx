type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      border: '1px dashed #d1d5db',
      borderRadius: '12px',
      padding: '1.5rem',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{title}</div>
      {description ? (
        <div style={{ color: '#6b7280', marginBottom: action ? '0.75rem' : 0 }}>
          {description}
        </div>
      ) : null}
      {action}
    </div>
  );
}
