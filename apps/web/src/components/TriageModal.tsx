'use client';

import { useState } from 'react';

interface TriageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    pain: string;
    horizon: string;
    budget_monthly: string;
  }) => Promise<void>;
  companyId: string;
  assessmentId: string;
}

export default function TriageModal({ isOpen, onClose, onSubmit, companyId, assessmentId }: TriageModalProps) {
  const [pain, setPain] = useState('');
  const [horizon, setHorizon] = useState('');
  const [budgetMonthly, setBudgetMonthly] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pain || !horizon || !budgetMonthly) {
      setError('Por favor, preencha todas as perguntas');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await onSubmit({ pain, horizon, budget_monthly: budgetMonthly });
      // Reset form
      setPain('');
      setHorizon('');
      setBudgetMonthly('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar triagem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
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
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ margin: 0 }}>Fale com um consultor</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333'
            }}>
              1. Qual é sua principal dor hoje?
            </label>
            <select
              value={pain}
              onChange={(e) => setPain(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem'
              }}
            >
              <option value="">Selecione...</option>
              <option value="CAIXA">Caixa</option>
              <option value="VENDA">Venda</option>
              <option value="OPERACAO">Operação</option>
              <option value="PESSOAS">Pessoas</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333'
            }}>
              2. Em quanto tempo você precisa ver resultados?
            </label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem'
              }}
            >
              <option value="">Selecione...</option>
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
              <option value="90">90 dias</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 'bold',
              color: '#333'
            }}>
              3. Qual seu orçamento mensal para melhorias?
            </label>
            <select
              value={budgetMonthly}
              onChange={(e) => setBudgetMonthly(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem'
              }}
            >
              <option value="">Selecione...</option>
              <option value="ZERO">R$ 0</option>
              <option value="ATE_300">Até R$ 300</option>
              <option value="DE_301_800">R$ 301 - R$ 800</option>
              <option value="DE_801_2000">R$ 801 - R$ 2.000</option>
              <option value="ACIMA_2000">Acima de R$ 2.000</option>
            </select>
          </div>

          {error && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: loading ? '#6c757d' : '#0070f3',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
