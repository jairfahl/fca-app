'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Entitlement, activateFullTest } from '@/lib/entitlement';
import { assertFullAccess } from '@/lib/fullGuard';

type AssinarFullButtonProps = {
  companyId: string;
  entitlement: Entitlement | null;
  accessToken: string | null;
  /** Estilo do link/botão quando vai para paywall */
  variant?: 'primary' | 'secondary';
  /** Label quando autorizado (modo teste) */
  labelAuthorized?: string;
  /** Label quando não autorizado */
  labelPaywall?: string;
};

const defaultStyles = {
  primary: {
    backgroundColor: '#28a745',
    color: '#fff',
  },
  secondary: {
    backgroundColor: '#e9ecef',
    color: '#333',
  },
};

/**
 * Botão "Assinar FULL" com gate centralizado.
 * - Se autorizado (FULL/ACTIVE ou can_access_full): ativa se necessário e vai para /full
 * - Se não autorizado: vai para /paywall
 */
export function AssinarFullButton({
  companyId,
  entitlement,
  accessToken,
  variant = 'secondary',
  labelAuthorized = 'Assinar FULL',
  labelPaywall = 'Assinar FULL',
}: AssinarFullButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const canAccess = assertFullAccess(entitlement);
  const hasPersistedFull = entitlement?.plan === 'FULL' && entitlement?.status === 'ACTIVE';

  const baseStyle = {
    display: 'inline-block',
    padding: variant === 'primary' ? '0.75rem 1.25rem' : '0.6rem 1rem',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: variant === 'primary' ? '1rem' : '0.9rem',
    border: 'none',
    cursor: 'pointer',
    ...defaultStyles[variant],
  };

  if (!companyId) {
    return (
      <Link href="#" style={baseStyle as React.CSSProperties}>
        {labelPaywall}
      </Link>
    );
  }

  if (!canAccess) {
    return (
      <Link
        href={`/paywall?company_id=${companyId}`}
        style={baseStyle as React.CSSProperties}
      >
        {labelPaywall}
      </Link>
    );
  }

  if (hasPersistedFull) {
    return (
      <Link
        href={`/full?company_id=${companyId}`}
        style={baseStyle as React.CSSProperties}
      >
        {labelAuthorized}
      </Link>
    );
  }

  const handleActivateAndGo = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    try {
      await activateFullTest(companyId, accessToken);
      router.push(`/full?company_id=${companyId}`);
    } catch {
      setLoading(false);
      alert('Erro ao ativar FULL. Tente novamente.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleActivateAndGo}
      disabled={loading}
      style={baseStyle as React.CSSProperties}
    >
      {loading ? 'Ativando...' : labelAuthorized}
    </button>
  );
}
