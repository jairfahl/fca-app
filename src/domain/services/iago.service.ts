import { OpenAIClient } from '../../infrastructure/ai/openai.client';
import { DiagnosticResponse } from '../types/diagnostic.types';
import { Evidence } from '../types/mentorship.types';
import {
    Contradiction,
    FailureClassification,
    IagoAnalysisResult,
    IagoHypothesisResult,
    IagoReframingResult,
    IagoArtifactResult,
    IagoPressureResult,
    StructuralHypothesis,
    NO_CONTRADICTIONS_MESSAGE,
    NO_HYPOTHESIS_MESSAGE,
    NO_REFRAMING_MESSAGE,
    NO_ARTIFACT_MESSAGE,
    NO_PRESSURE_MESSAGE
} from '../types/iago.types';

export class IagoService {
    constructor(private aiClient: OpenAIClient) { }

    async analyzeContradictions(
        responses: DiagnosticResponse[],
        evidences: Evidence[]
    ): Promise<IagoAnalysisResult> {

        const contextStr = this.buildContradictionsContextString(responses, evidences);
        const prompt = this.buildContradictionsPrompt(contextStr);

        const rawOutput = await this.aiClient.complete(prompt);

        if (!rawOutput) {
            throw new Error("Empty response from AI");
        }

        return this.parseContradictionsOutput(rawOutput);
    }

    async formulateHypotheses(
        responses: DiagnosticResponse[],
        report: string
    ): Promise<IagoHypothesisResult> {
        const contextStr = this.buildHypothesesContextString(responses, report);
        const prompt = this.buildHypothesesPrompt(contextStr);

        const rawOutput = await this.aiClient.complete(prompt);

        if (!rawOutput) {
            throw new Error("Empty response from AI");
        }

        return this.parseHypothesesOutput(rawOutput);
    }

    async reframingProblem(
        report: string
    ): Promise<IagoReframingResult> {
        const prompt = this.buildReframingPrompt(report);
        const rawOutput = await this.aiClient.complete(prompt);

        if (!rawOutput) {
            throw new Error("Empty response from AI");
        }

        return this.parseReframingOutput(rawOutput);
    }

    async generatePreliminaryArtifact(
        hypotheses: StructuralHypothesis[],
        diagnosticContext: string
    ): Promise<IagoArtifactResult> {
        const prompt = this.buildArtifactPrompt(hypotheses, diagnosticContext);
        const rawOutput = await this.aiClient.complete(prompt);

        if (!rawOutput) {
            throw new Error("Empty response from AI");
        }

        return this.parseArtifactOutput(rawOutput);
    }

    async applyCognitivePressure(
        evidence: string,
        status: string
    ): Promise<IagoPressureResult> {
        const prompt = this.buildPressurePrompt(evidence, status);
        const rawOutput = await this.aiClient.complete(prompt);

        if (!rawOutput) {
            throw new Error("Empty response from AI");
        }

        return this.parsePressureOutput(rawOutput);
    }

    private buildContradictionsContextString(responses: DiagnosticResponse[], evidences: Evidence[]): string {
        let context = "--- DADOS PARA ANÁLISE ---\n\n";

        context += "RESPOSTAS DO DIAGNÓSTICO:\n";
        responses.forEach((r) => {
            context += `ID: ${r.response_id} | Questão: ${r.question_id} | Opção: ${r.answer_option_id} \n`;
        });

        context += "\nEVIDÊNCIAS:\n";
        if (evidences.length === 0) {
            context += "Nenhuma evidência fornecida.\n";
        } else {
            evidences.forEach((e) => {
                context += `ID: ${e.evidence_id} | Ação: ${e.selected_action_id} | Tipo: ${e.type} | Conteúdo: ${e.content} \n`;
            });
        }

        return context;
    }

