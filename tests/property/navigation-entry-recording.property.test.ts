/**
 * Property tests para Navigation Entry Recording
 *
 * Valida a propriedade de registro de entradas de navegação:
 * - Property 8: Navigation Entry Recording
 *
 * Para qualquer evento de navegação durante a gravação, o Navigation Index
 * DEVE conter uma entrada com a URL correta e timestamp relativo ao início
 * da gravação.
 *
 * @module navigation-entry-recording.property.test
 * @requirements 3.1

 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  RecordingStateManager,
  resetRecordingStateManager,
  formatTime,
  truncateUrl,
  type NavigationEntryInput,
} from '../../src/background/recording-state-manager';
import type { NavigationType, NavigationEntry } from '../../src/sidepanel/types';

// ============================================================================
// Constantes
// ============================================================================

/** Comprimento máximo para truncamento de URL (padrão do sistema) */
const URL_MAX_LENGTH = 50;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera URLs válidas para testes
 * Inclui URLs absolutas com diferentes protocolos e paths
 */
const urlArbitrary = fc.oneof(
  // URLs absolutas HTTPS
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9-/]{0,30}$/)
  ).map(([domain, tld, path]) => `https://${domain || 'example'}.${tld || 'com'}${path ? '/' + path : ''}`),
  // URLs absolutas HTTP
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9-/]{0,30}$/)
  ).map(([domain, tld, path]) => `http://${domain || 'example'}.${tld || 'com'}${path ? '/' + path : ''}`),
  // URLs com query strings
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,20}$/)
  ).map(([domain, tld, key, value]) =>
    `https://${domain || 'example'}.${tld || 'com'}?${key || 'q'}=${value || 'test'}`
  ),
  // URLs longas para testar truncamento
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9-]{30,60}$/)
  ).map(([domain, tld, path]) => `https://${domain || 'example'}.${tld || 'com'}/${path || 'long-path'}`)
);

/**
 * Gera tipos de navegação válidos
 */
