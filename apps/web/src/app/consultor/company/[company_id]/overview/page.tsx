'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { humanizeStatus } from '@/lib/uiCopy';
import { companyBreadcrumb } from '@/components/ConsultorBreadcrumb';
import {
  consultantHome as routeConsultorHome,
  consultantCompanyAssessment,
  consultantUser,
  consultantHistorico,
  consultantRelatorio,
  isCompanyIdValid,
} from '@/lib/consultorRoutes';

interface OverviewData {
  company: { id: string; name: string; segment?: string };
  light_status: string | null;
  full_status: string | null;
  full_assessment_id: string | null;
  plan_progress: string | null;
}

interface AssessmentItem {
  id: string;
  type: 'LIGHT' | 'FULL';
  status: string;
  answered_count: number;
  last_saved_at: string | null;
  cycle_index: number | null;
}

interface AssessmentsData {
  company_id: string;
  light: AssessmentItem[];
  full: AssessmentItem[];
}

interface CompanyDetail {
  company_id: string;
  name: string | null;
  owner_user_id: string | null;
  entitlement: string;
}

interface UserItem {
  user_id: string;
  email: string | null;
  company_id: string | null;
  company_name: string | null;
}

interface MessageItem {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  body_preview: string;
  created_at: string;
  created_by_role: string;
}

type CompanyTab = 'diagnosticos' | 'usuarios' | 'mensagens' | 'relatorios';

export default function ConsultorCompanyOverviewPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div style={{ padding: '2rem' }}>Carregando...</div>}>
        <ConsultorCompanyContent />
      </Suspense>
    </ProtectedRoute>
  );
}