    private buildHypothesesContextString(responses: DiagnosticResponse[], report: string): string {
        let context = "--- DADOS PARA ANÁLISE ---\n\n";

        context += "RELATO DO GESTOR:\n";
        context += report + "\n\n";

        context += "RESPOSTAS DO DIAGNÓSTICO:\n";
        responses.forEach((r) => {
            context += `ID: ${r.response_id} | Questão: ${r.question_id} | Opção: ${r.answer_option_id} \n`;
        });

        return context;
    }

    private buildContradictionsPrompt(contextData: string): string {
        return `
PROMPT 01 — IAGO_INTERPRETACAO_CONTRADICOES — V2

1. RESPONSABILIDADE COGNITIVA(ÚNICA)

Executar Interpretação de Padrões e Detecção de Contradições nas respostas do diagnóstico FCA e nas evidências textuais associadas.

⚠️ Esta responsabilidade é exclusivamente analítica.
Não envolve decisão, validação, encerramento ou recomendação.

⸻

2. ENTRADAS ESPERADAS
    •	Respostas estruturadas do diagnóstico FCA.
    •	Evidências textuais associadas às respostas(quando existirem).

Nenhuma outra entrada é permitida.

⸻

3. PROCESSAMENTO OBRIGATÓRIO

A IAGO DEVE:
    •	Analisar consistência lógica entre respostas.
    •	Confrontar respostas com evidências textuais.
    •	Identificar contradições:
    •	explícitas
    •	implícitas
    •	Considerar contradição quando:
    •	a evidência enfraquece, nega ou relativiza a resposta
    •	há exceção recorrente não refletida na resposta

A IAGO NÃO DEVE inferir intenção, justificar contexto ou relativizar falhas.

⸻

4. SAÍDA OBRIGATÓRIA(ESTRUTURA FECHADA)

Contradições Identificadas
    •	Se existirem contradições:
    •	Retornar lista numerada, onde cada item contém exatamente:
1.	Descrição objetiva da contradição(frase única, técnica).
    2.	Resposta(s) envolvida(s).
    3.	Evidência(s) conflitante(s).
    4.	Classificação da falha(ver seção 5).
    •	Se NÃO existirem contradições:
    •	Retornar exatamente:

${NO_CONTRADICTIONS_MESSAGE}

Nenhuma variação de texto é permitida.

⸻

5. CLASSIFICAÇÃO DA FALHA(OBRIGATÓRIA)

Para cada contradição, classificar exatamente uma opção:
    •	Processo
    •	Governança
    •	Métrica
    •	Decisão
    •	Execução
    •	Cultura

Sem explicação adicional.

⸻

6. PROIBIÇÕES EXPLÍCITAS(RÍGIDAS)

É terminantemente proibido à IAGO:
    •	Elogiar respostas.
    •	Validar coerência geral.
    •	Explicar o método FCA.
    •	Sugerir correções, ações ou melhorias.
    •	Emitir diagnóstico final.
    •	Concluir maturidade.
    •	Aprovar ou reprovar evidências.
    •	Utilizar linguagem motivacional ou pedagógica.

⸻

7. CRITÉRIOS DE AUDITORIA
    •	Linguagem técnica, objetiva e confrontacional quando aplicável.
    •	Nenhuma validação implícita ou explícita.
    •	Contradições demonstradas por relação direta resposta ↔ evidência.
    •	Saída estritamente conforme a estrutura definida.

⸻

${contextData}
`;
    }

