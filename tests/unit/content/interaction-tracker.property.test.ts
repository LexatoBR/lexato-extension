/**
 * Property tests para InteractionTracker
 *
 * Valida as propriedades de rastreamento de interações:
 * - Property 6: Interaction Counter Increment
 * - Property 7: Stats Message Transmission
 *
 * @module interaction-tracker.property.test
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  InteractionTracker,
  type InteractionEvent,
} from '../../../src/content/interaction-tracker';

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
// Funções Auxiliares
// ============================================================================

/**
 * Cria um tracker para testes
 */
function createTestTracker(
  onInteraction?: (event: InteractionEvent) => void
): InteractionTracker {
  return new InteractionTracker({
    ...(onInteraction !== undefined && { onInteraction }),
    scrollDebounceMs: 0, // Sem debounce para testes
    sendToServiceWorker: true,
  });
}

/**
 * Simula um evento de clique
 */
function simulateClick(_tracker: InteractionTracker): void {
  // Acessa o handler privado via reflexão para teste
  const event = new MouseEvent('click', {
    clientX: Math.random() * 1000,
    clientY: Math.random() * 1000,
    bubbles: true,
  });
  document.dispatchEvent(event);
}

/**
 * Simula um evento de tecla
 */
function simulateKeypress(_tracker: InteractionTracker): void {
  const event = new KeyboardEvent('keypress', {
    key: 'a',
    bubbles: true,
  });
  document.dispatchEvent(event);
}

// ============================================================================
// Property Tests
// ============================================================================

