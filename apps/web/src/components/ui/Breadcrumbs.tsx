import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type Crumb = {
  label: string;
  href?: string;
};

const buildHref = (base: string, companyId: string | null, assessmentId: string | null) => {
  if (base === '/diagnostico') {
    return companyId ? `/diagnostico?company_id=${companyId}` : '/diagnostico';
  }
  if (base === '/results') {
    if (companyId && assessmentId) {
      return `/results?company_id=${companyId}&assessment_id=${assessmentId}`;
    }
    if (assessmentId) {
      return `/results?assessment_id=${assessmentId}`;
    }
    return '/results';
  }
  if (base === '/recommendations') {
    if (companyId && assessmentId) {
      return `/recommendations?company_id=${companyId}&assessment_id=${assessmentId}`;
    }
    if (assessmentId) {
      return `/recommendations?assessment_id=${assessmentId}`;
    }
    return '/recommendations';
  }
  return base;
};

const resolveCrumbs = (pathname: string, companyId: string | null, assessmentId: string | null): Crumb[] => {
  if (pathname === '/diagnostico') {
    return [{ label: 'Diagnóstico', href: buildHref('/diagnostico', companyId, assessmentId) }];
  }
  if (pathname === '/results') {
    return [
      { label: 'Diagnóstico', href: buildHref('/diagnostico', companyId, assessmentId) },
      { label: 'Resultados' }
    ];
  }
  if (pathname === '/recommendations') {
    return [
      { label: 'Diagnóstico', href: buildHref('/diagnostico', companyId, assessmentId) },
      { label: 'Resultados', href: buildHref('/results', companyId, assessmentId) },
      { label: 'Recomendações' }
    ];
  }
  if (pathname.startsWith('/free-action/')) {
    return [
      { label: 'Diagnóstico', href: buildHref('/diagnostico', companyId, assessmentId) },
      { label: 'Resultados', href: buildHref('/results', companyId, assessmentId) },
      { label: 'Recomendações', href: buildHref('/recommendations', companyId, assessmentId) },
      { label: 'Evidência' }
    ];
  }
  if (pathname === '/full/diagnostic') {
    return [{ label: 'FULL' }, { label: 'Relatório Executivo' }];
  }
  if (pathname === '/full/initiatives') {
    return [{ label: 'FULL' }, { label: 'Prioridades Top-12' }];
  }
  if (pathname === '/full/summary') {
    return [{ label: 'FULL' }, { label: 'Resumo Executivo' }];
  }
  if (pathname === '/paywall') {
    return [{ label: 'Acesso FULL' }];
  }
  if (pathname === '/onboarding') {
    return [{ label: 'Onboarding' }];
  }
  if (pathname === '/login') {
    return [{ label: 'Login' }];
  }
  if (pathname === '/signup') {
    return [{ label: 'Cadastro' }];
  }
  if (pathname === '/logout') {
    return [{ label: 'Sair' }];
  }
  if (pathname === '/full') {
    return [{ label: 'FULL' }];
  }
  return [];
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const crumbs = resolveCrumbs(pathname, companyId, assessmentId);
  if (!crumbs.length) return null;

  return (
    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`}>
          {crumb.href ? (
            <Link href={crumb.href} style={{ color: '#0070f3' }}>
              {crumb.label}
            </Link>
          ) : (
            <span>{crumb.label}</span>
          )}
          {index < crumbs.length - 1 ? ' / ' : ''}
        </span>
      ))}
    </div>
  );
}
