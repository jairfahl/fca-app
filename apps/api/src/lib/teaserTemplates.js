/**
 * Gerador de frases determinísticas para teaser FULL
 * Sem uso de IA - apenas regras fixas baseadas em dados existentes
 */

/**
 * Gera frase de dependência se initiative tem dependências
 * Template: "Você está travado por {{X}}; sem resolver isso, {{Y}} não avança."
 * Onde X = título da iniciativa dependente (que bloqueia), Y = título da iniciativa atual (bloqueada)
 * 
 * @param {Array<string>} dependencies - Array de UUIDs das iniciativas dependentes (que bloqueiam)
 * @param {string} currentInitiativeTitle - Título da iniciativa atual (que está bloqueada)
 * @param {Object} catalogMap - Mapa de catálogo por ID { [id]: { title, ... } }
 * @returns {string|null} Frase de dependência ou null se sem dependências
 */
function generateDependencyPhrase(dependencies, currentInitiativeTitle, catalogMap) {
  // Se não tem dependências, retorna null
  if (!dependencies || !Array.isArray(dependencies) || dependencies.length === 0) {
    return null;
  }

  // Se não tem título da iniciativa atual, retorna null
  if (!currentInitiativeTitle) {
    return null;
  }

  // Buscar títulos das iniciativas dependentes (que bloqueiam)
  const dependencyTitles = dependencies
    .map(depId => {
      const catalog = catalogMap[depId];
      return catalog ? catalog.title : null;
    })
    .filter(title => title !== null);

  // Se não encontrou nenhum título válido, retorna null
  if (dependencyTitles.length === 0) {
    return null;
  }

  // X = primeira dependência (que bloqueia)
  const X = dependencyTitles[0];
  
  // Y = título da iniciativa atual (que está bloqueada)
  const Y = currentInitiativeTitle;

  // Gerar frase determinística
  return `Você está travado por ${X}; sem resolver isso, ${Y} não avança.`;
}

/**
 * Gera frase de Next Best Action
 * @param {string} initiativeTitle - Título da iniciativa
 * @returns {string} Frase de Next Best Action
 */
function generateNextBestActionPhrase(initiativeTitle) {
  if (!initiativeTitle) {
    return null;
  }
  
  return `Comece por isto por 7 dias: ${initiativeTitle}.`;
}

/**
 * Gera texto de custo da inação baseado em faixas de score por processo
 * Regras determinísticas aplicadas em ordem de prioridade
 * 
 * @param {Object} scores - Objeto com scores por processo
 * @param {number} scores.admin_fin - Score de ADM_FIN (0-10)
 * @param {number} scores.management - Score de GESTAO (0-10)
 * @param {number} scores.commercial - Score de COMERCIAL (0-10)
 * @param {number} scores.operations - Score de OPERACOES (0-10)
 * @returns {string|null} Texto do custo da inação ou null se nenhuma regra se aplicar
 */
function generateInactionCost(scores) {
  if (!scores) {
    return null;
  }

  const adminFin = Number(scores.admin_fin) || 0;
  const management = Number(scores.management) || 0;
  const commercial = Number(scores.commercial) || 0;
  const operations = Number(scores.operations) || 0;

  // Regras aplicadas em ordem de prioridade (primeira que se aplicar retorna)

  // 1) ADM_FIN <= 3
  if (adminFin <= 3) {
    return 'Fragilidade financeira tende a gerar decisões reativas e perda de controle de caixa.';
  }

  // 2) GESTAO <= 3
  if (management <= 3) {
    return 'Baixa maturidade de gestão dificulta execução consistente e priorização.';
  }

  // 3) COMERCIAL <= 3
  if (commercial <= 3) {
    return 'Fragilidade comercial compromete captação e retenção de clientes.';
  }

  // 4) OPERACOES <= 3
  if (operations <= 3) {
    return 'Fragilidade operacional impacta qualidade e eficiência dos processos.';
  }

  // Se nenhuma regra se aplicou, retorna null
  return null;
}

module.exports = {
  generateDependencyPhrase,
  generateNextBestActionPhrase,
  generateInactionCost
};
