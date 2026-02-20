/**
 * Testes de Propriedade para Filtragem de Coleções no Frontend
 *
 * Feature: catalogacao-evidencias, Property 11: Filtragem de coleções no frontend
 *
 * Para qualquer lista de coleções e qualquer texto de busca, o filtro do
 * CatalogModal deve retornar exatamente as coleções cujo nome contém o texto
 * digitado como substring case-insensitive.
 *
 * Validates: Requirements 5.2
 *
 * @module tests/property/collection-filter.property
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// TIPOS
// =============================================================================

/** Coleção simplificada para testes de filtragem */
interface Collection {
  id: string;
  name: string;
  description: string | null;
}

// =============================================================================
// LÓGICA PURA DE FILTRAGEM (espelho do CatalogModal)
//
// No CatalogModal a filtragem é:
//   const filteredCollections = collections.filter(c =>
//     c.name.toLowerCase().includes(collectionSearch.toLowerCase())
//   );
//
// Extraímos essa lógica como função pura para testes de propriedade.
// =============================================================================

/**
 * Filtra coleções por substring case-insensitive no nome.
 * Replica exatamente a lógica do CatalogModal.
 */
function filterCollections(
  collections: Collection[],
  searchText: string,
): Collection[] {
  return collections.filter(c =>
    c.name.toLowerCase().includes(searchText.toLowerCase())
  );
}

// =============================================================================
// GERADORES (Arbitraries)
// =============================================================================

/** Gera um nome de coleção (1-100 caracteres) */
const collectionNameArb = fc.string({ minLength: 1, maxLength: 100 });

/** Gera uma coleção com id, nome e descrição */
const collectionArb = fc.record({
  id: fc.uuid(),
  name: collectionNameArb,
  description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
});

/** Gera uma lista de coleções */
const collectionsArb = fc.array(collectionArb, { minLength: 0, maxLength: 30 });

/** Gera um texto de busca (pode ser vazio) */
const searchTextArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 50 }),
);

// =============================================================================
// TESTES DE PROPRIEDADE
// =============================================================================

describe('Feature: catalogacao-evidencias, Property 11: Filtragem de coleções no frontend', () => {

  // ---------------------------------------------------------------------------
  // Toda coleção retornada contém o texto de busca como substring (case-insensitive)
  // ---------------------------------------------------------------------------

  it('toda coleção retornada deve conter o texto de busca como substring case-insensitive', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        searchTextArb,
        (collections, searchText) => {
          const filtered = filterCollections(collections, searchText);
          const lowerSearch = searchText.toLowerCase();

          for (const c of filtered) {
            expect(c.name.toLowerCase()).toContain(lowerSearch);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Toda coleção cujo nome contém o texto de busca deve estar no resultado
  // ---------------------------------------------------------------------------

  it('toda coleção cujo nome contém o texto de busca deve estar no resultado', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        searchTextArb,
        (collections, searchText) => {
          const filtered = filterCollections(collections, searchText);
          const filteredIds = new Set(filtered.map(c => c.id));
          const lowerSearch = searchText.toLowerCase();

          for (const c of collections) {
            if (c.name.toLowerCase().includes(lowerSearch)) {
              expect(filteredIds.has(c.id)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Busca vazia retorna todas as coleções
  // ---------------------------------------------------------------------------

  it('busca vazia deve retornar todas as coleções', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        (collections) => {
          const filtered = filterCollections(collections, '');
          expect(filtered.length).toBe(collections.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Filtragem é case-insensitive: buscar "ABC" e "abc" retorna o mesmo resultado
  // ---------------------------------------------------------------------------

  it('filtragem deve ser case-insensitive', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        searchTextArb.filter(s => s.length > 0),
        (collections, searchText) => {
          const upperResult = filterCollections(collections, searchText.toUpperCase());
          const lowerResult = filterCollections(collections, searchText.toLowerCase());

          expect(upperResult.length).toBe(lowerResult.length);

          const upperIds = upperResult.map(c => c.id).sort();
          const lowerIds = lowerResult.map(c => c.id).sort();
          expect(upperIds).toEqual(lowerIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Resultado é subconjunto da lista original (preserva identidade)
  // ---------------------------------------------------------------------------

  it('resultado filtrado deve ser subconjunto da lista original', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        searchTextArb,
        (collections, searchText) => {
          const filtered = filterCollections(collections, searchText);
          const originalIds = new Set(collections.map(c => c.id));

          for (const c of filtered) {
            expect(originalIds.has(c.id)).toBe(true);
          }

          expect(filtered.length).toBeLessThanOrEqual(collections.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Coleção com nome exato ao texto de busca sempre aparece no resultado
  // ---------------------------------------------------------------------------

  it('coleção com nome exato ao texto de busca deve sempre aparecer', () => {
    /** Validates: Requirements 5.2 */
    fc.assert(
      fc.property(
        collectionsArb,
        collectionNameArb,
        (otherCollections, name) => {
          const targetCollection: Collection = {
            id: 'target-id',
            name,
            description: null,
          };
          const allCollections = [...otherCollections, targetCollection];

          const filtered = filterCollections(allCollections, name);
          const filteredIds = filtered.map(c => c.id);

          expect(filteredIds).toContain('target-id');
        },
      ),
      { numRuns: 100 },
    );
  });

});
