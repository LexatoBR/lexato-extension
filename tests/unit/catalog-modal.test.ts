/**
 * Testes unitários para CatalogModal
 *
 * Valida a interface CatalogData (presença do campo de coleção)
 * e as funções auxiliares de máscara/validação CNJ.
 *
 * Nota: Não renderiza o componente React (dependências complexas como
 * chrome.runtime, Supabase). Foca em lógica pura e contratos de tipo.
 *
 * Validates: Requirements 5.1, 1.5
 */

import { describe, it, expect } from 'vitest';
import { applyCnjMask, isValidCnj } from '../../src/preview/CatalogModal';
import type { CatalogData } from '../../src/preview/CatalogModal';

// -- Interface CatalogData: campo de coleção --

describe('CatalogData - campo de coleção', () => {
  it('deve aceitar dados sem coleção (campo opcional)', () => {
    const data: CatalogData = {
      title: 'Evidência de teste',
      tags: ['tag1'],
      caseNumber: '',
      notes: '',
    };

    expect(data.collectionId).toBeUndefined();
    expect(data.newCollection).toBeUndefined();
  });

  it('deve aceitar collectionId para coleção existente', () => {
    const data: CatalogData = {
      title: 'Evidência com coleção',
      tags: [],
      caseNumber: '',
      notes: '',
      collectionId: '550e8400-e29b-41d4-a716-446655440000',
    };

    expect(data.collectionId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('deve aceitar newCollection para criação inline', () => {
    const data: CatalogData = {
      title: 'Evidência com nova coleção',
      tags: [],
      caseNumber: '',
      notes: '',
      newCollection: {
        name: 'Caso Silva vs. Empresa X',
        description: 'Documentos do processo',
      },
    };

    expect(data.newCollection?.name).toBe('Caso Silva vs. Empresa X');
    expect(data.newCollection?.description).toBe('Documentos do processo');
  });

  it('deve aceitar newCollection sem descrição', () => {
    const data: CatalogData = {
      title: 'Teste',
      tags: [],
      caseNumber: '',
      notes: '',
      newCollection: {
        name: 'Auditoria Q1 2025',
      },
    };

    expect(data.newCollection?.name).toBe('Auditoria Q1 2025');
    expect(data.newCollection?.description).toBeUndefined();
  });
});

// -- Máscara CNJ integrada ao fluxo de catalogação --

describe('Máscara CNJ - cenários de catalogação', () => {
  it('deve formatar número CNJ válido para uso no CatalogData', () => {
    const rawInput = '00012345620248260001';
    const masked = applyCnjMask(rawInput);

    expect(masked).toBe('0001234-56.2024.8.26.0001');
    expect(isValidCnj(masked)).toBe(true);

    // Simula o dado que seria enviado no CatalogData
    const data: CatalogData = {
      title: 'Página de teste',
      tags: ['jurídico'],
      caseNumber: masked,
      notes: '',
    };

    expect(isValidCnj(data.caseNumber)).toBe(true);
  });

  it('deve permitir caseNumber vazio no CatalogData (campo opcional)', () => {
    const data: CatalogData = {
      title: 'Sem processo',
      tags: [],
      caseNumber: '',
      notes: '',
    };

    expect(isValidCnj(data.caseNumber)).toBe(true);
  });

  it('deve rejeitar número CNJ parcial como inválido', () => {
    const partial = applyCnjMask('123456789');
    expect(isValidCnj(partial)).toBe(false);
  });
});