    private buildHypothesesPrompt(contextData: string): string {
        return `
PROMPT 02 — IAGO_FORMULACAO_HIPOTESES — V2

1. RESPONSABILIDADE COGNITIVA(ÚNICA)

Converter sintomas relatados em hipóteses estruturais de causa raiz, sem fechamento conclusivo, sem decisão e sem autoridade diagnóstica.

A IAGO formula hipóteses, não diagnósticos.

⸻

2. ENTRADAS ESPERADAS
	•	Relato textual do gestor.
	•	Resultado consolidado do diagnóstico FCA.

Nenhuma outra entrada é permitida.

⸻

3. PROCESSAMENTO OBRIGATÓRIO

A IAGO DEVE:
	•	Isolar sintomas recorrentes ou estruturais.
	•	Descartar explicações baseadas em:
	•	comportamento individual
	•	intenção
	•	esforço
	•	motivação
	•	Traduzir sintomas em falhas de desenho do sistema, tais como:
	•	ausência de mecanismo
	•	fragilidade de governança
	•	inexistência de critério
	•	falha de acoplamento entre processo e decisão

A IAGO NÃO DEVE:
	•	aceitar narrativa como causa
	•	justificar contexto
	•	relativizar falha estrutural

⸻

4. SAÍDA OBRIGATÓRIA(ESTRUTURA FECHADA)

Hipóteses Estruturais
	•	Se existirem hipóteses válidas:
	•	Retornar lista numerada, onde cada item contém exatamente:
1.	Hipótese estrutural(frase única, linguagem sistêmica).
	2.	Sintoma(s) de origem associados(referência direta ao relato / diagnóstico).
	•	Se NÃO for possível formular hipótese estrutural válida:
	•	Retornar exatamente:

${NO_HYPOTHESIS_MESSAGE}

Nenhuma variação é permitida.

⸻

5. PROIBIÇÕES EXPLÍCITAS(RÍGIDAS)

É terminantemente proibido à IAGO:
	•	Propor solução.
	•	Gerar plano de ação.
	•	Recomendar priorização.
	•	Emitir diagnóstico final.
	•	Validar entendimento do gestor.
	•	Utilizar linguagem motivacional, comportamental ou emocional.
	•	Atribuir causa a pessoas ou equipes.

⸻

6. EXEMPLOS(LIMITADOS AO PADRÃO)

Exemplo proibido(NÃO replicar):
“Falta de comprometimento da equipe.”

Exemplo aceitável:
“Inexistência de mecanismo formal de responsabilização associado ao processo descrito.”

⸻

7. CRITÉRIOS DE AUDITORIA
	•	Sintoma nunca tratado como causa.
	•	Linguagem estrutural, sistêmica e impessoal.
	•	Nenhuma orientação prática.
	•	Saída estritamente conforme estrutura definida.

⸻

${contextData}
`;
    }

    private buildReframingPrompt(report: string): string {
        return `
PROMPT 03 — IAGO_REENQUADRAMENTO_ESTRUTURAL — V2

1. RESPONSABILIDADE COGNITIVA (ÚNICA)

Executar reenquadramento estrutural de linguagem emocional, personalista ou subjetiva, sem emitir juízo, sem validar percepção e sem exercer autoridade interpretativa.

A IAGO traduz linguagem, não avalia fatos.

⸻

2. ENTRADAS ESPERADAS
\t•\tTexto livre do gestor, em linguagem natural.

Nenhuma outra entrada é permitida.

⸻

3. PROCESSAMENTO OBRIGATÓRIO

A IAGO DEVE:
\t•\tEliminar:
\t•\temoção
\t•\turgência retórica
\t•\tjulgamento implícito
\t•\tatribuição a pessoas ou intenções
\t•\tSubstituir agentes individuais por:
\t•\tprocessos
\t•\tmecanismos
\t•\testruturas
\t•\tausência de desenho formal
\t•\tPreservar apenas o fato operacional, sem interpretação causal.

A IAGO NÃO DEVE:
\t•\texplicar o reenquadramento
\t•\tjustificar o texto original
\t•\trelativizar impacto
\t•\tsugerir melhoria

⸻

4. SAÍDA OBRIGATÓRIA (ESTRUTURA FECHADA)

Texto Reenquadrado
\t•\tUma única versão do relato em linguagem estrutural, impessoal e sistêmica.

Correspondência Estrutural
\t•\tLista objetiva no formato:
\t•\t"trecho original" → "reenquadramento estrutural"

⸻

5. REGRA DE SAÍDA NULA (OBRIGATÓRIA)

Se o texto já estiver em linguagem estrutural, retornar exatamente:

${NO_REFRAMING_MESSAGE}

Nenhuma variação é permitida.

⸻

6. PROIBIÇÕES EXPLÍCITAS (RÍGIDAS)

É terminantemente proibido à IAGO:
\t•\tConfortar o gestor.
\t•\tMotivar ou validar percepção.
\t•\tRelativizar impacto.
\t•\tInterpretar intenção.
\t•\tIntroduzir causa raiz.
\t•\tEmitir opinião.

⸻

7. EXEMPLOS (PADRÃO DE REFERÊNCIA)

Entrada emocional (exemplo):
“A equipe não se importa com os prazos.”

Saída esperada:
Texto Reenquadrado:
“Inexistem mecanismos formais de controle de prazo no processo descrito.”

Correspondência Estrutural:
“A equipe não se importa com os prazos” → “Inexistem mecanismos formais de controle de prazo no processo.”

⸻

8. CRITÉRIOS DE AUDITORIA
\t•\tPessoas sempre substituídas por sistemas.
\t•\tEmoção completamente eliminada.
\t•\tNenhuma explicação adicional.
\t•\tSaída estritamente conforme estrutura.

⸻

RELATO PARA ANÁLISE:
${report}
`;
    }

