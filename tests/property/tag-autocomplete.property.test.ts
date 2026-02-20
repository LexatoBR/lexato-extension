/**
 * Testes de Propriedade para Autocomplete de Tags
 *
 * Feature: catalogacao-evidencias, Property 4: Autocomplete de tags
 *
 * Para qualquer conjunto de tags existentes e qualquer query de busca, os
 * resultados do autocomplete devem: (a) conter a query como substring
 * case-insensitive em cada tag retornada, (b) ter no máximo 10 itens,
 * (c) estar ordenados por frequência de uso decrescente, e (d) incluir
 * tags de membros da mesma organização quando o usuário pertence a uma.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 *
 * @module tests/property/tag-autocomplete.property
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// TIPOS
// =============================================================================

interface TagSuggestion {
  tag: string;
  count: number;
}

/** Evidência simplificada com tags, userId e organizationId */
interface EvidenceRecord {
  userId: string;
  organizationId: string | null;
  tags: string[];
}

// =============================================================================
// LÓGICA PURA DE AUTOCOMPLETE (espelho da lógica da Edge Function)
//
// A Edge Function usa uma query SQL com unnest(tags), filtro ILIKE,
// agrupamento por frequência e limite. Esta função replica essa lógica
// em TypeScript puro para testes de propriedade.
// =============================================================================

const DEFAULT_LIMIT = 10;

/**
 * Simula a lógica de autocomplete de tags conforme a Edge Function.
 *
 * 1. Filtra evidências visíveis pelo usuário (próprias + mesma organização)
 * 2. Faz unnest das tags
 * 3. Filtra por substring case-insensitive (ILIKE '%query%')
 * 4. Agrupa por tag e conta frequência
 * 5. Ordena por frequência decrescente
 * 6. Limita a `limit` resultados (máximo 10)
 */
function autocompleteTagsLogic(
  evidences: EvidenceRecord[],
  currentUserId: string,
  currentUserOrgId: string | null,
  query: string,
  limit: number = DEFAULT_LIMIT,
): TagSuggestion[] {
  // Limite efetivo: no máximo 10 (conforme Req 3.2)
  const effectiveLimit = Math.min(Math.max(1, limit), DEFAULT_LIMIT);

  // Filtrar evidências visíveis: do próprio usuário OU da mesma organização
  const visibleEvidences = evidences.filter((ev) => {
    if (ev.userId === currentUserId) return true;
    if (
      currentUserOrgId !== null &&
      ev.organizationId !== null &&
      ev.organizationId === currentUserOrgId
    ) {
      return true;
    }
    return false;
  });

  // Unnest: extrair todas as tags das evidências visíveis
  const allTags: string[] = [];
  for (const ev of visibleEvidences) {
    for (const tag of ev.tags) {
      allTags.push(tag);
    }
  }

  // Filtrar por substring case-insensitive (ILIKE '%query%')
  const lowerQuery = query.toLowerCase();
  const matchingTags = lowerQuery === ''
    ? allTags
    : allTags.filter((t) => t.toLowerCase().includes(lowerQuery));

  // Agrupar por tag e contar frequência
  const frequencyMap = new Map<string, number>();
  for (const tag of matchingTags) {
    frequencyMap.set(tag, (frequencyMap.get(tag) ?? 0) + 1);
  }

  // Converter para array de sugestões
  const suggestions: TagSuggestion[] = Array.from(frequencyMap.entries()).map(
    ([tag, count]) => ({ tag, count }),
  );

  // Ordenar por frequência decrescente (estável)
  suggestions.sort((a, b) => b.count - a.count);

  // Limitar resultados
  return suggestions.slice(0, effectiveLimit);
}

// =============================================================================
// GERADORES (Arbitraries)
// =============================================================================

/** Gera uma tag não vazia (1-30 caracteres alfanuméricos) */
const tagArb = fc.string({ minLength: 1, maxLength: 30 });

/** Gera um userId simples */
const userIdArb = fc.oneof(
  fc.constant('user-1'),
  fc.constant('user-2'),
  fc.constant('user-3'),
);

