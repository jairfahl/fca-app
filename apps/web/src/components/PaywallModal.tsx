'use client';

import { useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  accessToken: string;
}

export default function PaywallModal({ isOpen, onClose, companyId, accessToken }: PaywallModalProps) {
  const hasLoggedView = useRef(false);

  useEffect(() => {
    if (isOpen && !hasLoggedView.current && accessToken) {
      // Registrar VIEW_PAYWALL apenas uma vez por exibição
      hasLoggedView.current = true;
      
      apiFetch('/paywall/events', {
        method: 'POST',
        body: {
          event: 'VIEW_PAYWALL',
          company_id: companyId,
          meta: {}
        }
      }, accessToken).catch(err => {
        // Não bloquear UI se o log falhar
        console.error('Erro ao registrar VIEW_PAYWALL:', err);
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('PAYWALL view_paywall');
      }
    }
  }, [isOpen, companyId, accessToken]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
          Conteúdo Exclusivo
        </h2>
        <p style={{ marginBottom: '1.5rem', color: '#666', lineHeight: '1.6' }}>
          Esta etapa é exclusiva do plano completo.
        </p>
        <button
          onClick={onClose}
          style={{
            backgroundColor: '#0070f3',
            color: '#fff',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            width: '100%'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#0051cc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#0070f3';
          }}
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
