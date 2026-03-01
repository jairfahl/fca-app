'use client';

import Link from 'next/link';
import { consultantHome, consultantCompanies, consultantCompanyOverview, consultantUser } from '@/lib/consultorRoutes';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ConsultorBreadcrumbProps {
  items: BreadcrumbItem[];
}

const linkStyle: React.CSSProperties = {
  color: '#0d6efd',
  textDecoration: 'none',
  fontSize: '0.9rem',
};

export function ConsultorBreadcrumb({ items }: ConsultorBreadcrumbProps) {
  return (
    <nav
      style={{
        marginBottom: '1rem',
        color: '#6c757d',
        fontSize: '0.9rem',
      }}
      aria-label="Breadcrumb"
    >
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: '0 0.35rem' }}>›</span>}
          {item.href ? (
            <Link href={item.href} style={linkStyle}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#212529', fontWeight: 500 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Breadcrumb: Consultor > Empresas > <Empresa> [> currentPage] */
export function companyBreadcrumb(
  companyId: string,
  companyName: string,
  currentPage?: string
) {
  const items: BreadcrumbItem[] = [
    { label: 'Consultor', href: consultantHome() },
    { label: 'Empresas', href: consultantCompanies() },
    { label: companyName, href: currentPage ? consultantCompanyOverview(companyId) : undefined },
  ];
  if (currentPage) items.push({ label: currentPage });
  return <ConsultorBreadcrumb items={items} />;
}

/** Breadcrumb: Consultor > Empresas > <Empresa> > <Usuário> [> currentPage] */
export function userBreadcrumb(
  companyId: string,
  companyName: string,
  userId: string,
  userName: string | null,
  currentPage?: string
) {
  const items: BreadcrumbItem[] = [
    { label: 'Consultor', href: consultantHome() },
    { label: 'Empresas', href: consultantCompanies() },
    { label: companyName, href: consultantCompanyOverview(companyId) },
    { label: userName || 'Usuário', href: currentPage ? consultantUser(companyId, userId) : undefined },
  ];
  if (currentPage) items.push({ label: currentPage });
  return <ConsultorBreadcrumb items={items} />;
}