function ConsultorCompanyContent() {
  const { session } = useAuth();
  const params = useParams();
  const router = useRouter();
  const companyId = params.company_id as string;

  const [tab, setTab] = useState<CompanyTab>('diagnosticos');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [assessments, setAssessments] = useState<AssessmentsData | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!companyId || !session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [overviewRes, assessmentsRes, companiesRes, usersRes, messagesRes] = await Promise.all([
        apiFetch(`/consultor/company/${companyId}/overview`, {}, session.access_token),
        apiFetch(`/consultor/assessments?company_id=${companyId}`, {}, session.access_token),
        apiFetch('/consultor/companies', {}, session.access_token),
        apiFetch(`/consultor/users?company_id=${companyId}`, {}, session.access_token),
        apiFetch(`/consultor/messages?company_id=${companyId}`, {}, session.access_token),
      ]);
      setOverview(overviewRes);
      setAssessments(assessmentsRes);
      const companies = companiesRes?.companies || [];
      const c = companies.find((x: CompanyDetail) => x.company_id === companyId);
      setCompanyDetail(c || null);
      setUsers(usersRes?.users || []);
      setMessages(messagesRes?.messages || []);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/diagnostico');
        return;
      }
      setError((err as Error).message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [companyId, session?.access_token, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isCompanyIdValid(companyId)) {
    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ padding: '1.5rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '8px', marginBottom: '1rem' }}>
          <strong>Selecione uma empresa válida.</strong> O company_id está ausente ou incorreto.
        </div>
        <Link href={routeConsultorHome()} style={{ color: '#0d6efd', fontWeight: 600 }}>
          ← Voltar ao painel do consultor
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        Carregando...
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        {error && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '8px',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span>{error}</span>
            <button
              onClick={loadData}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#721c24',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Recarregar
            </button>
          </div>
        )}
        <Link href={routeConsultorHome()} style={{ color: '#0d6efd' }}>
          ← Voltar às empresas
        </Link>
      </div>
    );
  }

  const companyName = overview.company?.name || companyDetail?.name || companyId;
  const hasFull = (assessments?.full?.length ?? 0) > 0 || !!overview?.full_assessment_id;
  const tabBtn = (t: CompanyTab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      style={{
        padding: '0.5rem 1rem',
        border: 'none',
        background: tab === t ? '#0d6efd' : 'transparent',
        color: tab === t ? '#fff' : '#212529',
        cursor: 'pointer',
        borderRadius: '6px 6px 0 0',
        fontSize: '0.9rem',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {companyBreadcrumb(companyId, companyName)}
      <h1 style={{ marginBottom: '1rem' }}>{companyName}</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '8px', border: '1px solid #b6d4fe' }}>
          <div style={{ fontSize: '0.85rem', color: '#0c5460', marginBottom: '0.25rem' }}>Entitlement</div>
          <div style={{ fontWeight: 600 }}>{companyDetail?.entitlement || 'LIGHT'}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.25rem' }}>LIGHT</div>
          <div style={{ fontWeight: 600 }}>{humanizeStatus(overview.light_status)}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          <div style={{ fontSize: '0.85rem', color: '#6c757d', marginBottom: '0.25rem' }}>FULL</div>
          <div style={{ fontWeight: 600 }}>{humanizeStatus(overview.full_status)}</div>
        </div>
        {overview.plan_progress && (
          <div style={{ padding: '1rem', backgroundColor: '#d4edda', borderRadius: '8px', border: '1px solid #28a745' }}>
            <div style={{ fontSize: '0.85rem', color: '#155724', marginBottom: '0.25rem' }}>Plano</div>
            <div style={{ fontWeight: 600 }}>{overview.plan_progress}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid #dee2e6' }}>
        {tabBtn('diagnosticos', 'Diagnósticos')}
        {tabBtn('usuarios', 'Usuários')}
        {tabBtn('mensagens', 'Mensagens')}
        {tabBtn('relatorios', 'Relatórios')}
      </div>

      {tab === 'diagnosticos' && assessments && (assessments.light.length > 0 || assessments.full.length > 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {assessments.light.length > 0 && (
            <section>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: '#6c757d' }}>LIGHT</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assessments.light.map((a) => (
                  <li key={a.id} style={{ marginBottom: '0.5rem' }}>
                    <Link
                      href={consultantCompanyAssessment(companyId, a.id, 'LIGHT')}
                      style={{
                        display: 'block',
                        padding: '1rem 1.25rem',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: '#212529',
                        border: '1px solid #dee2e6',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{humanizeStatus(a.status)}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                        — {a.answered_count} respostas
                        {a.last_saved_at && ` · ${new Date(a.last_saved_at).toLocaleDateString('pt-BR')}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {assessments.full.length > 0 && (
            <section>
              <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: '#6c757d' }}>FULL</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assessments.full.map((a) => (
                  <li key={a.id} style={{ marginBottom: '0.5rem' }}>
                    <Link
                      href={consultantCompanyAssessment(companyId, a.id, 'FULL')}
                      style={{
                        display: 'block',
                        padding: '1rem 1.25rem',
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: '#212529',
                        border: '1px solid #dee2e6',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        Ciclo {a.cycle_index ?? '—'} · {humanizeStatus(a.status)}
                      </span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                        — {a.answered_count} respostas
                        {a.last_saved_at && ` · ${new Date(a.last_saved_at).toLocaleDateString('pt-BR')}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : tab === 'diagnosticos' ? (
        <p style={{ color: '#6c757d' }}>Nenhum diagnóstico encontrado.</p>
      ) : null}

      {tab === 'usuarios' && (
        <div>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Usuários</h2>
          {users.length === 0 ? (
            <p style={{ color: '#6c757d' }}>Nenhum usuário nesta empresa.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {users.map((u) => (
                <li key={u.user_id} style={{ marginBottom: '0.5rem' }}>
                  <Link
                    href={consultantUser(companyId, u.user_id)}
                    style={{
                      display: 'block',
                      padding: '1rem 1.25rem',
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      color: '#212529',
                      border: '1px solid #dee2e6',
                    }}
                  >
                    <strong>{u.email || '—'}</strong>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: '#6c757d' }}>
                      Ver diagnósticos e mensagens →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'mensagens' && (
        <div>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Mensagens</h2>
          {messages.length === 0 ? (
            <p style={{ color: '#6c757d' }}>Nenhuma mensagem.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {messages.map((m) => (
                <li
                  key={m.id}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: m.created_by_role === 'USER' ? '#e7f3ff' : '#f8f9fa',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${m.created_by_role === 'USER' ? '#0d6efd' : '#6c757d'}`,
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                    {m.created_by_role} — {new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                  <div>{m.body_preview}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'relatorios' && (
        <div>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Relatórios</h2>
          <p style={{ color: '#6c757d', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Histórico de versões e relatórios PDF do diagnóstico FULL.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {hasFull ? (
              <>
                <Link
                  href={consultantHistorico(companyId)}
                  style={{
                    display: 'inline-block',
                    padding: '0.65rem 1rem',
                    backgroundColor: '#0d6efd',
                    color: '#fff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                  }}
                >
                  Histórico de versões
                </Link>
                <Link
                  href={consultantRelatorio(companyId)}
                  style={{
                    display: 'inline-block',
                    padding: '0.65rem 1rem',
                    backgroundColor: '#198754',
                    color: '#fff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                  }}
                >
                  Relatório PDF
                </Link>
              </>
            ) : (
              <>
                <span title="Sem FULL ainda" style={{ display: 'inline-block', padding: '0.65rem 1rem', backgroundColor: '#e9ecef', color: '#6c757d', borderRadius: '8px', cursor: 'not-allowed', fontSize: '0.9rem' }}>
                  Histórico de versões
                </span>
                <span title="Sem FULL ainda" style={{ display: 'inline-block', padding: '0.65rem 1rem', backgroundColor: '#e9ecef', color: '#6c757d', borderRadius: '8px', cursor: 'not-allowed', fontSize: '0.9rem' }}>
                  Relatório PDF
                </span>
              </>
            )}
          </div>
          {!hasFull && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#6c757d' }}>
              Sem FULL ainda — A empresa precisa concluir o diagnóstico FULL para acessar histórico e relatórios.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