/** Gera um organizationId (pode ser null) */
const orgIdArb = fc.oneof(
  fc.constant(null),
  fc.constant('org-A'),
  fc.constant('org-B'),
);

/** Gera um registro de evidência com tags */
const evidenceRecordArb = fc.record({
  userId: userIdArb,
  organizationId: orgIdArb,
  tags: fc.array(tagArb, { minLength: 0, maxLength: 5 }),
});

/** Gera um conjunto de evidências */
const evidencesArb = fc.array(evidenceRecordArb, { minLength: 0, maxLength: 20 });

/** Gera uma query de busca (pode ser vazia) */
const queryArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 15 }),
);

// =============================================================================
// TESTES DE PROPRIEDADE
// =============================================================================

describe('Feature: catalogacao-evidencias, Property 4: Autocomplete de tags', () => {

  // ---------------------------------------------------------------------------
  // (a) Cada tag retornada contém a query como substring case-insensitive
  // ---------------------------------------------------------------------------

  it('cada tag retornada deve conter a query como substring case-insensitive', () => {
    /** Validates: Requirements 3.1 */
    fc.assert(
      fc.property(
        evidencesArb,
        userIdArb,
        orgIdArb,
        queryArb,
        (evidences, userId, orgId, query) => {
          const results = autocompleteTagsLogic(evidences, userId, orgId, query);
          const lowerQuery = query.toLowerCase();

          for (const suggestion of results) {
            expect(suggestion.tag.toLowerCase()).toContain(lowerQuery);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // (b) Resultados têm no máximo 10 itens
  // ---------------------------------------------------------------------------

  it('deve retornar no máximo 10 sugestões', () => {
    /** Validates: Requirements 3.2 */
    fc.assert(
      fc.property(
        evidencesArb,
        userIdArb,
        orgIdArb,
        queryArb,
        (evidences, userId, orgId, query) => {
          const results = autocompleteTagsLogic(evidences, userId, orgId, query);
          expect(results.length).toBeLessThanOrEqual(DEFAULT_LIMIT);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // (c) Resultados ordenados por frequência de uso decrescente
  // ---------------------------------------------------------------------------

  it('deve retornar sugestões ordenadas por frequência decrescente', () => {
    /** Validates: Requirements 3.3 */
    fc.assert(
      fc.property(
        evidencesArb,
        userIdArb,
        orgIdArb,
        queryArb,
        (evidences, userId, orgId, query) => {
          const results = autocompleteTagsLogic(evidences, userId, orgId, query);

          for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].count).toBeGreaterThanOrEqual(results[i].count);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // (d) Inclui tags de membros da mesma organização
  // ---------------------------------------------------------------------------

  it('deve incluir tags de membros da mesma organização', () => {
    /** Validates: Requirements 3.4 */
    fc.assert(
      fc.property(
        tagArb,
        (sharedTag) => {
          // Cenário controlado: user-1 pertence a org-A, user-2 também
          const evidences: EvidenceRecord[] = [
            { userId: 'user-2', organizationId: 'org-A', tags: [sharedTag] },
          ];

          const results = autocompleteTagsLogic(
            evidences,
            'user-1',    // usuário atual
            'org-A',     // organização do usuário atual
            '',          // query vazia retorna tudo
          );

          // A tag do colega de organização deve aparecer nos resultados
          const tagNames = results.map((r) => r.tag);
          expect(tagNames).toContain(sharedTag);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Tags de outras organizações NÃO devem aparecer
  // ---------------------------------------------------------------------------

  it('não deve incluir tags de membros de outras organizações', () => {
    /** Validates: Requirements 3.4 */
    fc.assert(
      fc.property(
        tagArb,
        (foreignTag) => {
          // user-1 pertence a org-A, user-3 pertence a org-B
          const evidences: EvidenceRecord[] = [
            { userId: 'user-3', organizationId: 'org-B', tags: [foreignTag] },
          ];

          const results = autocompleteTagsLogic(
            evidences,
            'user-1',
            'org-A',
            '',
          );

          // A tag de outra organização NÃO deve aparecer
          const tagNames = results.map((r) => r.tag);
          expect(tagNames).not.toContain(foreignTag);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Tags pessoais do usuário sempre aparecem (sem organização)
  // ---------------------------------------------------------------------------

  it('deve retornar tags pessoais do usuário mesmo sem organização', () => {
    /** Validates: Requirements 3.1 */
    fc.assert(
      fc.property(
        tagArb,
        (personalTag) => {
          const evidences: EvidenceRecord[] = [
            { userId: 'user-1', organizationId: null, tags: [personalTag] },
          ];

          const results = autocompleteTagsLogic(
            evidences,
            'user-1',
            null,
            '',
          );

          const tagNames = results.map((r) => r.tag);
          expect(tagNames).toContain(personalTag);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Frequência correta: tags repetidas devem ter count maior
  // ---------------------------------------------------------------------------

  it('deve calcular frequência corretamente para tags repetidas', () => {
    /** Validates: Requirements 3.3 */
    fc.assert(
      fc.property(
        tagArb,
        tagArb.filter((t) => t.length > 0),
        fc.nat({ max: 5 }),
        fc.nat({ max: 5 }),
        (tagA, tagB, extraA, extraB) => {
          // Garantir que as tags são diferentes para o teste fazer sentido
          fc.pre(tagA.toLowerCase() !== tagB.toLowerCase());

          const countA = extraA + 2; // tagA aparece pelo menos 2 vezes
          const countB = extraB + 1; // tagB aparece pelo menos 1 vez

          const evidences: EvidenceRecord[] = [];
          for (let i = 0; i < countA; i++) {
            evidences.push({ userId: 'user-1', organizationId: null, tags: [tagA] });
          }
          for (let i = 0; i < countB; i++) {
            evidences.push({ userId: 'user-1', organizationId: null, tags: [tagB] });
          }

          const results = autocompleteTagsLogic(evidences, 'user-1', null, '');

          const resultA = results.find((r) => r.tag === tagA);
          const resultB = results.find((r) => r.tag === tagB);

          if (resultA && resultB) {
            expect(resultA.count).toBe(countA);
            expect(resultB.count).toBe(countB);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Query vazia retorna as tags mais frequentes
  // ---------------------------------------------------------------------------

  it('query vazia deve retornar as tags mais frequentes (até 10)', () => {
    /** Validates: Requirements 3.1, 3.2, 3.5 (design: Req 3.5) */
    fc.assert(
      fc.property(
        evidencesArb,
        userIdArb,
        orgIdArb,
        (evidences, userId, orgId) => {
          const results = autocompleteTagsLogic(evidences, userId, orgId, '');

          // Deve respeitar o limite
          expect(results.length).toBeLessThanOrEqual(DEFAULT_LIMIT);

          // Deve estar ordenado por frequência decrescente
          for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].count).toBeGreaterThanOrEqual(results[i].count);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Filtro case-insensitive: "ABC" deve encontrar "abc" e vice-versa
  // ---------------------------------------------------------------------------

  it('filtro deve ser case-insensitive', () => {
    /** Validates: Requirements 3.1 */
    fc.assert(
      fc.property(
        tagArb.filter((t) => t.length >= 2),
        (tag) => {
          const evidences: EvidenceRecord[] = [
            { userId: 'user-1', organizationId: null, tags: [tag] },
          ];

          // Buscar com query em uppercase
          const upperResults = autocompleteTagsLogic(
            evidences, 'user-1', null, tag.toUpperCase(),
          );
          // Buscar com query em lowercase
          const lowerResults = autocompleteTagsLogic(
            evidences, 'user-1', null, tag.toLowerCase(),
          );

          // Ambas as buscas devem retornar a mesma tag
          expect(upperResults.length).toBe(lowerResults.length);
          if (upperResults.length > 0) {
            expect(upperResults[0].tag).toBe(lowerResults[0].tag);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