    private buildArtifactPrompt(hypotheses: StructuralHypothesis[], diagnosticContext: string): string {
        let context = "HIPÓTESES ESTRUTURAIS:\n";
        hypotheses.forEach((h, i) => {
            context += `${i + 1}. ${h.hypothesis}\n`;
        });
        context += `\nDIAGNÓSTICO CONSOLIDADO:\n${diagnosticContext}`;

        return `
PROMPT 04 — IAGO_GERACAO_ARTEFATOS_PRELIMINARES — V2

1. RESPONSABILIDADE COGNITIVA (ÚNICA)

Gerar artefatos cognitivos preliminares, não adotáveis, não normativos e não operacionais, destinados exclusivamente à reflexão estrutural, sem autoridade de desenho.

A IAGO não desenha solução.
A IAGO externaliza pensamento estrutural em forma bruta.

2. ENTRADAS ESPERADAS
    •	Hipóteses estruturais formuladas.
    •	Resultado consolidado do diagnóstico FCA.

Nenhuma outra entrada é permitida.

⸻

3. PROCESSAMENTO OBRIGATÓRIO

A IAGO DEVE:
    •	Converter hipóteses em representações conceituais incompletas.
    •	Operar no nível de:
    •	estrutura
    •	relação entre elementos
    •	ausência de mecanismos
    •	Tratar todo artefato como rascunho cognitivo, não como proposta.

A IAGO NÃO DEVE:
    •	fechar desenho
    •	sugerir implementação
    •	definir responsável, frequência ou métrica final
    •	indicar “como fazer”

4. SAÍDA OBRIGATÓRIA (ESTRUTURA FECHADA)

ARTEFATO PRELIMINAR — RASCUNHO COGNITIVO (NÃO FINAL)
O artefato DEVE ser explicitamente marcado no início com:

ATENÇÃO: Este é um artefato cognitivo preliminar. Não representa modelo final, padrão operacional ou recomendação de implementação.

O conteúdo PODE assumir apenas uma das formas abaixo (nunca mais de uma):
    •	Descrição conceitual de um processo (alto nível, sem fluxo fechado)
    •	Lista indicativa de possíveis dimensões de KPI (sem métricas)
    •	Descrição abstrata de um ritual (sem cadência ou responsáveis)
    •	Critérios conceituais de sucesso (sem mensuração)

⸻

5. REGRA DE SAÍDA NULA (OBRIGATÓRIA)

Se não houver hipóteses estruturais suficientes para gerar artefato, retornar exatamente:

${NO_ARTIFACT_MESSAGE}

Nenhuma variação é permitida.

⸻

6. PROIBIÇÕES EXPLÍCITAS (RÍGIDAS)

É terminantemente proibido à IAGO:
    •	Normatizar qualquer elemento.
    •	Padronizar práticas.
    •	Criar checklist.
    •	Definir processo final.
    •	Recomendar adoção.
    •	Usar linguagem prescritiva (“deve”, “precisa”, “ideal”).

⸻

7. EXEMPLOS (APENAS COMO REFERÊNCIA)

Exemplo proibido:
“Processo com responsáveis, etapas e SLA definidos.”

Exemplo aceitável:
“Fluxo conceitual indicando pontos onde decisões carecem de critério explícito.”

⸻

8. CRITÉRIOS DE AUDITORIA
    •	Artefato explicitamente marcado como preliminar.
    •	Nenhuma decisão operacional embutida.
    •	Linguagem abstrata, estrutural e incompleta.
    •	Impossível executar diretamente.

⸻

CONTEXTO PARA GERAÇÃO:
${context}
`;
    }

