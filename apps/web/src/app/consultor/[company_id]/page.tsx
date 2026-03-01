'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { consultantCompanyOverview, consultantHome, isCompanyIdValid } from '@/lib/consultorRoutes';

/** Redireciona /consultor/[company_id] para /consultor/company/[company_id] */
export default function ConsultorCompanyRedirect() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;

  useEffect(() => {
    if (isCompanyIdValid(companyId)) {
      router.replace(consultantCompanyOverview(companyId) as string);
    } else {
      router.replace(consultantHome());
    }
  }, [companyId, router]);

  return <div style={{ padding: '2rem' }}>Redirecionando...</div>;
}