const navigationTypeArbitrary: fc.Arbitrary<NavigationType> = fc.constantFrom(
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect'
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
 * Gera offsets de tempo em ms (0 a 30 minutos)
 */
const timeOffsetArbitrary = fc.integer({
  min: 0,
  max: 30 * 60 * 1000, // 30 minutos em ms
});

/**
 * Gera entrada de navegação completa para testes
 */
const navigationEntryInputArbitrary: fc.Arbitrary<NavigationEntryInput> = fc.record({
  url: urlArbitrary,
  type: navigationTypeArbitrary,
  htmlHash: htmlHashArbitrary,
});

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

// ============================================================================
// Property Tests
// ============================================================================

describe('Navigation Entry Recording Properties', () => {
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
  // Property 8: Navigation Entry Recording
  // Feature: video-capture-redesign
  // **Validates: Requirements 3.1**
  // ==========================================================================

  describe('Property 8: Navigation Entry Recording', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Para qualquer evento de navegação durante a gravação,
     * o Navigation Index DEVE conter uma entrada com a URL correta.
     */
    it('deve registrar navegação com URL correta', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
          htmlHashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            const input: NavigationEntryInput = { url, type, htmlHash };
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que entrada foi adicionada
            expect(history.length).toBe(1);

            const entry = getFirstEntry(history);

            // URL completa deve ser preservada
            expect(entry.fullUrl).toBe(url);

            // URL truncada deve ser correta
            expect(entry.url).toBe(truncateUrl(url, URL_MAX_LENGTH));

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Para qualquer evento de navegação durante a gravação,
     * o timestamp DEVE ser relativo ao início da gravação.
     */
    it('deve registrar navegação com timestamp relativo ao início da gravação', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          timestampArbitrary,
          timeOffsetArbitrary,
          (input, startTime, offset) => {
            // Cria manager e inicia gravação com timestamp específico
            manager = createTestManager();
            manager.startRecording(startTime);

            // Calcula timestamp da navegação
            const navigationTimestamp = startTime + offset;

            // Adiciona navegação com timestamp específico
            const inputWithTimestamp: NavigationEntryInput = {
              ...input,
              timestamp: navigationTimestamp,
            };
            manager.addNavigation(inputWithTimestamp);

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que entrada foi adicionada
            expect(history.length).toBe(1);

            const entry = getFirstEntry(history);

            // videoTimestamp deve ser relativo ao início (offset)
            expect(entry.videoTimestamp).toBe(offset);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O timestamp formatado DEVE estar no formato MM:SS
     * correspondente ao videoTimestamp.
     */
    it('deve formatar timestamp como MM:SS corretamente', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          timestampArbitrary,
          timeOffsetArbitrary,
          (input, startTime, offset) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording(startTime);

            // Adiciona navegação com timestamp específico
            const inputWithTimestamp: NavigationEntryInput = {
              ...input,
              timestamp: startTime + offset,
            };
            manager.addNavigation(inputWithTimestamp);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // formattedTime deve corresponder ao videoTimestamp
            const expectedFormatted = formatTime(offset);
            expect(entry.formattedTime).toBe(expectedFormatted);

            // Formato deve ser MM:SS
            expect(entry.formattedTime).toMatch(/^\d{2}:\d{2}$/);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Para múltiplas navegações, cada uma DEVE ter seu próprio
     * timestamp relativo correto.
     */
    it('deve registrar múltiplas navegações com timestamps relativos corretos', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(navigationEntryInputArbitrary, timeOffsetArbitrary),
            { minLength: 2, maxLength: 10 }
          ),
          timestampArbitrary,
          (navigations, startTime) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording(startTime);

            // Ordena navegações por offset para simular ordem temporal
            const sortedNavigations = [...navigations].sort((a, b) => a[1] - b[1]);

            // Adiciona cada navegação
            for (const [input, offset] of sortedNavigations) {
              const inputWithTimestamp: NavigationEntryInput = {
                ...input,
                timestamp: startTime + offset,
              };
              manager.addNavigation(inputWithTimestamp);
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(sortedNavigations.length);

            // Verifica cada entrada
            for (let i = 0; i < sortedNavigations.length; i++) {
              const [input, offset] = sortedNavigations[i] as [NavigationEntryInput, number];
              const entry = getEntryAt(history, i);

              // URL deve estar correta
              expect(entry.fullUrl).toBe(input.url);

              // Timestamp relativo deve estar correto
              expect(entry.videoTimestamp).toBe(offset);

              // Formato deve ser MM:SS
              expect(entry.formattedTime).toBe(formatTime(offset));
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Quando timestamp não é fornecido, DEVE usar Date.now()
     * e calcular timestamp relativo corretamente.
     */
    it('deve usar Date.now() quando timestamp não é fornecido', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          () => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            const startTime = Date.now();
            manager.startRecording(startTime);

            // Pequeno delay para garantir diferença de tempo
            const beforeNavigation = Date.now();

            // Adiciona navegação sem timestamp explícito
            manager.addNavigation({
              url: 'https://example.com',
              type: 'link-click',
              htmlHash: 'a'.repeat(64),
            });

            const afterNavigation = Date.now();

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // videoTimestamp deve estar entre os limites esperados
            const minExpected = beforeNavigation - startTime;
            const maxExpected = afterNavigation - startTime;

            expect(entry.videoTimestamp).toBeGreaterThanOrEqual(minExpected);
            expect(entry.videoTimestamp).toBeLessThanOrEqual(maxExpected);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O tipo de navegação DEVE ser preservado na entrada.
     */
    it('deve preservar tipo de navegação na entrada', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
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

            // Tipo deve ser preservado
            expect(entry.type).toBe(type);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O hash do HTML DEVE ser preservado na entrada.
     */
    it('deve preservar hash do HTML na entrada', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
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

            // Hash deve ser preservado
            expect(entry.htmlHash).toBe(htmlHash);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Para navegação inicial (type='initial'), o contador de páginas
     * NÃO deve ser incrementado (já começa em 1).
     */
    it('não deve incrementar páginas para navegação inicial', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          htmlHashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Verifica páginas iniciais
            const statsBefore = manager.getState().stats;
            expect(statsBefore.pagesVisited).toBe(1);

            // Adiciona navegação inicial
            manager.addNavigation({ url, type: 'initial', htmlHash });

            // Verifica que páginas não foi incrementado
            const statsAfter = manager.getState().stats;
            expect(statsAfter.pagesVisited).toBe(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Para navegações não-iniciais, o contador de páginas
     * DEVE ser incrementado.
     */
    it('deve incrementar páginas para navegações não-iniciais', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          fc.constantFrom('link-click', 'form-submit', 'history-back', 'history-forward', 'redirect') as fc.Arbitrary<NavigationType>,
          htmlHashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Verifica páginas iniciais
            const statsBefore = manager.getState().stats;
            expect(statsBefore.pagesVisited).toBe(1);

            // Adiciona navegação não-inicial
            manager.addNavigation({ url, type, htmlHash });

            // Verifica que páginas foi incrementado
            const statsAfter = manager.getState().stats;
            expect(statsAfter.pagesVisited).toBe(2);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * URLs longas DEVEM ser truncadas para exibição,
     * mas a URL completa deve ser preservada em fullUrl.
     */
    it('deve truncar URLs longas mantendo URL completa em fullUrl', () => {
      fc.assert(
        fc.property(
          // Gera URLs garantidamente longas (> 50 caracteres)
          fc.tuple(
            fc.stringMatching(/^[a-z0-9-]{10,20}$/),
            fc.stringMatching(/^[a-z]{2,5}$/),
            fc.stringMatching(/^[a-z0-9-]{40,80}$/)
          ).map(([domain, tld, path]) =>
            `https://${domain || 'example'}.${tld || 'com'}/${path || 'a'.repeat(50)}`
          ),
          navigationTypeArbitrary,
          htmlHashArbitrary,
          (longUrl, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação com URL longa
            manager.addNavigation({ url: longUrl, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // fullUrl deve conter URL completa
            expect(entry.fullUrl).toBe(longUrl);

            // Se URL é maior que limite, deve ser truncada
            if (longUrl.length > URL_MAX_LENGTH) {
              expect(entry.url.length).toBeLessThanOrEqual(URL_MAX_LENGTH);
              expect(entry.url).toContain('...');
            } else {
              expect(entry.url).toBe(longUrl);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Quando gravação não está ativa (startTime = 0),
     * videoTimestamp DEVE ser 0.
     */
    it('deve ter videoTimestamp 0 quando gravação não iniciada', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          (input) => {
            // Cria manager SEM iniciar gravação
            manager = createTestManager();

            // Adiciona navegação (gravação não iniciada)
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // videoTimestamp deve ser 0 (sem referência de início)
            expect(entry.videoTimestamp).toBe(0);
            expect(entry.formattedTime).toBe('00:00');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O histórico de navegação DEVE manter a ordem de inserção.
     */
    it('deve manter ordem de inserção no histórico', () => {
      fc.assert(
        fc.property(
          fc.array(navigationEntryInputArbitrary, { minLength: 3, maxLength: 10 }),
          (inputs) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegações em ordem
            for (const input of inputs) {
              manager.addNavigation(input);
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica ordem
            expect(history.length).toBe(inputs.length);

            for (let i = 0; i < inputs.length; i++) {
              const input = inputs[i] as NavigationEntryInput;
              const entry = getEntryAt(history, i);
              expect(entry.fullUrl).toBe(input.url);
              expect(entry.type).toBe(input.type);
              expect(entry.htmlHash).toBe(input.htmlHash);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
