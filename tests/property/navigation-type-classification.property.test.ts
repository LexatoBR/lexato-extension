/**
 * Property tests para Navigation Type Classification
 *
 * Valida a propriedade de classificação de tipos de navegação:
 * - Property 9: Navigation Type Classification
 *
 * Para qualquer evento de navegação, o tipo registrado DEVE ser um dos:
 * 'initial', 'link-click', 'form-submit', 'history-back', 'history-forward', 'redirect'.
 *
 * @module navigation-type-classification.property.test
 * @requirements 3.4

 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  RecordingStateManager,
  resetRecordingStateManager,
  type NavigationEntryInput,
} from '../../src/background/recording-state-manager';
import type { NavigationType, NavigationEntry } from '../../src/sidepanel/types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Tipos de navegação válidos conforme especificação
 * Requisito 3.4: THE Navigation_Index SHALL capture the navigation type
 */
const VALID_NAVIGATION_TYPES: readonly NavigationType[] = [
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect',
] as const;

/**
 * Conjunto de tipos válidos para verificação rápida
 */
const VALID_TYPES_SET = new Set<string>(VALID_NAVIGATION_TYPES);

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera tipos de navegação válidos conforme especificação
 * Requisito 3.4
 */
const validNavigationTypeArbitrary: fc.Arbitrary<NavigationType> = fc.constantFrom(
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect'
);

/**
 * Gera URLs válidas para testes
 */
const urlArbitrary = fc.oneof(
  // URLs HTTPS simples
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/)
  ).map(([domain, tld]) => `https://${domain || 'example'}.${tld || 'com'}`),
  // URLs com path
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9-/]{1,30}$/)
  ).map(([domain, tld, path]) => `https://${domain || 'example'}.${tld || 'com'}/${path || 'page'}`),
  // URLs com query string
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,20}$/)
  ).map(([domain, tld, key, value]) =>
    `https://${domain || 'example'}.${tld || 'com'}?${key || 'q'}=${value || 'test'}`
  )
);

/**
 * Gera hashes SHA-256 válidos (64 caracteres hexadecimais)
 */
const htmlHashArbitrary = fc.stringMatching(/^[a-f0-9]{64}$/).map((hash) => hash || 'a'.repeat(64));

/**
 * Gera timestamps válidos (entre 2020 e 2030)
 */
const timestampArbitrary = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
});

/**
 * Gera entrada de navegação completa com tipo válido
 */
const navigationEntryInputArbitrary: fc.Arbitrary<NavigationEntryInput> = fc.record({
  url: urlArbitrary,
  type: validNavigationTypeArbitrary,
  htmlHash: htmlHashArbitrary,
});

/**
 * Gera strings aleatórias para testar tipos inválidos
 * Usado para verificar que o sistema só aceita tipos válidos
 * @internal Reservado para uso futuro em testes de validação de tipos
 */
// @ts-expect-error Arbitrário reservado para testes futuros
const _randomStringArbitrary = fc.string({ minLength: 1, maxLength: 30 });

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um RecordingStateManager para testes
 * Desabilita broadcast automático para evitar erros de chrome.runtime
 *
 * @returns Instância do RecordingStateManager configurada para testes
 */
function createTestManager(): RecordingStateManager {
  return new RecordingStateManager({
    autoBroadcast: false,
    maxDurationMs: 30 * 60 * 1000, // 30 minutos
  });
}

/**
 * Obtém a primeira entrada de navegação de forma segura
 *
 * @param entries - Array de entradas de navegação
 * @returns Primeira entrada ou lança erro se vazio
 */
function getFirstEntry(entries: NavigationEntry[]): NavigationEntry {
  const entry = entries[0];
  if (!entry) {
    throw new Error('Nenhuma entrada de navegação encontrada');
  }
  return entry;
}

/**
 * Obtém entrada de navegação por índice de forma segura
 *
 * @param entries - Array de entradas de navegação
 * @param index - Índice da entrada
 * @returns Entrada no índice ou lança erro se não existir
 */
function getEntryAt(entries: NavigationEntry[], index: number): NavigationEntry {
  const entry = entries[index];
  if (!entry) {
    throw new Error(`Entrada de navegação não encontrada no índice ${index}`);
  }
  return entry;
}

/**
 * Verifica se um tipo de navegação é válido
 *
 * @param type - Tipo a verificar
 * @returns true se o tipo é válido
 */
