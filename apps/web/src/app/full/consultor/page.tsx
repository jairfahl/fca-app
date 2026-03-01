'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { consultantCompanyOverview, consultantCompanyAssessment, consultantHome, isCompanyIdValid } from '@/lib/consultorRoutes';

/**
 * Redireciona /full/consultor para /consultor/* (rotas padronizadas).
 * - Sem params → /consultor
 * - company_id → /consultor/company/:id
 * - company_id + assessment_id → /consultor/company/:id/assessment/:id
 */
export default function FullConsultorRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = searchParams.get('company_id');
  const assessmentId = searchParams.get('assessment_id');

  useEffect(() => {
    if (assessmentId && isCompanyIdValid(companyId)) {
      router.replace(consultantCompanyAssessment(companyId, assessmentId, 'FULL'));
    } else if (isCompanyIdValid(companyId)) {
      router.replace(consultantCompanyOverview(companyId));
    } else {
      router.replace(consultantHome());
    }
  }, [companyId, assessmentId, router]);

  return <div style={{ padding: '2rem', textAlign: 'center' }}>Redirecionando...</div>;
}
