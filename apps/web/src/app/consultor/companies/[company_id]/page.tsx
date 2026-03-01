'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { consultantCompanyOverview, isCompanyIdValid } from '@/lib/consultorRoutes';

/**
 * Redireciona /consultor/companies/[company_id] para /consultor/company/[company_id]/overview (rotas padronizadas).
 */
function ConsultorCompaniesCompanyRedirectContent() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;

  useEffect(() => {
    if (isCompanyIdValid(companyId)) {
      router.replace(consultantCompanyOverview(companyId));
    } else {
      router.replace('/consultor');
    }
  }, [companyId, router]);

  return <div style={{ padding: '2rem', textAlign: 'center' }}>Redirecionando...</div>;
}

export default function ConsultorCompaniesCompanyRedirect() {
  return (
    <ProtectedRoute>
      <ConsultorCompaniesCompanyRedirectContent />
    </ProtectedRoute>
  );
}
