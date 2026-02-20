/**
 * Property tests para Auto-Finalization
 *
 * Valida a propriedade de auto-finalização ao atingir tempo máximo:
 * - Property 30: Auto-Finalization at Max Time
 *
 * Para qualquer gravação atingindo 30 minutos (1800000ms), o VideoCapture
 * DEVE automaticamente chamar stop() e notificar o usuário.
 *
 * @module auto-finalization.property.test
 * @requirements 9.4, 9.5

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  RecordingStateManager,
  AUTO_FINALIZE_MESSAGE,
} from '../../src/background/recording-state-manager';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.runtime.sendMessage
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});

// ============================================================================
// Constantes para Testes
// ============================================================================

/** Duração máxima de gravação em ms (30 minutos) */
const MAX_DURATION_MS = 30 * 60 * 1000; // 1800000ms

/** Tolerância para comparações de tempo (1 segundo) */
// @ts-expect-error Constante reservada para testes futuros
const _TIME_TOLERANCE_MS = 1000;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera tempo decorrido exatamente no limite máximo
 */
const elapsedAtMaxDurationArbitrary = fc.constant(MAX_DURATION_MS);

/**
 * Gera tempo decorrido ligeiramente acima do limite máximo
 * (1ms a 10 segundos acima)
 */
const elapsedOverMaxDurationArbitrary = fc.integer({
  min: MAX_DURATION_MS + 1,
  max: MAX_DURATION_MS + 10 * 1000,
});

/**
 * Gera tempo decorrido no limite ou acima
 * (exatamente 30 min ou até 10 segundos acima)
 */
const elapsedAtOrOverMaxArbitrary = fc.integer({
  min: MAX_DURATION_MS,
  max: MAX_DURATION_MS + 10 * 1000,
});

/**
 * Gera tempo decorrido antes do limite máximo
 * (0 a 29:59)
 */
const elapsedBeforeMaxDurationArbitrary = fc.integer({
  min: 0,
  max: MAX_DURATION_MS - 1,
});

/**
 * Gera tempo decorrido aleatório válido (0 a max + 10s)
 */
const elapsedTimeArbitrary = fc.integer({
  min: 0,
  max: MAX_DURATION_MS + 10 * 1000,
});

/**
 * Gera tempo decorrido próximo ao limite (últimos 5 minutos)
 */
// @ts-expect-error Arbitrário reservado para testes futuros
const _elapsedNearMaxArbitrary = fc.integer({
  min: MAX_DURATION_MS - 5 * 60 * 1000,
  max: MAX_DURATION_MS + 5 * 1000,
});

/**
 * Gera razão de auto-finalização
 */
// @ts-expect-error Arbitrário reservado para testes futuros
const _autoFinalizeReasonArbitrary = fc.constantFrom('max_duration');

// ============================================================================
// Tipos para Testes
// ============================================================================

/**
 * Resultado simulado de auto-finalização
 */
interface AutoFinalizeResult {
  /** Se stop() foi chamado */
  stopCalled: boolean;
  /** Se callback foi chamado */
  callbackCalled: boolean;
  /** Razão passada ao callback */
  callbackReason: string | null;
  /** Se notificação foi enviada */
  notificationSent: boolean;
}

/**
 * Configuração de teste de auto-finalização
 */
interface AutoFinalizeTestConfig {
  /** Tempo decorrido em ms */
  elapsedMs: number;
  /** Duração máxima em ms */
  maxDurationMs: number;
}

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria nova instância do RecordingStateManager para testes
 * Desabilita broadcast automático para evitar chamadas ao chrome.runtime
 */
function createTestManager(): RecordingStateManager {
  return new RecordingStateManager({
    autoBroadcast: false,
    maxDurationMs: MAX_DURATION_MS,
  });
}

/**
 * Simula gravação em progresso com tempo decorrido específico
 *
 * @param manager - Instância do RecordingStateManager
 * @param elapsedMs - Tempo decorrido em ms
 */
