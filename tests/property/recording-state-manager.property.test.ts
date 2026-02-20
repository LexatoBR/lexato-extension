/**
 * Property tests para RecordingStateManager
 *
 * Valida as propriedades do gerenciador de estado de gravação:
 * - Property 8: Navigation Entry Recording
 * - Property 9: Navigation Type Classification
 * - Property 11: HTML Hash Storage
 *
 * @module recording-state-manager.property.test
 * @requirements 3.1, 3.4, 3.6

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
// Mocks
// ============================================================================

// Mock do chrome.runtime
const mockSendMessage = vi.fn().mockResolvedValue(undefined);

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

// ============================================================================
// Constantes
// ============================================================================

/** Tipos de navegação válidos conforme Requisito 3.4 */
const VALID_NAVIGATION_TYPES: NavigationType[] = [
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect',
];

/** Regex para validar hash SHA-256 (64 caracteres hexadecimais) */
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera URLs válidas para testes
 */
const urlArbitrary = fc.oneof(
  fc.webUrl(),
  fc.stringMatching(/^\/[a-z0-9\-_]{1,30}$/).map((path) => path || '/page'),
  fc.tuple(fc.webUrl(), fc.stringMatching(/^[a-z0-9]{1,10}$/)).map(([url, query]) => `${url}?q=${query || 'test'}`),
  fc.tuple(fc.webUrl(), fc.stringMatching(/^[a-z0-9]{1,10}$/)).map(([url, fragment]) => `${url}#${fragment || 'section'}`)
);

/**
 * Gera tipos de navegação válidos
 */
const navigationTypeArbitrary: fc.Arbitrary<NavigationType> = fc.constantFrom(...VALID_NAVIGATION_TYPES);

/**
 * Gera hashes SHA-256 válidos (64 caracteres hexadecimais)
 */
const sha256HashArbitrary = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 64, maxLength: 64 })
  .map((chars) => chars.join(''));

/**
 * Gera timestamps válidos (últimos 30 dias até agora)
 */
const timestampArbitrary = fc.integer({
  min: Date.now() - 30 * 24 * 60 * 60 * 1000,
  max: Date.now() + 60 * 1000,
});

/**
 * Gera entrada de navegação completa
 */
const navigationEntryInputArbitrary: fc.Arbitrary<NavigationEntryInput> = fc.record({
  url: urlArbitrary,
  type: navigationTypeArbitrary,
  htmlHash: sha256HashArbitrary,
}).chain((base) =>
  fc.option(timestampArbitrary, { nil: undefined }).map((timestamp) =>
    timestamp !== undefined ? { ...base, timestamp } : base
  )
) as fc.Arbitrary<NavigationEntryInput>;

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um RecordingStateManager para testes
 */
function createTestManager(): RecordingStateManager {
  return new RecordingStateManager({
    autoBroadcast: false, // Desabilita broadcast em testes
  });
}

// ============================================================================
// Property Tests
// ============================================================================