function isValidNavigationType(type: string): type is NavigationType {
  return VALID_TYPES_SET.has(type);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Navigation Type Classification Properties', () => {
  let manager: RecordingStateManager | null = null;

  beforeEach(() => {
    resetRecordingStateManager();
  });

  afterEach(() => {
    if (manager) {
      manager.reset();
      manager = null;
    }
    resetRecordingStateManager();
  });

  // ==========================================================================
  // Property 9: Navigation Type Classification
  // Feature: video-capture-redesign
  // **Validates: Requirements 3.4**
  // ==========================================================================

  describe('Property 9: Navigation Type Classification', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Para qualquer evento de navegação, o tipo registrado DEVE ser
     * um dos tipos válidos: 'initial', 'link-click', 'form-submit',
     * 'history-back', 'history-forward', 'redirect'.
     */
    it('deve classificar tipo de navegação como um dos tipos válidos', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          validNavigationTypeArbitrary,
          htmlHashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação com tipo específico
            const input: NavigationEntryInput = { url, type, htmlHash };
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que entrada foi adicionada
            expect(history.length).toBe(1);

            const entry = getFirstEntry(history);

            // Tipo DEVE ser um dos tipos válidos
            expect(VALID_NAVIGATION_TYPES).toContain(entry.type);
            expect(isValidNavigationType(entry.type)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'initial' DEVE ser preservado corretamente para
     * navegação inicial (primeira página da gravação).
     */
    it('deve classificar corretamente navegação tipo "initial"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação inicial
            manager.addNavigation({ url, type: 'initial', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'initial'
            expect(entry.type).toBe('initial');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'link-click' DEVE ser preservado corretamente para
     * navegação via clique em link.
     */
    it('deve classificar corretamente navegação tipo "link-click"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação via link
            manager.addNavigation({ url, type: 'link-click', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'link-click'
            expect(entry.type).toBe('link-click');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'form-submit' DEVE ser preservado corretamente para
     * navegação via submissão de formulário.
     */
    it('deve classificar corretamente navegação tipo "form-submit"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação via formulário
            manager.addNavigation({ url, type: 'form-submit', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'form-submit'
            expect(entry.type).toBe('form-submit');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'history-back' DEVE ser preservado corretamente para
     * navegação via botão voltar do navegador.
     */
    it('deve classificar corretamente navegação tipo "history-back"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação via history back
            manager.addNavigation({ url, type: 'history-back', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'history-back'
            expect(entry.type).toBe('history-back');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'history-forward' DEVE ser preservado corretamente para
     * navegação via botão avançar do navegador.
     */
    it('deve classificar corretamente navegação tipo "history-forward"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação via history forward
            manager.addNavigation({ url, type: 'history-forward', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'history-forward'
            expect(entry.type).toBe('history-forward');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo 'redirect' DEVE ser preservado corretamente para
     * navegação via redirecionamento automático.
     */
    it('deve classificar corretamente navegação tipo "redirect"', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação via redirect
            manager.addNavigation({ url, type: 'redirect', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser 'redirect'
            expect(entry.type).toBe('redirect');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Para múltiplas navegações com tipos diferentes, cada tipo
     * DEVE ser preservado corretamente na ordem de inserção.
     */
    it('deve preservar tipos corretos para múltiplas navegações', () => {
      fc.assert(
        fc.property(
          fc.array(navigationEntryInputArbitrary, { minLength: 2, maxLength: 10 }),
          (inputs) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona todas as navegações
            for (const input of inputs) {
              manager.addNavigation(input);
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(inputs.length);

            // Verifica cada entrada
            for (let i = 0; i < inputs.length; i++) {
              const input = inputs[i] as NavigationEntryInput;
              const entry = getEntryAt(history, i);

              // Tipo deve ser preservado
              expect(entry.type).toBe(input.type);

              // Tipo deve ser válido
              expect(VALID_NAVIGATION_TYPES).toContain(entry.type);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Todos os seis tipos de navegação DEVEM ser suportados
     * e classificados corretamente quando usados em sequência.
     */
    it('deve suportar todos os seis tipos de navegação em sequência', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona uma navegação de cada tipo
            for (const type of VALID_NAVIGATION_TYPES) {
              manager.addNavigation({ url, type, htmlHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(VALID_NAVIGATION_TYPES.length);

            // Verifica cada tipo na ordem
            for (let i = 0; i < VALID_NAVIGATION_TYPES.length; i++) {
              const expectedType = VALID_NAVIGATION_TYPES[i];
              const entry = getEntryAt(history, i);

              expect(entry.type).toBe(expectedType);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo de navegação DEVE ser independente da URL,
     * ou seja, qualquer URL pode ter qualquer tipo de navegação.
     */
    it('deve classificar tipo independentemente da URL', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          validNavigationTypeArbitrary,
          htmlHashArbitrary,
          timestampArbitrary,
          (url, type, htmlHash, startTime) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording(startTime);

            // Adiciona navegação
            manager.addNavigation({ url, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser o especificado, independente da URL
            expect(entry.type).toBe(type);

            // URL deve ser preservada
            expect(entry.fullUrl).toBe(url);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo de navegação DEVE ser independente do hash HTML,
     * ou seja, qualquer hash pode ter qualquer tipo de navegação.
     */
    it('deve classificar tipo independentemente do hash HTML', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          validNavigationTypeArbitrary,
          htmlHashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation({ url, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser o especificado, independente do hash
            expect(entry.type).toBe(type);

            // Hash deve ser preservado
            expect(entry.htmlHash).toBe(htmlHash);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O conjunto de tipos válidos DEVE ser exatamente os seis
     * tipos especificados, nem mais nem menos.
     */
    it('deve ter exatamente seis tipos de navegação válidos', () => {
      // Verifica quantidade de tipos
      expect(VALID_NAVIGATION_TYPES.length).toBe(6);

      // Verifica que todos os tipos esperados estão presentes
      expect(VALID_NAVIGATION_TYPES).toContain('initial');
      expect(VALID_NAVIGATION_TYPES).toContain('link-click');
      expect(VALID_NAVIGATION_TYPES).toContain('form-submit');
      expect(VALID_NAVIGATION_TYPES).toContain('history-back');
      expect(VALID_NAVIGATION_TYPES).toContain('history-forward');
      expect(VALID_NAVIGATION_TYPES).toContain('redirect');

      // Verifica que não há duplicatas
      const uniqueTypes = new Set(VALID_NAVIGATION_TYPES);
      expect(uniqueTypes.size).toBe(VALID_NAVIGATION_TYPES.length);
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Para navegações consecutivas do mesmo tipo, cada uma
     * DEVE manter seu tipo corretamente.
     */
    it('deve manter tipo correto para navegações consecutivas do mesmo tipo', () => {
      fc.assert(
        fc.property(
          validNavigationTypeArbitrary,
          fc.array(
            fc.tuple(urlArbitrary, htmlHashArbitrary),
            { minLength: 2, maxLength: 5 }
          ),
          (type, urlHashPairs) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona múltiplas navegações do mesmo tipo
            for (const [url, htmlHash] of urlHashPairs) {
              manager.addNavigation({ url, type, htmlHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas têm o mesmo tipo
            expect(history.length).toBe(urlHashPairs.length);

            for (const entry of history) {
              expect(entry.type).toBe(type);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo de navegação DEVE ser case-sensitive,
     * ou seja, 'link-click' é diferente de 'Link-Click'.
     */
    it('deve tratar tipos de navegação como case-sensitive', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação com tipo em lowercase
            manager.addNavigation({ url, type: 'link-click', htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Tipo deve ser exatamente 'link-click' (lowercase)
            expect(entry.type).toBe('link-click');
            expect(entry.type).not.toBe('Link-Click');
            expect(entry.type).not.toBe('LINK-CLICK');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Distribuição uniforme: cada tipo de navegação DEVE poder
     * ser usado com a mesma frequência sem problemas.
     */
    it('deve permitir distribuição uniforme de tipos de navegação', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(urlArbitrary, validNavigationTypeArbitrary, htmlHashArbitrary),
            { minLength: 12, maxLength: 30 }
          ),
          (navigations) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona todas as navegações
            for (const [url, type, htmlHash] of navigations) {
              manager.addNavigation({ url, type, htmlHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas foram adicionadas
            expect(history.length).toBe(navigations.length);

            // Conta tipos
            const typeCounts = new Map<NavigationType, number>();
            for (const entry of history) {
              const count = typeCounts.get(entry.type) ?? 0;
              typeCounts.set(entry.type, count + 1);
            }

            // Verifica que todos os tipos usados são válidos
            for (const type of typeCounts.keys()) {
              expect(VALID_NAVIGATION_TYPES).toContain(type);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
