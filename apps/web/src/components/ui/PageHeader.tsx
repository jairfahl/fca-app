type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {breadcrumbs ? <div style={{ marginBottom: '0.5rem' }}>{breadcrumbs}</div> : null}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{title}</h1>
          {subtitle ? (
            <div style={{ marginTop: '0.35rem', color: '#6b7280' }}>{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
    </div>
  );
}
