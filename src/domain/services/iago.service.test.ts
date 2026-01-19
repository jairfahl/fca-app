import { IagoService } from './iago.service';
import { OpenAIClient } from '../../infrastructure/ai/openai.client';
import {
    FailureClassification,
    IagoAnalysisResult,
    IagoHypothesisResult,
    NO_CONTRADICTIONS_MESSAGE,
    NO_HYPOTHESIS_MESSAGE,
    NO_REFRAMING_MESSAGE,
    NO_ARTIFACT_MESSAGE,
    NO_PRESSURE_MESSAGE
} from '../types/iago.types';

// Mock OpenAIClient
class MockOpenAIClient extends OpenAIClient {
    private mockResponse: string | null = null;

    constructor() {
        super();
    }

    setMockResponse(response: string | null) {
        this.mockResponse = response;
    }

    async complete(prompt: string): Promise<string | null> {
        return this.mockResponse;
    }
}

describe('IagoService', () => {
    let service: IagoService;
    let mockAi: MockOpenAIClient;

    beforeEach(() => {
        process.env.OPENAI_API_KEY = 'test-key';
        mockAi = new MockOpenAIClient();
        service = new IagoService(mockAi);
    });

    it('should correctly parse "No Contradictions" response', async () => {
        mockAi.setMockResponse(NO_CONTRADICTIONS_MESSAGE);

        const result = await service.analyzeContradictions([], []);

        expect(result.has_contradictions).toBe(false);
        expect(result.contradictions).toHaveLength(0);
    });

    it('should correctly parse a single contradiction', async () => {
        const output = `
1.
1. Descrição objetiva: A resposta afirma que o processo é manual, mas a evidência mostra automação.
    2. Resposta(s): R - 123
3. Evidência(s): E - 456
4. Classificação: Processo
    `;
        mockAi.setMockResponse(output);

        const result = await service.analyzeContradictions([], []);

        expect(result.has_contradictions).toBe(true);
        expect(result.contradictions).toHaveLength(1);
        expect(result.contradictions[0].description).toBe("A resposta afirma que o processo é manual, mas a evidência mostra automação.");
        expect(result.contradictions[0].classification).toBe(FailureClassification.PROCESSO);
    });

    it('should correctly parse multiple contradictions', async () => {
        const output = `
1.
1. Descrição objetiva: Contradição 1.
2. Resposta(s): R - 1
3. Evidência(s): E - 1
4. Classificação: Governança

2.
1. Descrição objetiva: Contradição 2.
2. Resposta(s): R - 2
3. Evidência(s): E - 2
4. Classificação: Execução
    `;
        mockAi.setMockResponse(output);

        const result = await service.analyzeContradictions([], []);

        expect(result.has_contradictions).toBe(true);
        expect(result.contradictions).toHaveLength(2);
        expect(result.contradictions[0].classification).toBe(FailureClassification.GOVERNANCA);
        expect(result.contradictions[1].classification).toBe(FailureClassification.EXECUCAO);
    });

    it('should handle flatter format if LLM outputs it', async () => {
        const output = `
1. Descrição objetiva: Contradição plana.
2. Resposta(s): R - A
3. Evidência(s): E - A
4. Classificação: Cultura
    `;
        mockAi.setMockResponse(output);

        const result = await service.analyzeContradictions([], []);

        expect(result.has_contradictions).toBe(true);
        expect(result.contradictions[0].description).toBe("Contradição plana.");
        expect(result.contradictions[0].classification).toBe(FailureClassification.CULTURA);
    });

    it('should handle API failure gracefully', async () => {
        mockAi.setMockResponse(null);

        await expect(service.analyzeContradictions([], []))
            .rejects
            .toThrow("Empty response from AI");
    });

    describe('formulateHypotheses', () => {
        it('should return no hypotheses when LLM indicates none', async () => {
            mockAi.setMockResponse(NO_HYPOTHESIS_MESSAGE);

            const result = await service.formulateHypotheses([], "Relato simples");

            expect(result.has_hypotheses).toBe(false);
            expect(result.hypotheses).toHaveLength(0);
            expect(result.raw_output).toBe(NO_HYPOTHESIS_MESSAGE);
        });

        it('should list valid hypotheses', async () => {
            const mockOutput = "1. Hipótese: Falha estrutural de governança na definição de papéis.\n2. Sintoma: Conflito de responsabilidades relatado.\n1. Hipótese: Ausência de mecanismo de feedback.\n2. Sintoma: Equipe reporta falta de orientação.";
            mockAi.setMockResponse(mockOutput);

            const result = await service.formulateHypotheses([], "Relato com problemas");

            expect(result.has_hypotheses).toBe(true);
            expect(result.hypotheses).toHaveLength(2);

            expect(result.hypotheses[0].hypothesis).toBe("Falha estrutural de governança na definição de papéis.");
            expect(result.hypotheses[0].related_symptoms).toContain("Conflito de responsabilidades relatado.");

            expect(result.hypotheses[1].hypothesis).toBe("Ausência de mecanismo de feedback.");
            expect(result.hypotheses[1].related_symptoms).toContain("Equipe reporta falta de orientação.");
        });
        describe('reframingProblem', () => {
            it('should return no reframing when LLM indicates text is already structural', async () => {
                mockAi.setMockResponse(NO_REFRAMING_MESSAGE);

                const result = await service.reframingProblem("Relato já estrutural");

                expect(result.has_reframing).toBe(false);
                expect(result.reframed_text).toBe("");
                expect(result.structural_correspondence).toHaveLength(0);
            });

            it('should parse valid reframing response with correspondence', async () => {
                const mockOutput = `
Texto Reenquadrado:
Inexistem mecanismos formais de controle de prazo no processo descrito.

Correspondência Estrutural:
"A equipe não se importa com os prazos" → "Inexistem mecanismos formais de controle de prazo no processo"
            `;
                mockAi.setMockResponse(mockOutput);

                const result = await service.reframingProblem("A equipe não se importa com os prazos");

                expect(result.has_reframing).toBe(true);
                expect(result.reframed_text).toContain("Inexistem mecanismos formais de controle de prazo");
                expect(result.structural_correspondence).toHaveLength(1);
                expect(result.structural_correspondence[0].original).toContain("A equipe não se importa com os prazos");
                expect(result.structural_correspondence[0].reframed).toContain("Inexistem mecanismos formais de controle de prazo");
            });
        });
    });

    describe('generatePreliminaryArtifact', () => {
        it('should return no artifact when LLM indicates insufficient basis', async () => {
            mockAi.setMockResponse(NO_ARTIFACT_MESSAGE);

            const result = await service.generatePreliminaryArtifact([], "Diagnóstico insuficiente");

            expect(result.has_artifact).toBe(false);
            expect(result.artifact_content).toBe("");
        });

        it('should parse valid preliminary artifact', async () => {
            const mockOutput = `
ATENÇÃO: Este é um artefato cognitivo preliminar. Não representa modelo final, padrão operacional ou recomendação de implementação.

Descrição conceitual de um processo
1. Entrada não verificada
2. Processamento sem critério
            `;
            mockAi.setMockResponse(mockOutput);

            const result = await service.generatePreliminaryArtifact([], "Contexto válido");

            expect(result.has_artifact).toBe(true);
            expect(result.artifact_content).toContain("Descrição conceitual de um processo");
            expect(result.artifact_content).toContain("ATENÇÃO: Este é um artefato cognitivo preliminar");
        });
    });

    describe('applyCognitivePressure', () => {
        it('should return no pressure when LLM indicates no structural weakness', async () => {
            mockAi.setMockResponse(NO_PRESSURE_MESSAGE);

            const result = await service.applyCognitivePressure("Evidência sólida", "Concluído");

            expect(result.has_pressure).toBe(false);
            expect(result.questions).toHaveLength(0);
        });

        it('should parse valid pressure questions', async () => {
            const mockOutput = `
Questionamentos Técnicos
1. Qual o mecanismo de controle?
2. O critério de sucesso foi alterado?
            `;
            mockAi.setMockResponse(mockOutput);

            const result = await service.applyCognitivePressure("Evidência fraca", "Em andamento");

            expect(result.has_pressure).toBe(true);
            expect(result.questions).toHaveLength(2);
            expect(result.questions[0]).toBe("Qual o mecanismo de controle?");
            expect(result.questions[1]).toBe("O critério de sucesso foi alterado?");
        });
    });
});