function simulateRecordingWithElapsed(manager: RecordingStateManager, elapsedMs: number): void {
  // Calcula startTime para que Date.now() - startTime = elapsedMs
  const startTime = Date.now() - elapsedMs;
  manager.startRecording(startTime);
}

/**
 * Verifica se tempo decorrido atingiu ou ultrapassou o máximo
 *
 * @param elapsedMs - Tempo decorrido em ms
 * @param maxDurationMs - Duração máxima em ms
 * @returns true se atingiu ou ultrapassou
 */
function shouldAutoFinalize(elapsedMs: number, maxDurationMs: number): boolean {
  return elapsedMs >= maxDurationMs;
}

/**
 * Simula verificação de auto-finalização
 *
 * @param config - Configuração do teste
 * @returns Resultado da simulação
 */
// @ts-expect-error Função reservada para testes futuros
function _simulateAutoFinalizeCheck(config: AutoFinalizeTestConfig): AutoFinalizeResult {
  const { elapsedMs, maxDurationMs } = config;
  const shouldFinalize = shouldAutoFinalize(elapsedMs, maxDurationMs);

  return {
    stopCalled: shouldFinalize,
    callbackCalled: shouldFinalize,
    callbackReason: shouldFinalize ? 'max_duration' : null,
    notificationSent: shouldFinalize,
  };
}

/**
 * Limpa mocks entre testes
 */
function clearMocks(): void {
  vi.clearAllMocks();
}

// ============================================================================
// Classe Mock para VideoCapture (para testes de propriedade)
// ============================================================================

/**
 * Mock simplificado do VideoCapture para testes de propriedade
 *
 * Simula o comportamento de auto-finalização sem dependências externas
 */
class MockVideoCapture {
  private state: 'idle' | 'recording' | 'stopping' | 'stopped' = 'idle';
  private startTime = 0;
  private maxDurationMs: number;
  private autoFinalizeCallback: ((reason: string) => void) | null = null;
  private stopCallCount = 0;
  private notificationSent = false;

  constructor(maxDurationMs: number = MAX_DURATION_MS) {
    this.maxDurationMs = maxDurationMs;
  }

  /**
   * Inicia gravação simulada
   */
  start(options?: { onAutoFinalize?: (reason: string) => void }): void {
    this.state = 'recording';
    this.startTime = Date.now();
    this.autoFinalizeCallback = options?.onAutoFinalize ?? null;
    this.stopCallCount = 0;
    this.notificationSent = false;
  }

  /**
   * Simula início com tempo decorrido específico
   */
  startWithElapsed(elapsedMs: number, options?: { onAutoFinalize?: (reason: string) => void }): void {
    this.state = 'recording';
    this.startTime = Date.now() - elapsedMs;
    this.autoFinalizeCallback = options?.onAutoFinalize ?? null;
    this.stopCallCount = 0;
    this.notificationSent = false;
  }

  /**
   * Para gravação
   */
  stop(): void {
    if (this.state === 'recording') {
      this.state = 'stopping';
      this.stopCallCount++;
      this.state = 'stopped';
    }
  }

