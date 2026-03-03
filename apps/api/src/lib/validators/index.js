/**
 * Schemas Zod para validação de input nos endpoints críticos.
 *
 * Uso:
 *   const { validate, schemas } = require('./validators');
 *   router.post('/path', validate(schemas.evidenceSchema), handler);
 */
const { z } = require('zod');

// ─── Schemas ────────────────────────────────────────────────────────────────

const answerSchema = z.object({
  company_id: z.string().uuid('company_id deve ser UUID'),
  answers: z
    .array(
      z.object({
        process_key: z.string().min(1, 'process_key obrigatório'),
        question_key: z.string().min(1, 'question_key obrigatório'),
        answer_value: z.number().int().min(1).max(5),
      })
    )
    .min(1, 'Pelo menos uma resposta é obrigatória'),
});

const evidenceSchema = z.object({
  before_value: z.string().min(1, 'before_value obrigatório').max(500),
  after_value: z.string().min(1, 'after_value obrigatório').max(500),
  evidence_url: z.string().url('URL de evidência inválida').optional().or(z.literal('')).optional(),
  declared_gain: z.string().max(500).optional(),
});

const planSelectSchema = z.object({
  company_id: z.string().uuid('company_id deve ser UUID'),
  action_keys: z
    .array(z.string().min(1))
    .min(1, 'Selecione pelo menos 1 ação')
    .max(10, 'Máximo de 10 ações por plano'),
});

const dodConfirmSchema = z.object({
  confirmed: z.boolean(),
  checklist: z.array(z.string()).optional(),
});

const schemas = {
  answerSchema,
  evidenceSchema,
  planSelectSchema,
  dodConfirmSchema,
};

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Middleware de validação Zod.
 * Valida req.body contra o schema fornecido.
 * Retorna 400 com detalhes se inválido.
 *
 * @param {import('zod').ZodSchema} schema
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message_user: 'Dados inválidos na requisição.',
        error: 'Dados inválidos na requisição.',
        issues,
      });
    }
    req.body = result.data; // replace with parsed/coerced data
    next();
  };
}

module.exports = { validate, schemas };