    private buildPressurePrompt(evidence: string, status: string): string {
        return `
PROMPT 05 — IAGO_PRESSAO_COGNITIVA_DISCIPLINADA — V2

RESPONSABILIDADE COGNITIVA (ÚNICA)

Exercer pressão cognitiva disciplinada sobre evidências e status declarados, sem julgar, sem decidir e sem invalidar.

A IAGO questiona evidência, não avalia resultado.

ENTRADAS
    •	Evidência textual apresentada.
    •	Status da ação declarada.

PROCESSAMENTO OBRIGATÓRIO

A IAGO DEVE:
    •	Testar se a evidência demonstra:
    •	mudança de critério
    •	mudança de mecanismo
    •	mudança de decisão
    •	Formular questionamentos técnicos, focados em estrutura.

A IAGO NÃO DEVE:
    •	concluir se houve ou não mudança
    •	validar ou invalidar status
    •	emitir juízo de suficiência

SAÍDA OBRIGATÓRIA (ESTRUTURA FECHADA)

Questionamentos Técnicos
    •	Se houver fragilidade ou ambiguidade:
    •	Lista numerada de perguntas técnicas objetivas, cada uma:
    •	focada em mecanismo, decisão ou critério
    •	sem julgamento implícito
    •	Se a evidência não permitir questionamento estrutural adicional, retornar exatamente:

${NO_PRESSURE_MESSAGE}

PROIBIÇÕES (RÍGIDAS)

É proibido à IAGO:
    •	Reprovar formalmente.
    •	Invalidar status.
    •	Julgar pessoas ou intenção.
    •	Sugerir correção, melhoria ou próximo passo.

CRITÉRIOS DE AUDITORIA
    •	Pressão sem julgamento.
    •	Perguntas testam estrutura, não esforço.
    •	Nenhuma decisão implícita.

⸻

DADOS PARA ANÁLISE:
Evidência: ${evidence}
Status Declarado: ${status}
`;
    }

    private parseContradictionsOutput(output: string): IagoAnalysisResult {
        const cleanOutput = output.trim();

        if (cleanOutput.includes(NO_CONTRADICTIONS_MESSAGE)) {
            return {
                has_contradictions: false,
                contradictions: [],
                raw_output: output
            };
        }

        const contradictions: Contradiction[] = [];

        const lines = cleanOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentContradiction: Partial<Contradiction> = {};

        for (const line of lines) {
            if (line.match(/^\d+\.\s*Descrição.*:/i) || line.match(/^1\.\s*Descrição/i)) {
                if (currentContradiction.description) {
                    if (this.isValidContradiction(currentContradiction)) {
                        contradictions.push(currentContradiction as Contradiction);
                        currentContradiction = {};
                    }
                }
                currentContradiction.description = line.replace(/^\d+\.\s*Descrição.*:\s*/i, '').replace(/^1\.\s*/, '').trim();
            } else if (line.match(/^\d+\.\s*Resposta.*:/i) || line.match(/^2\.\s*Resposta/i)) {
                const content = line.replace(/^\d+\.\s*Resposta.*:\s*/i, '').replace(/^2\.\s*/, '').trim();
                currentContradiction.related_responses = [content];
            } else if (line.match(/^\d+\.\s*Evidência.*:/i) || line.match(/^3\.\s*Evidência/i)) {
                const content = line.replace(/^\d+\.\s*Evidência.*:\s*/i, '').replace(/^3\.\s*/, '').trim();
                currentContradiction.conflicting_evidence = [content];
            } else if (line.match(/^\d+\.\s*Classificação.*:/i) || line.match(/^4\.\s*Classificação/i)) {
                const content = line.replace(/^\d+\.\s*Classificação.*:\s*/i, '').replace(/^4\.\s*/, '').trim();
                const classification = Object.values(FailureClassification).find(v => content.includes(v));
                if (classification) {
                    currentContradiction.classification = classification;
                }

                if (this.isValidContradiction(currentContradiction)) {
                    contradictions.push(currentContradiction as Contradiction);
                    currentContradiction = {};
                }
            }
        }

        if (this.isValidContradiction(currentContradiction)) {
            // Check if it's already in the list (simple Ref comparison wont work, but logic above usually pushes immediately)
            // The logic above pushes ON finding classification. If classification is last, it works.
            // If there is trailing text?
        }

        return {
            has_contradictions: contradictions.length > 0,
            contradictions,
            raw_output: output
        };
    }