describe('RecordingStateManager Properties', () => {
  let manager: RecordingStateManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRecordingStateManager();
    manager = createTestManager();
  });

  afterEach(() => {
    manager.reset();
  });

  // ==========================================================================
  // Property 8: Navigation Entry Recording
  // Feature: video-capture-redesign
  // Validates: Requirements 3.1
  // ==========================================================================

  describe('Property 8: Navigation Entry Recording', () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * Para qualquer evento de navegação durante gravação, o Navigation Index
     * DEVE conter uma entrada com a URL correta e timestamp relativo ao
     * tempo de início da gravação.
     */
    it('deve registrar navegação com URL e timestamp relativo corretos', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
          sha256HashArbitrary,
          (url, type, htmlHash) => {
            // Inicia gravação
            const startTime = Date.now();
            manager.startRecording(startTime);

            // Aguarda um pequeno intervalo para simular tempo decorrido
            const navigationTime = startTime + 1000; // 1 segundo após início

            // Adiciona navegação
            const entry = manager.addNavigation({
              url,
              type,
              htmlHash,
              timestamp: navigationTime,
            });

            // Verifica que a entrada foi criada
            expect(entry).toBeDefined();

            // Verifica URL completa
            expect(entry.fullUrl).toBe(url);

            // Verifica timestamp relativo (deve ser ~1000ms)
            expect(entry.videoTimestamp).toBe(navigationTime - startTime);

            // Verifica que está no histórico
            const history = manager.getNavigationHistory();
            expect(history.length).toBeGreaterThan(0);
            expect(history[history.length - 1]).toEqual(entry);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O timestamp relativo deve ser calculado corretamente como
     * (timestamp da navegação - timestamp de início da gravação).
     */
    it('deve calcular timestamp relativo corretamente', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 30 * 60 * 1000 }), // 1s a 30min
          urlArbitrary,
          sha256HashArbitrary,
          (elapsedMs, url, htmlHash) => {
            const startTime = Date.now() - elapsedMs;
            manager.startRecording(startTime);

            const navigationTime = Date.now();
            const entry = manager.addNavigation({
              url,
              type: 'link-click',
              htmlHash,
              timestamp: navigationTime,
            });

            // Timestamp relativo deve ser aproximadamente elapsedMs
            const expectedRelative = navigationTime - startTime;
            expect(entry.videoTimestamp).toBe(expectedRelative);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * Múltiplas navegações devem ser registradas em ordem cronológica.
     */
    it('deve registrar múltiplas navegações em ordem cronológica', () => {
      fc.assert(
        fc.property(
          fc.array(navigationEntryInputArbitrary, { minLength: 2, maxLength: 10 }),
          (inputs) => {
            const startTime = Date.now() - 60000; // 1 minuto atrás
            manager.startRecording(startTime);

            // Adiciona navegações com timestamps crescentes
            let lastTimestamp = startTime;
            const entries: NavigationEntry[] = [];

            for (const input of inputs) {
              lastTimestamp += 1000; // Incrementa 1 segundo
              const entry = manager.addNavigation({
                ...input,
                timestamp: lastTimestamp,
              });
              entries.push(entry);
            }

            // Verifica que todas foram registradas
            const history = manager.getNavigationHistory();
            expect(history.length).toBe(inputs.length);

            // Verifica ordem cronológica
            for (let i = 1; i < history.length; i++) {
              expect(history[i]!.videoTimestamp).toBeGreaterThan(history[i - 1]!.videoTimestamp);
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
     * Quando timestamp não é fornecido, deve usar Date.now().
     */
    it('deve usar Date.now() quando timestamp não é fornecido', () => {
      fc.assert(
        fc.property(urlArbitrary, sha256HashArbitrary, (url, htmlHash) => {
          const startTime = Date.now() - 5000; // 5 segundos atrás
          manager.startRecording(startTime);

          const beforeAdd = Date.now();
          const entry = manager.addNavigation({
            url,
            type: 'link-click',
            htmlHash,
            // timestamp não fornecido
          });
          const afterAdd = Date.now();

          // Timestamp relativo deve estar entre (beforeAdd - startTime) e (afterAdd - startTime)
          expect(entry.videoTimestamp).toBeGreaterThanOrEqual(beforeAdd - startTime);
          expect(entry.videoTimestamp).toBeLessThanOrEqual(afterAdd - startTime);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.1**
     *
     * O formattedTime deve corresponder ao videoTimestamp formatado como MM:SS.
     */
    it('deve formatar timestamp como MM:SS corretamente', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30 * 60 * 1000 }), // 0 a 30 minutos em ms
          urlArbitrary,
          sha256HashArbitrary,
          (elapsedMs, url, htmlHash) => {
            const startTime = Date.now() - elapsedMs;
            manager.startRecording(startTime);

            const entry = manager.addNavigation({
              url,
              type: 'link-click',
              htmlHash,
              timestamp: Date.now(),
            });

            // Verifica formato MM:SS
            expect(entry.formattedTime).toMatch(/^\d{2}:\d{2}$/);

            // Verifica que formattedTime corresponde ao videoTimestamp
            const expectedFormatted = formatTime(entry.videoTimestamp);
            expect(entry.formattedTime).toBe(expectedFormatted);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 9: Navigation Type Classification
  // Feature: video-capture-redesign
  // Validates: Requirements 3.4
  // ==========================================================================

  describe('Property 9: Navigation Type Classification', () => {
    /**
     * **Validates: Requirements 3.4**
     *
     * Para qualquer evento de navegação, o tipo registrado DEVE ser um dos:
     * 'initial', 'link-click', 'form-submit', 'history-back', 'history-forward', 'redirect'.
     */
    it('deve classificar tipo de navegação como um dos tipos válidos', () => {
      fc.assert(
        fc.property(navigationEntryInputArbitrary, (input) => {
          manager.startRecording();

          const entry = manager.addNavigation(input);

          // Verifica que o tipo é um dos válidos
          expect(VALID_NAVIGATION_TYPES).toContain(entry.type);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * O tipo de navegação deve ser preservado exatamente como fornecido.
     */
    it('deve preservar o tipo de navegação fornecido', () => {
      fc.assert(
        fc.property(urlArbitrary, navigationTypeArbitrary, sha256HashArbitrary, (url, type, htmlHash) => {
          manager.startRecording();

          const entry = manager.addNavigation({
            url,
            type,
            htmlHash,
          });

          // Tipo deve ser exatamente o fornecido
          expect(entry.type).toBe(type);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Cada tipo de navegação válido deve ser aceito sem erros.
     */
    it('deve aceitar todos os tipos de navegação válidos', () => {
      fc.assert(
        fc.property(urlArbitrary, sha256HashArbitrary, (url, htmlHash) => {
          manager.startRecording();

          // Testa cada tipo válido
          for (const type of VALID_NAVIGATION_TYPES) {
            const entry = manager.addNavigation({
              url,
              type,
              htmlHash,
            });

            expect(entry.type).toBe(type);
          }

          return true;
        }),
        { numRuns: 20 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Navegações do tipo 'initial' não devem incrementar pagesVisited.
     */
    it('não deve incrementar pagesVisited para navegação inicial', () => {
      fc.assert(
        fc.property(urlArbitrary, sha256HashArbitrary, (url, htmlHash) => {
          manager.startRecording();

          const statsBefore = manager.getState().stats.pagesVisited;

          manager.addNavigation({
            url,
            type: 'initial',
            htmlHash,
          });

          const statsAfter = manager.getState().stats.pagesVisited;

          // pagesVisited não deve ter incrementado
          expect(statsAfter).toBe(statsBefore);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Navegações de outros tipos devem incrementar pagesVisited.
     */
    it('deve incrementar pagesVisited para navegações não-iniciais', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          sha256HashArbitrary,
          fc.constantFrom('link-click', 'form-submit', 'history-back', 'history-forward', 'redirect') as fc.Arbitrary<NavigationType>,
          (url, htmlHash, type) => {
            manager.startRecording();

            const statsBefore = manager.getState().stats.pagesVisited;

            manager.addNavigation({
              url,
              type,
              htmlHash,
            });

            const statsAfter = manager.getState().stats.pagesVisited;

            // pagesVisited deve ter incrementado em 1
            expect(statsAfter).toBe(statsBefore + 1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Property 11: HTML Hash Storage
  // Feature: video-capture-redesign
  // Validates: Requirements 3.6
  // ==========================================================================

  describe('Property 11: HTML Hash Storage', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Para qualquer entrada de navegação no Navigation Index, a entrada
     * DEVE conter um hash SHA-256 válido do conteúdo HTML capturado.
     */
    it('deve armazenar hash SHA-256 válido para cada navegação', () => {
      fc.assert(
        fc.property(urlArbitrary, navigationTypeArbitrary, sha256HashArbitrary, (url, type, htmlHash) => {
          manager.startRecording();

          const entry = manager.addNavigation({
            url,
            type,
            htmlHash,
          });

          // Verifica que o hash foi armazenado
          expect(entry.htmlHash).toBeDefined();
          expect(entry.htmlHash).toBe(htmlHash);

          // Verifica formato SHA-256 (64 caracteres hexadecimais)
          expect(entry.htmlHash).toMatch(SHA256_REGEX);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash deve ser preservado exatamente como fornecido.
     */
    it('deve preservar o hash exatamente como fornecido', () => {
      fc.assert(
        fc.property(navigationEntryInputArbitrary, (input) => {
          manager.startRecording();

          const entry = manager.addNavigation(input);

          // Hash deve ser exatamente o fornecido
          expect(entry.htmlHash).toBe(input.htmlHash);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Múltiplas navegações devem ter seus hashes armazenados independentemente.
     */
    it('deve armazenar hashes independentes para múltiplas navegações', () => {
      fc.assert(
        fc.property(fc.array(navigationEntryInputArbitrary, { minLength: 2, maxLength: 10 }), (inputs) => {
          manager.startRecording();

          const entries: NavigationEntry[] = [];
          for (const input of inputs) {
            entries.push(manager.addNavigation(input));
          }

          // Verifica que cada entrada tem seu hash correto
          for (let i = 0; i < inputs.length; i++) {
            expect(entries[i]!.htmlHash).toBe(inputs[i]!.htmlHash);
          }

          return true;
        }),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash deve estar presente no histórico de navegação.
     */
    it('deve incluir hash no histórico de navegação', () => {
      fc.assert(
        fc.property(navigationEntryInputArbitrary, (input) => {
          manager.startRecording();

          manager.addNavigation(input);

          const history = manager.getNavigationHistory();
          const lastEntry = history[history.length - 1];

          // Hash deve estar presente no histórico
          expect(lastEntry).toBeDefined();
          expect(lastEntry!.htmlHash).toBe(input.htmlHash);
          expect(lastEntry!.htmlHash).toMatch(SHA256_REGEX);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Hashes diferentes devem ser armazenados corretamente para páginas diferentes.
     */
    it('deve armazenar hashes diferentes para páginas diferentes', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          urlArbitrary,
          sha256HashArbitrary,
          sha256HashArbitrary,
          (url1, url2, hash1, hash2) => {
            // Pula se os hashes forem iguais (improvável mas possível)
            fc.pre(hash1 !== hash2);

            manager.startRecording();

            const entry1 = manager.addNavigation({
              url: url1,
              type: 'link-click',
              htmlHash: hash1,
            });

            const entry2 = manager.addNavigation({
              url: url2,
              type: 'link-click',
              htmlHash: hash2,
            });

            // Hashes devem ser diferentes
            expect(entry1.htmlHash).toBe(hash1);
            expect(entry2.htmlHash).toBe(hash2);
            expect(entry1.htmlHash).not.toBe(entry2.htmlHash);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ==========================================================================
  // Testes Auxiliares para formatTime e truncateUrl
  // ==========================================================================

  describe('Funções Auxiliares', () => {
    describe('formatTime', () => {
      /**
       * Verifica que formatTime sempre retorna formato MM:SS
       */
      it('deve formatar qualquer tempo em ms como MM:SS', () => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 99 * 60 * 1000 + 59 * 1000 }), (ms) => {
            const formatted = formatTime(ms);
            expect(formatted).toMatch(/^\d{2}:\d{2}$/);
            return true;
          }),
          { numRuns: 100 }
        );
      });

      /**
       * Verifica cálculo correto de minutos e segundos
       */
      it('deve calcular minutos e segundos corretamente', () => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 59 }), fc.integer({ min: 0, max: 59 }), (minutes, seconds) => {
            const ms = minutes * 60 * 1000 + seconds * 1000;
            const formatted = formatTime(ms);

            const expectedMinutes = minutes.toString().padStart(2, '0');
            const expectedSeconds = seconds.toString().padStart(2, '0');

            expect(formatted).toBe(`${expectedMinutes}:${expectedSeconds}`);
            return true;
          }),
          { numRuns: 100 }
        );
      });
    });

    describe('truncateUrl', () => {
      /**
       * Verifica que URLs curtas não são truncadas
       */
      it('não deve truncar URLs menores que o limite', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 49 }), (url) => {
            const truncated = truncateUrl(url, 50);
            expect(truncated).toBe(url);
            return true;
          }),
          { numRuns: 100 }
        );
      });

      /**
       * Verifica que URLs longas são truncadas com ellipsis
       */
      it('deve truncar URLs maiores que o limite com ellipsis', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 51, maxLength: 200 }), (url) => {
            const truncated = truncateUrl(url, 50);
            expect(truncated.length).toBe(50);
            expect(truncated.endsWith('...')).toBe(true);
            return true;
          }),
          { numRuns: 100 }
        );
      });
    });
  });
});
