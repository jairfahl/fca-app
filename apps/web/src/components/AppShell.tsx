import Link from 'next/link';

type AppShellProps = {
  children: React.ReactNode;
  userEmail?: string | null;
  showLogout?: boolean;
};

export default function AppShell({ children, userEmail, showLogout = false }: AppShellProps) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f7f7f9',
      color: '#1f2933',
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    }}>
      <header style={{
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff'
      }}>
        <div style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div style={{ fontWeight: 700 }}>Mentor Gerencial</div>
          {showLogout ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#6b7280' }}>
              {userEmail ? <span>Logado como {userEmail}</span> : null}
              <Link href="/logout" style={{ color: '#0070f3' }}>
                Sair
              </Link>
            </div>
          ) : null}
        </div>
      </header>
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