    private parseHypothesesOutput(output: string): IagoHypothesisResult {
        const cleanOutput = output.trim();

        if (cleanOutput.includes(NO_HYPOTHESIS_MESSAGE)) {
            return {
                has_hypotheses: false,
                hypotheses: [],
                raw_output: output
            };
        }

        const hypotheses: StructuralHypothesis[] = [];

        const lines = cleanOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentHypothesis: Partial<StructuralHypothesis> = {};

        for (const line of lines) {
            // 1. Hipótese...
            // 2. Sintoma...
            if (line.match(/^\d+\.\s*Hipótese.*:/i) || line.match(/^1\.\s*Hipótese/i)) {
                if (currentHypothesis.hypothesis) {
                    if (currentHypothesis.hypothesis && currentHypothesis.related_symptoms) {
                        hypotheses.push(currentHypothesis as StructuralHypothesis);
                        currentHypothesis = {};
                    }
                }
                currentHypothesis.hypothesis = line.replace(/^\d+\.\s*Hipótese.*:\s*/i, '').replace(/^1\.\s*/, '').trim();
            } else if (line.match(/^\d+\.\s*Sintoma.*:/i) || line.match(/^2\.\s*Sintoma/i)) {
                const content = line.replace(/^\d+\.\s*Sintoma.*:\s*/i, '').replace(/^2\.\s*/, '').trim();
                currentHypothesis.related_symptoms = [content];

                if (currentHypothesis.hypothesis && currentHypothesis.related_symptoms) {
                    hypotheses.push(currentHypothesis as StructuralHypothesis);
                    currentHypothesis = {};
                }
            }
        }

        return {
            has_hypotheses: hypotheses.length > 0,
            hypotheses,
            raw_output: output
        };
    }

    private parseReframingOutput(output: string): IagoReframingResult {
        const cleanOutput = output.trim();

        if (cleanOutput.includes(NO_REFRAMING_MESSAGE)) {
            return {
                has_reframing: false,
                reframed_text: "",
                structural_correspondence: [],
                raw_output: output
            };
        }

        let reframedText = "";
        let correspondence: { original: string, reframed: string }[] = [];

        // Simple parsing: Look for "Texto Reenquadrado:" and "Correspondência Estrutural:" sections
        // Because the output format may vary slightly, we use regex to capture blocks.

        // Extract Reframed Text
        const textMatch = cleanOutput.match(/Texto Reenquadrado:?\s*\n?([\s\S]*?)(?=\n\s*Correspondência Estrutural|\n\s*$)/i);
        if (textMatch && textMatch[1]) {
            reframedText = textMatch[1].trim().replace(/^"|"$/g, '');
        }

        // Extract Correspondence
        // Look for lines that contain arrow "→" or "->"
        const correspondenceBlockMatch = cleanOutput.match(/Correspondência Estrutural:?\s*\n?([\s\S]*?)$/i);
        if (correspondenceBlockMatch && correspondenceBlockMatch[1]) {
            const lines = correspondenceBlockMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
            for (const line of lines) {
                // Regex to split by arrow
                const parts = line.split(/→|->/);
                if (parts.length >= 2) {
                    const original = parts[0].trim().replace(/^"|"$/g, '').replace(/^[•\-\*]\s*/, '').replace(/^"|"$/g, ''); // cleanup bullets and quotes
                    const reframed = parts.slice(1).join("->").trim().replace(/^"|"$/g, '');
                    correspondence.push({ original, reframed });
                }
            }
        }

        return {
            has_reframing: !!reframedText,
            reframed_text: reframedText,
            structural_correspondence: correspondence,
            raw_output: output
        };
    }