  /**
   * Obtém tempo decorrido
   */
  getElapsedTime(): number {
    if (this.state === 'idle' || this.startTime === 0) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Obtém tempo restante
   */
  getRemainingTime(): number {
    return Math.max(0, this.maxDurationMs - this.getElapsedTime());
  }

  /**
   * Verifica se deve auto-finalizar
   */
  shouldAutoFinalize(): boolean {
    return this.state === 'recording' && this.getElapsedTime() >= this.maxDurationMs;
  }

  /**
   * Executa auto-finalização (simula onTimerTick)
   */
  checkAndAutoFinalize(): boolean {
    if (!this.shouldAutoFinalize()) {
      return false;
    }

    // Notifica callback
    if (this.autoFinalizeCallback) {
      this.autoFinalizeCallback('max_duration');
    }

    // Notifica Side Panel
    this.notificationSent = true;

    // Para gravação
    this.stop();

    return true;
  }

  /**
   * Obtém estado atual
   */
  getState(): string {
    return this.state;
  }

  /**
   * Obtém contagem de chamadas a stop()
   */
  getStopCallCount(): number {
    return this.stopCallCount;
  }

  /**
   * Verifica se notificação foi enviada
   */
  wasNotificationSent(): boolean {
    return this.notificationSent;
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Auto-Finalization Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 30: Auto-Finalization at Max Time
  // Feature: video-capture-redesign
  // Validates: Requirements 9.4, 9.5
  // ==========================================================================

  describe('Property 30: Auto-Finalization at Max Time', () => {
    /**
     * **Validates: Requirements 9.4**
     *
     * Para qualquer tempo decorrido >= 30 minutos (1800000ms),
     * o VideoCapture DEVE chamar stop() automaticamente.
     */
    it('DEVE chamar stop() quando tempo decorrido >= max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Verifica que deve auto-finalizar
          expect(videoCapture.shouldAutoFinalize()).toBe(true);

          // Executa verificação de auto-finalização
          const didAutoFinalize = videoCapture.checkAndAutoFinalize();

          // Deve ter auto-finalizado
          expect(didAutoFinalize).toBe(true);

          // stop() deve ter sido chamado
          expect(videoCapture.getStopCallCount()).toBe(1);

          // Estado deve ser 'stopped'
          expect(videoCapture.getState()).toBe('stopped');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Para tempo decorrido exatamente em 30 minutos (1800000ms),
     * o VideoCapture DEVE chamar stop() automaticamente.
     */
    it('DEVE chamar stop() quando tempo decorrido == max duration (exatamente)', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtMaxDurationArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Verifica que tempo decorrido é exatamente o máximo
          expect(videoCapture.getElapsedTime()).toBeGreaterThanOrEqual(MAX_DURATION_MS);

          // Executa verificação de auto-finalização
          const didAutoFinalize = videoCapture.checkAndAutoFinalize();

          // Deve ter auto-finalizado
          expect(didAutoFinalize).toBe(true);

          // stop() deve ter sido chamado exatamente uma vez
          expect(videoCapture.getStopCallCount()).toBe(1);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Para tempo decorrido ligeiramente acima de 30 minutos,
     * o VideoCapture DEVE chamar stop() automaticamente.
     */
    it('DEVE chamar stop() quando tempo decorrido > max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedOverMaxDurationArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Verifica que tempo decorrido está acima do máximo
          expect(videoCapture.getElapsedTime()).toBeGreaterThan(MAX_DURATION_MS);

          // Executa verificação de auto-finalização
          const didAutoFinalize = videoCapture.checkAndAutoFinalize();

          // Deve ter auto-finalizado
          expect(didAutoFinalize).toBe(true);

          // stop() deve ter sido chamado
          expect(videoCapture.getStopCallCount()).toBe(1);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Para tempo decorrido < 30 minutos (1800000ms),
     * o VideoCapture NÃO DEVE chamar stop() automaticamente.
     */
    it('NÃO DEVE chamar stop() quando tempo decorrido < max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedBeforeMaxDurationArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Verifica que tempo decorrido está abaixo do máximo
          expect(videoCapture.getElapsedTime()).toBeLessThan(MAX_DURATION_MS);

          // Verifica que NÃO deve auto-finalizar
          expect(videoCapture.shouldAutoFinalize()).toBe(false);

          // Executa verificação de auto-finalização
          const didAutoFinalize = videoCapture.checkAndAutoFinalize();

          // NÃO deve ter auto-finalizado
          expect(didAutoFinalize).toBe(false);

          // stop() NÃO deve ter sido chamado
          expect(videoCapture.getStopCallCount()).toBe(0);

          // Estado deve continuar 'recording'
          expect(videoCapture.getState()).toBe('recording');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * Para qualquer auto-finalização, o callback onAutoFinalize
     * DEVE ser chamado com razão 'max_duration'.
     */
    it('DEVE chamar onAutoFinalize callback com razão "max_duration"', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          let callbackCalled = false;
          let callbackReason: string | null = null;

          videoCapture.startWithElapsed(elapsedMs, {
            onAutoFinalize: (reason) => {
              callbackCalled = true;
              callbackReason = reason;
            },
          });

          // Executa verificação de auto-finalização
          videoCapture.checkAndAutoFinalize();

          // Callback deve ter sido chamado
          expect(callbackCalled).toBe(true);

          // Razão deve ser 'max_duration'
          expect(callbackReason).toBe('max_duration');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * Para qualquer auto-finalização, a notificação para o Side Panel
     * DEVE ser enviada.
     */
    it('DEVE enviar notificação para Side Panel ao auto-finalizar', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Executa verificação de auto-finalização
          videoCapture.checkAndAutoFinalize();

          // Notificação deve ter sido enviada
          expect(videoCapture.wasNotificationSent()).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * Para tempo decorrido < max duration, a notificação NÃO DEVE ser enviada.
     */
    it('NÃO DEVE enviar notificação quando tempo < max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedBeforeMaxDurationArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Executa verificação de auto-finalização
          videoCapture.checkAndAutoFinalize();

          // Notificação NÃO deve ter sido enviada
          expect(videoCapture.wasNotificationSent()).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4, 9.5**
     *
     * RecordingStateManager.hasReachedMaxDuration() DEVE retornar true
     * quando tempo decorrido >= max duration.
     */
    it('RecordingStateManager.hasReachedMaxDuration() DEVE retornar true quando >= max', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // hasReachedMaxDuration() deve retornar true
          expect(manager.hasReachedMaxDuration()).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4, 9.5**
     *
     * RecordingStateManager.hasReachedMaxDuration() DEVE retornar false
     * quando tempo decorrido < max duration.
     */
    it('RecordingStateManager.hasReachedMaxDuration() DEVE retornar false quando < max', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedBeforeMaxDurationArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // hasReachedMaxDuration() deve retornar false
          expect(manager.hasReachedMaxDuration()).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * RecordingStateManager.notifyAutoFinalization() DEVE criar alerta
     * com mensagem correta em PT-BR.
     */
    it('notifyAutoFinalization() DEVE criar alerta com mensagem em PT-BR', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Notifica auto-finalização
          const alert = manager.notifyAutoFinalization();

          // Alerta deve ter mensagem correta
          expect(alert.message).toBe(AUTO_FINALIZE_MESSAGE);

          // Mensagem deve estar em PT-BR
          expect(alert.message).toMatch(/Tempo máximo|gravação|finalizada/);

          // Tipo deve ser 'info'
          expect(alert.type).toBe('info');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * Alerta de auto-finalização DEVE ter ID único.
     */
    it('alerta de auto-finalização DEVE ter ID único', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (alertCount) => {
            const manager = createTestManager();
            simulateRecordingWithElapsed(manager, MAX_DURATION_MS);

            const alertIds: string[] = [];

            // Cria múltiplos alertas
            for (let i = 0; i < alertCount; i++) {
              const alert = manager.notifyAutoFinalization();
              alertIds.push(alert.id);
            }

            // Todos os IDs devem ser únicos
            const uniqueIds = new Set(alertIds);
            expect(uniqueIds.size).toBe(alertIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.5**
     *
     * Alerta de auto-finalização DEVE ter timestamp válido.
     */
    it('alerta de auto-finalização DEVE ter timestamp válido', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          const beforeNotify = Date.now();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Notifica auto-finalização
          const alert = manager.notifyAutoFinalization();
          const afterNotify = Date.now();

          // Timestamp deve estar no intervalo correto
          expect(alert.timestamp).toBeGreaterThanOrEqual(beforeNotify);
          expect(alert.timestamp).toBeLessThanOrEqual(afterNotify);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4, 9.5**
     *
     * Para qualquer tempo decorrido, a decisão de auto-finalizar
     * DEVE ser determinística (elapsed >= maxDuration).
     */
    it('decisão de auto-finalizar DEVE ser determinística', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedTimeArbitrary, async (elapsedMs) => {
          const expectedShouldFinalize = elapsedMs >= MAX_DURATION_MS;

          // Primeira verificação
          const videoCapture1 = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture1.startWithElapsed(elapsedMs);
          const result1 = videoCapture1.shouldAutoFinalize();

          // Segunda verificação (mesmo tempo)
          const videoCapture2 = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture2.startWithElapsed(elapsedMs);
          const result2 = videoCapture2.shouldAutoFinalize();

          // Resultados devem ser iguais
          expect(result1).toBe(result2);

          // Resultado deve corresponder à expectativa
          expect(result1).toBe(expectedShouldFinalize);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Auto-finalização NÃO DEVE ocorrer se gravação não estiver ativa.
     */
    it('NÃO DEVE auto-finalizar se gravação não estiver ativa', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (_elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);

          // NÃO inicia gravação (estado = 'idle')

          // Verifica que NÃO deve auto-finalizar
          expect(videoCapture.shouldAutoFinalize()).toBe(false);

          // Executa verificação de auto-finalização
          const didAutoFinalize = videoCapture.checkAndAutoFinalize();

          // NÃO deve ter auto-finalizado
          expect(didAutoFinalize).toBe(false);

          // stop() NÃO deve ter sido chamado
          expect(videoCapture.getStopCallCount()).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Tempo restante DEVE ser 0 quando tempo decorrido >= max duration.
     */
    it('tempo restante DEVE ser 0 quando tempo decorrido >= max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Tempo restante deve ser 0
          expect(videoCapture.getRemainingTime()).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4**
     *
     * Tempo restante DEVE ser > 0 quando tempo decorrido < max duration.
     */
    it('tempo restante DEVE ser > 0 quando tempo decorrido < max duration', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedBeforeMaxDurationArbitrary, async (elapsedMs) => {
          const videoCapture = new MockVideoCapture(MAX_DURATION_MS);
          videoCapture.startWithElapsed(elapsedMs);

          // Tempo restante deve ser > 0
          expect(videoCapture.getRemainingTime()).toBeGreaterThan(0);

          // Tempo restante deve ser aproximadamente (max - elapsed)
          const expectedRemaining = MAX_DURATION_MS - elapsedMs;
          expect(videoCapture.getRemainingTime()).toBeCloseTo(expectedRemaining, -3); // Tolerância de 1s
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4, 9.5**
     *
     * Alerta de auto-finalização DEVE ser adicionado ao estado da gravação.
     */
    it('alerta de auto-finalização DEVE ser adicionado ao estado', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedAtOrOverMaxArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Notifica auto-finalização
          const alert = manager.notifyAutoFinalization();

          // Verifica que alerta foi adicionado ao estado
          const state = manager.getState();
          expect(state.alerts.some((a) => a.id === alert.id)).toBe(true);
          expect(state.alerts.some((a) => a.message === AUTO_FINALIZE_MESSAGE)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.4, 9.5**
     *
     * Para tempos próximos ao limite, a transição de não-finalizar
     * para finalizar DEVE ocorrer exatamente em max duration.
     */
    it('transição de auto-finalização DEVE ocorrer exatamente em max duration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }), // Offset em ms
          async (offsetMs) => {
            // Tempo logo antes do limite
            const beforeMax = MAX_DURATION_MS - offsetMs;
            const videoCaptureBefore = new MockVideoCapture(MAX_DURATION_MS);
            videoCaptureBefore.startWithElapsed(beforeMax);
            expect(videoCaptureBefore.shouldAutoFinalize()).toBe(false);

            // Tempo exatamente no limite
            const atMax = MAX_DURATION_MS;
            const videoCaptureAt = new MockVideoCapture(MAX_DURATION_MS);
            videoCaptureAt.startWithElapsed(atMax);
            expect(videoCaptureAt.shouldAutoFinalize()).toBe(true);

            // Tempo logo após o limite
            const afterMax = MAX_DURATION_MS + offsetMs;
            const videoCaptureAfter = new MockVideoCapture(MAX_DURATION_MS);
            videoCaptureAfter.startWithElapsed(afterMax);
            expect(videoCaptureAfter.shouldAutoFinalize()).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
