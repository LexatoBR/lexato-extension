/**
 * Property tests para Time Warnings
 *
 * Valida a propriedade de alertas de tempo restante:
 * - Property 29: Time Warnings at Correct Intervals
 *
 * Para qualquer gravação com tempo restante cruzando os thresholds
 * de 5 minutos, 1 minuto ou 30 segundos, o alerta correspondente
 * DEVE ser exibido.
 *
 * @module time-warnings.property.test
 * @requirements 9.1, 9.2, 9.3

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  RecordingStateManager,
  TIME_WARNING_THRESHOLDS,
  TIME_WARNING_MESSAGES,
  TIME_WARNING_ALERT_TYPES,
  type TimeWarningKey,
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
const MAX_DURATION_MS = 30 * 60 * 1000;

/** Threshold de 5 minutos em ms */
const FIVE_MINUTES_MS = TIME_WARNING_THRESHOLDS.FIVE_MINUTES;

/** Threshold de 1 minuto em ms */
const ONE_MINUTE_MS = TIME_WARNING_THRESHOLDS.ONE_MINUTE;

/** Threshold de 30 segundos em ms */
const THIRTY_SECONDS_MS = TIME_WARNING_THRESHOLDS.THIRTY_SECONDS;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera tempo decorrido que cruza o threshold de 5 minutos
 * (tempo restante <= 5 minutos, mas > 1 minuto)
 */
const elapsedCrossingFiveMinutesArbitrary = fc.integer({
  min: MAX_DURATION_MS - FIVE_MINUTES_MS,
  max: MAX_DURATION_MS - ONE_MINUTE_MS - 1,
});

/**
 * Gera tempo decorrido que cruza o threshold de 1 minuto
 * (tempo restante <= 1 minuto, mas > 30 segundos)
 */
const elapsedCrossingOneMinuteArbitrary = fc.integer({
  min: MAX_DURATION_MS - ONE_MINUTE_MS,
  max: MAX_DURATION_MS - THIRTY_SECONDS_MS - 1,
});

/**
 * Gera tempo decorrido que cruza o threshold de 30 segundos
 * (tempo restante <= 30 segundos)
 */
const elapsedCrossingThirtySecondsArbitrary = fc.integer({
  min: MAX_DURATION_MS - THIRTY_SECONDS_MS,
  max: MAX_DURATION_MS - 1,
});

/**
 * Gera tempo decorrido antes de qualquer threshold
 * (tempo restante > 5 minutos)
 */
const elapsedBeforeAnyThresholdArbitrary = fc.integer({
  min: 0,
  max: MAX_DURATION_MS - FIVE_MINUTES_MS - 1,
});

/**
 * Gera tempo decorrido aleatório válido (0 a max duration)
 */
const elapsedTimeArbitrary = fc.integer({
  min: 0,
  max: MAX_DURATION_MS,
});

/**
 * Gera chave de threshold aleatória
 */
const thresholdKeyArbitrary = fc.constantFrom<TimeWarningKey>(
  'FIVE_MINUTES',
  'ONE_MINUTE',
  'THIRTY_SECONDS'
);

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
 * Calcula tempo restante dado tempo decorrido
 *
 * @param elapsedMs - Tempo decorrido em ms
 * @returns Tempo restante em ms
 */
function calculateRemainingTime(elapsedMs: number): number {
  return Math.max(0, MAX_DURATION_MS - elapsedMs);
}

/**
 * Determina quais thresholds foram cruzados dado tempo restante
 *
 * @param remainingMs - Tempo restante em ms
 * @returns Array de chaves de threshold cruzados
 */
function getExpectedThresholdsCrossed(remainingMs: number): TimeWarningKey[] {
  const crossed: TimeWarningKey[] = [];

  if (remainingMs <= FIVE_MINUTES_MS) {
    crossed.push('FIVE_MINUTES');
  }
  if (remainingMs <= ONE_MINUTE_MS) {
    crossed.push('ONE_MINUTE');
  }
  if (remainingMs <= THIRTY_SECONDS_MS) {
    crossed.push('THIRTY_SECONDS');
  }

  return crossed;
}

/**
 * Limpa mocks entre testes
 */