    private parseArtifactOutput(output: string): IagoArtifactResult {
        const cleanOutput = output.trim();

        if (cleanOutput.includes(NO_ARTIFACT_MESSAGE)) {
            return {
                has_artifact: false,
                artifact_title: "",
                artifact_content: "",
                refinement_suggestion: "",
                raw_output: output
            };
        }

        // The prompt asks for "ARTEFATO PRELIMINAR — RASCUNHO COGNITIVO" header but structure is freer than previous prompts.
        // It says "O conteúdo PODE assumir apenas uma das formas below".
        // It doesn't strictly enforce a "Título: X", "Conteúdo: Y" structure like Prompt 04 Draft did.
        // Wait, I should check if I missed strict output structure in the audited prompt.
        // The audited prompt says: "O artefato DEVE ser explicitamente marcado no início com: ATENÇÃO..."
        // And "O conteúdo PODE assumir...". It does NOT define "1. Título, 2. Conteúdo" rigidly?
        // Let re-read strict output section of audited prompt.
        // "4. SAÍDA OBRIGATÓRIA (ESTRUTURA FECHADA) ... ARTEFATO PRELIMINAR ... O artefato DEVE ser explicitamente marcado... O conteúdo PODE assumir..."
        // It DOES NOT prescribe fields like "Título" or "Sugestão".
        // So I should treat the whole output as the artifact content, capturing the title if inferred or just the full text.
        // HOWEVER, previous Prompt Draft had structure. Audited prompt removed "Sugestão de Refinamento"?
        // Checking audited prompt text provided by user:
        // "4. SAÍDA OBRIGATÓRIA... O conteúdo PODE assumir apenas uma das formas... (Descrição, Lista, Descrição, Critérios)"
        // It does NOT mention "Sugestão de Refinamento".
        // SO I will parse the entire output as content, but I might want to extract a title if possible?
        // Actually, let's look at the Interface `IagoArtifactResult`. I added `artifact_title` and `refinement_suggestion`.
        // If the prompt doesn't output them, I can't fill them.
        // I should probably simplify `IagoArtifactResult` or just map raw output to content.
        // I'll stick to mapping full output to content for now, and empty title/suggestion, unless I see a pattern.

        return {
            has_artifact: true,
            artifact_title: "Artefato Preliminar", // Generic title as prompt doesn't force one
            artifact_content: cleanOutput,
            refinement_suggestion: "", // Prompt doesn't generate this anymore
            raw_output: output
        };
    }

    private parsePressureOutput(output: string): IagoPressureResult {
        const cleanOutput = output.trim();

        if (cleanOutput.includes(NO_PRESSURE_MESSAGE)) {
            return {
                has_pressure: false,
                questions: [],
                raw_output: output
            };
        }

        const questions: string[] = [];
        const lines = cleanOutput.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        for (const line of lines) {
            // Check for numbered list items (e.g., "1. How does...")
            if (line.match(/^\d+\.\s*/)) {
                questions.push(line.replace(/^\d+\.\s*/, '').trim());
            }
        }

        return {
            has_pressure: questions.length > 0,
            questions,
            raw_output: output
        };
    }

    private isValidContradiction(c: Partial<Contradiction>): boolean {
        return !!(c.description && c.related_responses && c.conflicting_evidence && c.classification);
    }
}
