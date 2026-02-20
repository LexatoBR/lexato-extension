/**
 * Testes de Propriedade para Validação de Catalogação
 *
 * Feature: catalogacao-evidencias, Property 2: Validação de dados de catalogação
 *
 * Para qualquer string de título com mais de 200 caracteres, OU array de tags
 * com mais de 10 elementos, OU tag individual com mais de 50 caracteres, OU
 * número CNJ que não corresponde ao formato NNNNNNN-DD.AAAA.J.TR.OOOO, OU
 * nome de coleção vazio ou com mais de 100 caracteres, a validação deve rejeitar
 * os dados e retornar erro descritivo. Inversamente, dados dentro dos limites
 * devem ser aceitos.
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 4.2, 8.4
 *
 * @module tests/property/catalog-validation.property
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';

// =============================================================================
// SCHEMAS LOCAIS (espelho do backend/src/schemas/catalog.schema.ts)
// Importação direta do backend não é possível por serem pacotes separados.
// Os schemas são replicados aqui para validação de propriedade.
// =============================================================================

const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

const CatalogDataSchema = z.object({
  title: z.string().max(200, 'Título deve ter no máximo 200 caracteres').optional(),
  tags: z.array(
    z.string().max(50, 'Tag deve ter no máximo 50 caracteres')
  ).max(10, 'Máximo de 10 tags').optional(),
  caseNumber: z.string()
    .refine(val => !val || CNJ_REGEX.test(val), 'Número CNJ inválido')
    .optional(),
  notes: z.string().max(1000, 'Notas devem ter no máximo 1000 caracteres').optional(),
  collectionId: z.string().uuid('ID de coleção inválido').optional(),
});

const CreateCollectionSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(100, 'Nome deve ter no máximo 100 caracteres'),
  description: z.string().max(500).optional(),
  isShared: z.boolean().optional().default(false),
});

// =============================================================================
// GERADORES (Arbitraries)
// =============================================================================

/** Gera número CNJ válido no formato NNNNNNN-DD.AAAA.J.TR.OOOO */
const pad = (n: number, len: number) => String(n).padStart(len, '0');
const validCnjArb = fc.tuple(
  fc.nat({ max: 9999999 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 9999 }),
  fc.nat({ max: 9 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 9999 }),
).map(([n, dd, aaaa, j, tr, oooo]) =>
  `${pad(n, 7)}-${pad(dd, 2)}.${pad(aaaa, 4)}.${pad(j, 1)}.${pad(tr, 2)}.${pad(oooo, 4)}`
);

/** Gera título válido (1-200 caracteres) */
const validTitleArb = fc.string({ minLength: 1, maxLength: 200 });

/** Gera tag válida (1-50 caracteres) */
const validTagArb = fc.string({ minLength: 1, maxLength: 50 });

/** Gera array de tags válido (0-10 tags, cada uma 1-50 caracteres) */
const validTagsArb = fc.array(validTagArb, { minLength: 0, maxLength: 10 });

/** Gera nome de coleção válido (1-100 caracteres) */
const validCollectionNameArb = fc.string({ minLength: 1, maxLength: 100 });

// =============================================================================
// TESTES DE PROPRIEDADE
// =============================================================================

