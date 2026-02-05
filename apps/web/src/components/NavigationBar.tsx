import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function NavigationBar() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  const resultsHref = companyId && assessmentId
    ? `/results?company_id=${companyId}&assessment_id=${assessmentId}`
    : assessmentId
      ? `/results?assessment_id=${assessmentId}`
      : '/results';

  const recommendationsHref = companyId && assessmentId
    ? `/recommendations?company_id=${companyId}&assessment_id=${assessmentId}`
    : assessmentId
      ? `/recommendations?assessment_id=${assessmentId}`
      : '/recommendations';

  const diagnosticoHref = companyId
    ? `/diagnostico?company_id=${companyId}`
    : '/diagnostico';

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      flexWrap: 'wrap',
      margin: '1rem 0'
    }}>
      <Link href={resultsHref} style={{ color: '#0070f3' }}>
        Voltar para Resultados
      </Link>
      <Link href={recommendationsHref} style={{ color: '#0070f3' }}>
        Voltar para Recomendações
      </Link>
      <Link href={diagnosticoHref} style={{ color: '#0070f3' }}>
        Voltar para Diagnóstico
      </Link>
    </div>
  );
}
