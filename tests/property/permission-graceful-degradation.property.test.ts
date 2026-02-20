/**
 * Teste de propriedade para degradação graciosa do PermissionHelper
 *
 * **Feature: extensao-mv3-conformidade, Property 4: Degradação graciosa quando permissão é recusada**
 * **Validates: Requirements 2.7**
 *
 * Propriedade: Para qualquer permissão opcional (management, geolocation, notifications, tabCapture)
 * e para qualquer cenário onde o usuário recusa a permissão, o PermissionHelper.withPermission
 * SHALL executar o callback onDenied (se fornecido) ou retornar sem erro,
 * e SHALL NOT lançar exceção.
 *
 * @module permission-graceful-degradation.property.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import fc from 'fast-check';
import {
  createPermissionHelper,
  type PermissionHelper,
  type OptionalPermission,
} from '../../src/lib/permissions/permission-helper';

// ---------------------------------------------------------------------------
// Referências tipadas para os mocks do chrome (definidos no setup.ts global)
// ---------------------------------------------------------------------------

const sessionGet = chrome.storage.session.get as unknown as Mock;
const permContains = chrome.permissions.contains as unknown as Mock;

// ---------------------------------------------------------------------------
// Arbitrários (Generators) para fast-check
// ---------------------------------------------------------------------------

/**
 * Gerador de permissões opcionais válidas.
 * Produz valores do tipo OptionalPermission de forma uniforme.
 */
const arbOptionalPermission: fc.Arbitrary<OptionalPermission> = fc.constantFrom(
  'management' as OptionalPermission,
  'geolocation' as OptionalPermission,
  'notifications' as OptionalPermission,
  'tabCapture' as OptionalPermission,
);

/**
 * Gerador de valores de retorno arbitrários para o callback onDenied.
 * Inclui strings, números, objetos, null e undefined para cobrir
 * diversos tipos de retorno possíveis.
 */
const arbDeniedReturnValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.dictionary(fc.string(), fc.string()),
  fc.array(fc.integer()),
);

/**
 * Gerador de cenários de recusa de permissão.
 * Simula diferentes formas pelas quais chrome.permissions.contains pode
 * indicar que a permissão não está concedida.
 */
const arbDenialScenario: fc.Arbitrary<{
  label: string;
  setupMock: () => void;
}> = fc.constantFrom(
  {
    label: 'contains retorna false',
    setupMock: () => {
      permContains.mockResolvedValue(false);
    },
  },
  {
    label: 'contains lança erro genérico',
    setupMock: () => {
      permContains.mockRejectedValue(new Error('API indisponível'));
    },
  },
  {
    label: 'contains lança TypeError',
    setupMock: () => {
      permContains.mockRejectedValue(new TypeError('Tipo inválido'));
    },
  },
  {
    label: 'contains lança RangeError',
    setupMock: () => {
      permContains.mockRejectedValue(new RangeError('Fora do intervalo'));
    },
  },
);

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 4: Degradação graciosa quando permissão é recusada', () => {
  let helper: PermissionHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    // Cache vazio para forçar consulta à API do Chrome
    sessionGet.mockResolvedValue({});
    helper = createPermissionHelper();
  });

  /**
   * Propriedade 4a: withPermission NUNCA lança exceção quando permissão é recusada
   * e onDenied NÃO é fornecido.
   *
   * Para qualquer permissão opcional e qualquer cenário de recusa,
   * withPermission deve retornar undefined sem lançar exceção.
   */
  it('withPermission nunca lança exceção sem onDenied (retorna undefined)', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbDenialScenario,
        async (permission, scenario) => {
          // Preparar cenário de recusa
          vi.clearAllMocks();
          sessionGet.mockResolvedValue({});
          scenario.setupMock();

          const onGranted = vi.fn().mockResolvedValue('resultado-concedido');

          // Executar withPermission SEM onDenied
          const result = await helper.withPermission(permission, onGranted);

          // Verificações:
          // 1. Não deve ter chamado onGranted (permissão recusada)
          expect(onGranted).not.toHaveBeenCalled();

          // 2. Deve retornar undefined (sem onDenied)
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 4b: withPermission executa onDenied quando permissão é recusada
   * e onDenied É fornecido.
   *
   * Para qualquer permissão opcional, qualquer cenário de recusa e qualquer
   * valor de retorno do onDenied, withPermission deve executar onDenied
   * e retornar seu resultado sem lançar exceção.
   */
  it('withPermission executa onDenied e retorna seu resultado quando permissão é recusada', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbDenialScenario,
        arbDeniedReturnValue,
        async (permission, scenario, deniedValue) => {
          // Preparar cenário de recusa
          vi.clearAllMocks();
          sessionGet.mockResolvedValue({});
          scenario.setupMock();

          const onGranted = vi.fn().mockResolvedValue('resultado-concedido');
          const onDenied = vi.fn().mockResolvedValue(deniedValue);

          // Executar withPermission COM onDenied
          const result = await helper.withPermission(
            permission,
            onGranted,
            onDenied,
          );

          // Verificações:
          // 1. Não deve ter chamado onGranted (permissão recusada)
          expect(onGranted).not.toHaveBeenCalled();

          // 2. Deve ter chamado onDenied exatamente uma vez
          expect(onDenied).toHaveBeenCalledTimes(1);

          // 3. Deve retornar o valor do onDenied
          expect(result).toEqual(deniedValue);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 4c: withPermission nunca lança exceção independente
   * da presença ou ausência de onDenied.
   *
   * Combina ambos os cenários (com e sem onDenied) em uma única propriedade
   * para garantir que a degradação graciosa funciona em todos os casos.
   */
  it('withPermission nunca lança exceção para qualquer combinação de permissão, cenário e presença de onDenied', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbDenialScenario,
        fc.boolean(), // true = com onDenied, false = sem onDenied
        arbDeniedReturnValue,
        async (permission, scenario, hasOnDenied, deniedValue) => {
          // Preparar cenário de recusa
          vi.clearAllMocks();
          sessionGet.mockResolvedValue({});
          scenario.setupMock();

          const onGranted = vi.fn().mockResolvedValue('resultado-concedido');
          const onDenied = hasOnDenied
            ? vi.fn().mockResolvedValue(deniedValue)
            : undefined;

          // A chamada NUNCA deve lançar exceção
          const resultPromise = helper.withPermission(
            permission,
            onGranted,
            onDenied,
          );

          // Verificar que a Promise resolve (não rejeita)
          await expect(resultPromise).resolves.not.toThrow();

          // onGranted nunca deve ser chamado quando permissão é recusada
          expect(onGranted).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
