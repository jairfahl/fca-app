/**
 * Lógica pura de redirect por role (extraída para teste).
 * Usado por RoleGate.tsx
 *
 * Tabela de permissões:
 * - /consultor, /logout: CONSULTOR/ADMIN ok; USER => /diagnostico
 * - /diagnostico, /results, /recommendations, /full/*: USER ok; CONSULTOR/ADMIN => /consultor
 */

const CONSULTOR_ALLOWED_PREFIXES = ['/consultor', '/logout'];

/** Prefixos de rotas de usuário (CONSULTOR não deve ficar) */
const USER_ROUTE_PREFIXES = ['/diagnostico', '/results', '/recommendations', '/full'];

function isUserRoute(pathname: string): boolean {
  return USER_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Calcula target de redirect por role. null = não redirecionar. */
export function computeRedirectTarget(
  pathname: string | null,
  role: 'USER' | 'CONSULTOR' | 'ADMIN'
): string | null {
  if (!pathname) return null;
  const isConsultorRoute = CONSULTOR_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));

  if (role === 'CONSULTOR' || role === 'ADMIN') {
    if (!isConsultorRoute) return '/consultor';
    return null;
  }
  if (role === 'USER') {
    if (isConsultorRoute) return '/diagnostico';
    return null;
  }
  return null;
}

/** Mensagem para redirect CONSULTOR→/consultor. "forbidden" quando vem de rota de usuário. */
export function getConsultorRedirectMsg(pathname: string | null): string {
  if (!pathname) return 'Acesso de consultor é pelo painel.';
  return isUserRoute(pathname) ? 'Acesso negado. Use o painel do consultor.' : 'Acesso de consultor é pelo painel.';
}