describe('InteractionTracker Properties', () => {
  let tracker: InteractionTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = createTestTracker();
  });

  afterEach(() => {
    tracker.stop();
  });

  describe('Property 6: Interaction Counter Increment', () => {
    /**
     * **Validates: Requirements 2.6**
     *
     * Para qualquer sequência de eventos de interação (cliques, teclas,
     * scrolls, interações com formulários), os valores finais dos contadores
     * DEVEM ser iguais à contagem de cada tipo de evento na sequência.
     */
    it('deve incrementar contadores corretamente para sequência de cliques', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 50 }), (numClicks) => {
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula cliques
          for (let i = 0; i < numClicks; i++) {
            simulateClick(testTracker);
          }

          const stats = testTracker.getStats();
          testTracker.stop();

          expect(stats.clickCount).toBe(numClicks);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.6**
     *
     * Contadores de teclas devem corresponder ao número de keypresses.
     */
    it('deve incrementar contadores corretamente para sequência de teclas', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 50 }), (numKeypresses) => {
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula keypresses
          for (let i = 0; i < numKeypresses; i++) {
            simulateKeypress(testTracker);
          }

          const stats = testTracker.getStats();
          testTracker.stop();

          expect(stats.keystrokeCount).toBe(numKeypresses);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.6**
     *
     * Contadores devem ser independentes entre tipos de eventos.
     */
    it('deve manter contadores independentes para diferentes tipos de eventos', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }),
          fc.integer({ min: 0, max: 20 }),
          (numClicks, numKeypresses) => {
            const testTracker = createTestTracker();
            testTracker.start();

            // Simula cliques e keypresses intercalados
            for (let i = 0; i < Math.max(numClicks, numKeypresses); i++) {
              if (i < numClicks) simulateClick(testTracker);
              if (i < numKeypresses) simulateKeypress(testTracker);
            }

            const stats = testTracker.getStats();
            testTracker.stop();

            expect(stats.clickCount).toBe(numClicks);
            expect(stats.keystrokeCount).toBe(numKeypresses);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.6**
     *
     * Contadores devem começar em zero (exceto pagesVisited que começa em 1).
     */
    it('deve iniciar com contadores zerados', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const testTracker = createTestTracker();
          testTracker.start();

          const stats = testTracker.getStats();
          testTracker.stop();

          expect(stats.clickCount).toBe(0);
          expect(stats.keystrokeCount).toBe(0);
          expect(stats.scrollCount).toBe(0);
          expect(stats.formsInteracted).toBe(0);
          expect(stats.pagesVisited).toBe(1); // Página inicial
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.6**
     *
     * Contadores não devem incrementar quando tracker está parado.
     */
    it('não deve incrementar contadores quando tracker está parado', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (numEvents) => {
          const testTracker = createTestTracker();
          // NÃO inicia o tracker

          // Tenta simular eventos
          for (let i = 0; i < numEvents; i++) {
            simulateClick(testTracker);
            simulateKeypress(testTracker);
          }

          const stats = testTracker.getStats();

          // Contadores devem permanecer zerados
          expect(stats.clickCount).toBe(0);
          expect(stats.keystrokeCount).toBe(0);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.6**
     *
     * Reset deve zerar todos os contadores.
     */
    it('deve zerar contadores após reset', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 20 }),
          (numClicks, numKeypresses) => {
            const testTracker = createTestTracker();
            testTracker.start();

            // Simula eventos
            for (let i = 0; i < numClicks; i++) simulateClick(testTracker);
            for (let i = 0; i < numKeypresses; i++) simulateKeypress(testTracker);

            // Verifica que contadores foram incrementados
            let stats = testTracker.getStats();
            expect(stats.clickCount).toBe(numClicks);
            expect(stats.keystrokeCount).toBe(numKeypresses);

            // Reset
            testTracker.reset();

            // Verifica que contadores foram zerados
            stats = testTracker.getStats();
            expect(stats.clickCount).toBe(0);
            expect(stats.keystrokeCount).toBe(0);
            expect(stats.pagesVisited).toBe(1);

            testTracker.stop();
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.1**
     *
     * Contador de páginas deve incrementar corretamente.
     */
    it('deve incrementar contador de páginas visitadas', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 20 }), (numNavigations) => {
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula navegações
          for (let i = 0; i < numNavigations; i++) {
            testTracker.incrementPagesVisited();
          }

          const stats = testTracker.getStats();
          testTracker.stop();

          // Página inicial (1) + navegações
          expect(stats.pagesVisited).toBe(1 + numNavigations);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Stats Message Transmission', () => {
    /**
     * **Validates: Requirements 2.7**
     *
     * Para qualquer atualização de stats no content script, uma mensagem
     * INTERACTION_STATS_UPDATE correspondente DEVE ser enviada ao Side Panel
     * via Service Worker.
     */
    it('deve enviar mensagem de stats para Service Worker a cada interação', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (numClicks) => {
          vi.clearAllMocks();
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula cliques
          for (let i = 0; i < numClicks; i++) {
            simulateClick(testTracker);
          }

          testTracker.stop();

          // Deve ter enviado mensagens de stats
          const statsMessages = mockSendMessage.mock.calls.filter(
            (call) => call[0]?.type === 'INTERACTION_STATS_UPDATE'
          );

          // Cada clique deve gerar uma mensagem de stats
          expect(statsMessages.length).toBe(numClicks);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.7**
     *
     * Mensagens de stats devem conter os valores corretos.
     */
    it('deve enviar stats com valores corretos', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (numClicks) => {
          vi.clearAllMocks();
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula cliques
          for (let i = 0; i < numClicks; i++) {
            simulateClick(testTracker);
          }

          testTracker.stop();

          // Verifica última mensagem de stats
          const statsMessages = mockSendMessage.mock.calls.filter(
            (call) => call[0]?.type === 'INTERACTION_STATS_UPDATE'
          );

          if (statsMessages.length > 0) {
            const lastMessage = statsMessages[statsMessages.length - 1];
            if (lastMessage) {
              const lastStats = lastMessage[0]?.payload;
              expect(lastStats?.clickCount).toBe(numClicks);
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.7**
     *
     * Deve enviar eventos de interação individuais para Service Worker.
     */
    it('deve enviar eventos de interação para Service Worker', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (numClicks) => {
          vi.clearAllMocks();
          const testTracker = createTestTracker();
          testTracker.start();

          // Simula cliques
          for (let i = 0; i < numClicks; i++) {
            simulateClick(testTracker);
          }

          testTracker.stop();

          // Deve ter enviado eventos de interação
          const eventMessages = mockSendMessage.mock.calls.filter(
            (call) => call[0]?.type === 'INTERACTION_EVENT'
          );

          // Cada clique deve gerar um evento
          expect(eventMessages.length).toBe(numClicks);

          // Todos devem ser do tipo 'click'
          eventMessages.forEach((call) => {
            expect(call[0].payload.type).toBe('click');
          });

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.7**
     *
     * Eventos devem conter timestamp válido.
     */
    it('deve incluir timestamp válido em eventos', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 5 }), (numEvents) => {
          vi.clearAllMocks();
          const beforeTime = Date.now();

          const testTracker = createTestTracker();
          testTracker.start();

          for (let i = 0; i < numEvents; i++) {
            simulateClick(testTracker);
          }

          const afterTime = Date.now();
          testTracker.stop();

          // Verifica timestamps
          const eventMessages = mockSendMessage.mock.calls.filter(
            (call) => call[0]?.type === 'INTERACTION_EVENT'
          );

          eventMessages.forEach((call) => {
            const timestamp = call[0].payload.timestamp;
            expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(timestamp).toBeLessThanOrEqual(afterTime);
          });

          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 2.7**
     *
     * Não deve enviar mensagens quando sendToServiceWorker é false.
     */
    it('não deve enviar mensagens quando sendToServiceWorker é false', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (numClicks) => {
          vi.clearAllMocks();

          const testTracker = new InteractionTracker({
            sendToServiceWorker: false,
            scrollDebounceMs: 0,
          });
          testTracker.start();

          for (let i = 0; i < numClicks; i++) {
            simulateClick(testTracker);
          }

          testTracker.stop();

          // Não deve ter enviado nenhuma mensagem
          expect(mockSendMessage).not.toHaveBeenCalled();
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Comportamento do Tracker', () => {
    /**
     * Verifica que start() pode ser chamado múltiplas vezes sem efeito.
     */
    it('deve ignorar chamadas duplicadas de start()', () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 10 }), (numStarts) => {
          const testTracker = createTestTracker();

          // Chama start múltiplas vezes
          for (let i = 0; i < numStarts; i++) {
            testTracker.start();
          }

          expect(testTracker.isActive()).toBe(true);

          // Simula um clique
          simulateClick(testTracker);

          const stats = testTracker.getStats();
          testTracker.stop();

          // Deve ter contado apenas 1 clique (não múltiplos listeners)
          expect(stats.clickCount).toBe(1);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Verifica que stop() pode ser chamado múltiplas vezes sem erro.
     */
    it('deve ignorar chamadas duplicadas de stop()', () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 10 }), (numStops) => {
          const testTracker = createTestTracker();
          testTracker.start();

          // Chama stop múltiplas vezes
          for (let i = 0; i < numStops; i++) {
            testTracker.stop();
          }

          expect(testTracker.isActive()).toBe(false);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Verifica que getStats() retorna cópia, não referência.
     */
    it('deve retornar cópia das stats, não referência', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const testTracker = createTestTracker();
          testTracker.start();

          simulateClick(testTracker);

          const stats1 = testTracker.getStats();
          const stats2 = testTracker.getStats();

          // Devem ser objetos diferentes
          expect(stats1).not.toBe(stats2);

          // Mas com mesmos valores
          expect(stats1).toEqual(stats2);

          // Modificar um não deve afetar o outro
          stats1.clickCount = 999;
          expect(stats2.clickCount).toBe(1);

          testTracker.stop();
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