describe('Feature: catalogacao-evidencias, Property 2: Validação de dados de catalogação', () => {

  // ---------------------------------------------------------------------------
  // Caminho positivo: dados válidos devem ser aceitos
  // ---------------------------------------------------------------------------

  it('deve aceitar dados de catalogação válidos', () => {
    /** Validates: Requirements 1.3, 1.4, 1.5 */
    fc.assert(
      fc.property(
        validTitleArb,
        validTagsArb,
        validCnjArb,
        (title, tags, caseNumber) => {
          const result = CatalogDataSchema.safeParse({ title, tags, caseNumber });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deve aceitar dados de catalogação com campos opcionais ausentes', () => {
    /** Validates: Requirements 1.3, 1.4, 1.5 */
    fc.assert(
      fc.property(
        fc.record({
          title: fc.option(validTitleArb, { nil: undefined }),
          tags: fc.option(validTagsArb, { nil: undefined }),
          caseNumber: fc.option(validCnjArb, { nil: undefined }),
        }),
        (data) => {
          const result = CatalogDataSchema.safeParse(data);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: título com mais de 200 caracteres
  // ---------------------------------------------------------------------------

  it('deve rejeitar título com mais de 200 caracteres', () => {
    /** Validates: Requirements 1.3 */
    fc.assert(
      fc.property(
        fc.string({ minLength: 201, maxLength: 500 }),
        (title) => {
          const result = CatalogDataSchema.safeParse({ title });
          expect(result.success).toBe(false);
          if (!result.success) {
            const fieldPaths = result.error.issues.map(i => i.path.join('.'));
            expect(fieldPaths).toContain('title');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: mais de 10 tags
  // ---------------------------------------------------------------------------

  it('deve rejeitar array com mais de 10 tags', () => {
    /** Validates: Requirements 1.4 */
    fc.assert(
      fc.property(
        fc.array(validTagArb, { minLength: 11, maxLength: 20 }),
        (tags) => {
          const result = CatalogDataSchema.safeParse({ tags });
          expect(result.success).toBe(false);
          if (!result.success) {
            const fieldPaths = result.error.issues.map(i => i.path.join('.'));
            expect(fieldPaths).toContain('tags');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: tag individual com mais de 50 caracteres
  // ---------------------------------------------------------------------------

  it('deve rejeitar tag individual com mais de 50 caracteres', () => {
    /** Validates: Requirements 1.4 */
    fc.assert(
      fc.property(
        fc.string({ minLength: 51, maxLength: 150 }),
        (longTag) => {
          const result = CatalogDataSchema.safeParse({ tags: [longTag] });
          expect(result.success).toBe(false);
          if (!result.success) {
            // O erro deve apontar para o elemento dentro do array de tags
            const hasTagError = result.error.issues.some(
              i => i.path[0] === 'tags'
            );
            expect(hasTagError).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: número CNJ com formato inválido
  // ---------------------------------------------------------------------------

  it('deve rejeitar número CNJ com formato inválido', () => {
    /** Validates: Requirements 1.5 */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !CNJ_REGEX.test(s)),
        (invalidCnj) => {
          const result = CatalogDataSchema.safeParse({ caseNumber: invalidCnj });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: nome de coleção vazio
  // ---------------------------------------------------------------------------

  it('deve rejeitar nome de coleção vazio', () => {
    /** Validates: Requirements 4.2 */
    const result = CreateCollectionSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasNameError = result.error.issues.some(i => i.path[0] === 'name');
      expect(hasNameError).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Caminho negativo: nome de coleção com mais de 100 caracteres
  // ---------------------------------------------------------------------------

  it('deve rejeitar nome de coleção com mais de 100 caracteres', () => {
    /** Validates: Requirements 4.2 */
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 300 }),
        (longName) => {
          const result = CreateCollectionSchema.safeParse({ name: longName });
          expect(result.success).toBe(false);
          if (!result.success) {
            const hasNameError = result.error.issues.some(i => i.path[0] === 'name');
            expect(hasNameError).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Caminho positivo: nome de coleção válido (1-100 caracteres)
  // ---------------------------------------------------------------------------

  it('deve aceitar nome de coleção válido (1-100 caracteres)', () => {
    /** Validates: Requirements 4.2 */
    fc.assert(
      fc.property(
        validCollectionNameArb,
        (name) => {
          const result = CreateCollectionSchema.safeParse({ name });
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Validação cruzada: erro 400 com mensagem descritiva (Req 8.4)
  // ---------------------------------------------------------------------------

  it('deve retornar mensagens descritivas indicando campos inválidos', () => {
    /** Validates: Requirements 8.4 */
    fc.assert(
      fc.property(
        fc.record({
          title: fc.option(fc.string({ minLength: 201, maxLength: 500 }), { nil: undefined }),
          tags: fc.option(
            fc.array(fc.string({ minLength: 51, maxLength: 100 }), { minLength: 1, maxLength: 3 }),
            { nil: undefined }
          ),
          caseNumber: fc.option(fc.constant('invalido-cnj'), { nil: undefined }),
        }).filter(d => d.title !== undefined || d.tags !== undefined || d.caseNumber !== undefined),
        (invalidData) => {
          const result = CatalogDataSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
          if (!result.success) {
            // Cada issue deve ter mensagem não vazia
            for (const issue of result.error.issues) {
              expect(issue.message.length).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