function clearMocks(): void {
  vi.clearAllMocks();
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Time Warnings Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 29: Time Warnings at Correct Intervals
  // Feature: video-capture-redesign
  // Validates: Requirements 9.1, 9.2, 9.3
  // ==========================================================================

  describe('Property 29: Time Warnings at Correct Intervals', () => {
    /**
     * **Validates: Requirements 9.1**
     *
     * Para qualquer tempo restante <= 5 minutos (e > 1 minuto),
     * o alerta de 5 minutos DEVE ser disparado.
     */
    it('DEVE disparar alerta quando restam 5 minutos', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedCrossingFiveMinutesArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica tempo restante
          const remainingMs = manager.getRemainingMs();
          expect(remainingMs).toBeLessThanOrEqual(FIVE_MINUTES_MS);
          expect(remainingMs).toBeGreaterThan(ONE_MINUTE_MS);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Deve ter disparado alerta de 5 minutos
          expect(alerts.length).toBeGreaterThanOrEqual(1);
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.FIVE_MINUTES)).toBe(true);

          // Alerta de 5 minutos deve ser do tipo 'warning'
          const fiveMinAlert = alerts.find((a) => a.message === TIME_WARNING_MESSAGES.FIVE_MINUTES);
          expect(fiveMinAlert?.type).toBe(TIME_WARNING_ALERT_TYPES.FIVE_MINUTES);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.2**
     *
     * Para qualquer tempo restante <= 1 minuto (e > 30 segundos),
     * o alerta de 1 minuto DEVE ser disparado.
     */
    it('DEVE disparar alerta quando resta 1 minuto', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedCrossingOneMinuteArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica tempo restante
          const remainingMs = manager.getRemainingMs();
          expect(remainingMs).toBeLessThanOrEqual(ONE_MINUTE_MS);
          expect(remainingMs).toBeGreaterThan(THIRTY_SECONDS_MS);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Deve ter disparado alerta de 1 minuto
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.ONE_MINUTE)).toBe(true);

          // Alerta de 1 minuto deve ser do tipo 'warning'
          const oneMinAlert = alerts.find((a) => a.message === TIME_WARNING_MESSAGES.ONE_MINUTE);
          expect(oneMinAlert?.type).toBe(TIME_WARNING_ALERT_TYPES.ONE_MINUTE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.3**
     *
     * Para qualquer tempo restante <= 30 segundos,
     * o alerta de 30 segundos DEVE ser disparado.
     */
    it('DEVE disparar alerta quando restam 30 segundos', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedCrossingThirtySecondsArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica tempo restante
          const remainingMs = manager.getRemainingMs();
          expect(remainingMs).toBeLessThanOrEqual(THIRTY_SECONDS_MS);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Deve ter disparado alerta de 30 segundos
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.THIRTY_SECONDS)).toBe(true);

          // Alerta de 30 segundos deve ser do tipo 'error' (crítico)
          const thirtySecAlert = alerts.find(
            (a) => a.message === TIME_WARNING_MESSAGES.THIRTY_SECONDS
          );
          expect(thirtySecAlert?.type).toBe(TIME_WARNING_ALERT_TYPES.THIRTY_SECONDS);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Para qualquer tempo restante > 5 minutos,
     * NENHUM alerta de tempo DEVE ser disparado.
     */
    it('NÃO DEVE disparar alertas quando tempo restante > 5 minutos', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedBeforeAnyThresholdArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica tempo restante
          const remainingMs = manager.getRemainingMs();
          expect(remainingMs).toBeGreaterThan(FIVE_MINUTES_MS);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Não deve ter disparado nenhum alerta
          expect(alerts.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Cada alerta DEVE ser disparado apenas uma vez (sem duplicação).
     */
    it('DEVE disparar cada alerta apenas uma vez (sem duplicação)', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000; // 1 segundo após cruzar
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Primeira verificação - deve disparar alerta
          const firstAlerts = manager.checkTimeWarnings();
          const firstAlertCount = firstAlerts.filter(
            (a) => a.message === TIME_WARNING_MESSAGES[thresholdKey]
          ).length;

          // Segunda verificação - NÃO deve disparar novamente
          const secondAlerts = manager.checkTimeWarnings();
          const secondAlertCount = secondAlerts.filter(
            (a) => a.message === TIME_WARNING_MESSAGES[thresholdKey]
          ).length;

          // Terceira verificação - NÃO deve disparar novamente
          const thirdAlerts = manager.checkTimeWarnings();
          const thirdAlertCount = thirdAlerts.filter(
            (a) => a.message === TIME_WARNING_MESSAGES[thresholdKey]
          ).length;

          // Alerta deve ter sido disparado apenas na primeira vez
          expect(firstAlertCount).toBe(1);
          expect(secondAlertCount).toBe(0);
          expect(thirdAlertCount).toBe(0);

          // Verifica que o alerta foi marcado como mostrado
          expect(manager.hasShownTimeWarning(thresholdKey)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Os tipos de alerta DEVEM corresponder aos thresholds:
     * - 5 minutos: 'warning'
     * - 1 minuto: 'warning'
     * - 30 segundos: 'error' (crítico)
     */
    it('tipos de alerta DEVEM corresponder aos thresholds', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000;
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();
          const alert = alerts.find((a) => a.message === TIME_WARNING_MESSAGES[thresholdKey]);

          // Tipo deve corresponder ao esperado
          expect(alert).toBeDefined();
          expect(alert?.type).toBe(TIME_WARNING_ALERT_TYPES[thresholdKey]);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * As mensagens de alerta DEVEM estar em PT-BR.
     */
    it('mensagens de alerta DEVEM estar em PT-BR', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000;
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();
          const alert = alerts.find((a) => a.message === TIME_WARNING_MESSAGES[thresholdKey]);

          // Mensagem deve estar em PT-BR (contém palavras em português)
          expect(alert).toBeDefined();
          expect(alert?.message).toMatch(/Restam?|minuto|segundo|gravação/);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * checkTimeWarnings() NÃO DEVE disparar alertas se não estiver gravando.
     */
    it('NÃO DEVE disparar alertas se não estiver gravando', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedTimeArbitrary, async (_elapsedMs) => {
          const manager = createTestManager();

          // NÃO inicia gravação (status = 'idle')

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Não deve ter disparado nenhum alerta
          expect(alerts.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Alertas DEVEM ser disparados em cascata quando múltiplos thresholds são cruzados.
     */
    it('DEVE disparar alertas em cascata quando múltiplos thresholds são cruzados', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedCrossingThirtySecondsArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica tempo restante
          const remainingMs = manager.getRemainingMs();
          expect(remainingMs).toBeLessThanOrEqual(THIRTY_SECONDS_MS);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Deve ter disparado todos os 3 alertas (5min, 1min, 30seg)
          expect(alerts.length).toBe(3);

          // Verifica que todos os alertas estão presentes
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.FIVE_MINUTES)).toBe(true);
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.ONE_MINUTE)).toBe(true);
          expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES.THIRTY_SECONDS)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Alertas DEVEM ter IDs únicos.
     */
    it('alertas DEVEM ter IDs únicos', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedCrossingThirtySecondsArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Todos os IDs devem ser únicos
          const ids = alerts.map((a) => a.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(ids.length);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Alertas DEVEM ter timestamps válidos.
     */
    it('alertas DEVEM ter timestamps válidos', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000;
          const beforeCheck = Date.now();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();
          const afterCheck = Date.now();

          // Todos os alertas devem ter timestamps válidos
          for (const alert of alerts) {
            expect(alert.timestamp).toBeGreaterThanOrEqual(beforeCheck);
            expect(alert.timestamp).toBeLessThanOrEqual(afterCheck);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * reset() DEVE limpar alertas mostrados, permitindo nova gravação.
     */
    it('reset() DEVE limpar alertas mostrados', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000;
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Dispara alertas
          manager.checkTimeWarnings();
          expect(manager.hasShownTimeWarning(thresholdKey)).toBe(true);

          // Reset
          manager.reset();

          // Alertas mostrados devem estar limpos
          expect(manager.hasShownTimeWarning(thresholdKey)).toBe(false);
          expect(manager.getShownTimeWarnings().size).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Para qualquer tempo decorrido, os thresholds cruzados DEVEM ser corretos.
     */
    it('thresholds cruzados DEVEM ser corretos para qualquer tempo decorrido', async () => {
      await fc.assert(
        fc.asyncProperty(elapsedTimeArbitrary, async (elapsedMs) => {
          const manager = createTestManager();
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Calcula thresholds esperados
          const remainingMs = calculateRemainingTime(elapsedMs);
          const expectedThresholds = getExpectedThresholdsCrossed(remainingMs);

          // Verifica alertas
          const alerts = manager.checkTimeWarnings();

          // Número de alertas deve corresponder aos thresholds esperados
          expect(alerts.length).toBe(expectedThresholds.length);

          // Cada threshold esperado deve ter um alerta correspondente
          for (const thresholdKey of expectedThresholds) {
            expect(alerts.some((a) => a.message === TIME_WARNING_MESSAGES[thresholdKey])).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 9.1, 9.2, 9.3**
     *
     * Alertas DEVEM ser adicionados ao estado da gravação.
     */
    it('alertas DEVEM ser adicionados ao estado da gravação', async () => {
      await fc.assert(
        fc.asyncProperty(thresholdKeyArbitrary, async (thresholdKey) => {
          const manager = createTestManager();

          // Simula tempo que cruza o threshold específico
          const threshold = TIME_WARNING_THRESHOLDS[thresholdKey];
          const elapsedMs = MAX_DURATION_MS - threshold + 1000;
          simulateRecordingWithElapsed(manager, elapsedMs);

          // Dispara alertas
          const triggeredAlerts = manager.checkTimeWarnings();

          // Verifica que alertas foram adicionados ao estado
          const state = manager.getState();
          expect(state.alerts.length).toBeGreaterThanOrEqual(triggeredAlerts.length);

          // Cada alerta disparado deve estar no estado
          for (const alert of triggeredAlerts) {
            expect(state.alerts.some((a) => a.id === alert.id)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
