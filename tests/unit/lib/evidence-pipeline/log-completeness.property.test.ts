/**
 * Property Test: Log Completeness for Pipeline Operations
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 *
 * Este teste verifica a Propriedade 4 do design:
 * "Para qualquer operação de captura que completa (sucesso ou falha),
 * o log DEVE conter entradas para: início da operação, cada transição de fase,
 * e fim da operação com status final."
 *
 * A propriedade garante que todas as operações críticas do pipeline
 * são devidamente registradas para auditoria e debugging.
 *
 * @module PropertyTest/LogCompleteness
 */

import fc from 'fast-check';
import { describe, it, beforeEach } from 'vitest';
import { AuditLogger, MASK_PATTERN } from '@lib/audit-logger';

/**
 * Fases obrigatórias do pipeline de captura de vídeo
 */
const VIDEO_CAPTURE_PHASES = [
  'INITIALIZING',
  'CAPTURING',
  'FINALIZING',
  'COMPLETED',
] as const;

/**
 * Tipo para fase de captura
 */
type CapturePhase = (typeof VIDEO_CAPTURE_PHASES)[number];

/**
 * Arbitrary que gera fases de captura aleatórias
 */
const capturePhaseArb = fc.constantFrom(...VIDEO_CAPTURE_PHASES);

/**
 * Arbitrary que gera sequências válidas de fases
 */
const phaseSequenceArb = fc.array(capturePhaseArb, { minLength: 1, maxLength: 10 });

/**
 * Arbitrary que gera contexto de log válido
 */
const logContextArb = fc.record({
  captureId: fc.uuid(),
  tabId: fc.integer({ min: 1, max: 10000 }),
  phase: capturePhaseArb,
  durationMs: fc.integer({ min: 0, max: 300000 }),
});

describe('Property 4: Log Completeness for Pipeline Operations', () => {
  beforeEach(() => {
    // Reset para cada teste
  });

  /**
   * Testa que o AuditLogger registra todas as entradas corretamente
   *
   * **Validates: Requirements 3.1**
   */
  it('should record all log entries with correct structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.record({
          captureId: fc.uuid(),
          tabId: fc.integer({ min: 1, max: 10000 }),
        }),
        async (action: string, context: { captureId: string; tabId: number }) => {
          const testLogger = new AuditLogger();
          
          // Registra uma entrada
          testLogger.info('VIDEO_CAPTURE', action, context);
          
          // Obtém as entradas
          const entries = testLogger.getEntries();
          
          // Verifica que a entrada foi registrada
          if (entries.length !== 1) {
            return false;
          }
          
          const entry = entries[0];
          if (!entry) {
            return false;
          }
          
          // Verifica estrutura da entrada
          return (
            typeof entry.timestamp === 'string' &&
            entry.level === 'INFO' &&
            entry.process === 'VIDEO_CAPTURE' &&
            entry.action === action &&
            typeof entry.correlationId === 'string' &&
            typeof entry.traceId === 'string' &&
            typeof entry.elapsedMs === 'number'
          );
        }
      ),
      { numRuns: 50, verbose: true }
    );
  });

  /**
   * Testa que o contexto persistente é incluído em todos os logs
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it('should include persistent context in all log entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        logContextArb,
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
        async (context, actions) => {
          const testLogger = new AuditLogger();
          const contextLogger = testLogger.withContext(context);
          
          // Registra múltiplas entradas
          for (const action of actions) {
            contextLogger.info('VIDEO_CAPTURE', action, {});
          }
          
          // Obtém as entradas
          const entries = contextLogger.getEntries();
          
          // Verifica que todas as entradas têm o contexto
          for (const entry of entries) {
            if (!entry.data) {
              return false;
            }
            
            // Verifica que o contexto persistente está presente
            if (entry.data['captureId'] !== context.captureId) {
              return false;
            }
            if (entry.data['tabId'] !== context.tabId) {
              return false;
            }
            if (entry.data['phase'] !== context.phase) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que o timer mede duração corretamente
   *
   * **Validates: Requirements 3.2**
   */
  it('should measure operation duration with startTimer', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),
        async (delayMs: number) => {
          const testLogger = new AuditLogger();
          
          // Inicia timer
          const stopTimer = testLogger.startTimer('testOperation');
          
          // Simula operação com delay
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          
          // Para timer e obtém duração
          const duration = stopTimer();
          
          // Verifica que a duração é aproximadamente correta (com margem de 50ms)
          return duration >= delayMs - 5 && duration <= delayMs + 50;
        }
      ),
      { numRuns: 10, verbose: true }
    );
  });

  /**
   * Testa que transições de fase são registradas corretamente
   *
   * **Validates: Requirements 3.2**
   */
  it('should record phase transitions correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        phaseSequenceArb,
        async (phases: CapturePhase[]) => {
          const testLogger = new AuditLogger();
          let currentPhase: CapturePhase | null = null;
          
          // Simula transições de fase
          for (const phase of phases) {
            if (currentPhase !== null) {
              testLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', {
                from: currentPhase,
                to: phase,
              });
            }
            currentPhase = phase;
          }
          
          // Obtém as entradas
          const entries = testLogger.getEntries();
          const transitionEntries = entries.filter(
            (e) => e.action === 'PHASE_TRANSITION'
          );
          
          // Verifica que o número de transições está correto
          const expectedTransitions = Math.max(0, phases.length - 1);
          if (transitionEntries.length !== expectedTransitions) {
            return false;
          }
          
          // Verifica que cada transição tem from e to
          for (const entry of transitionEntries) {
            if (!entry.data?.['from'] || !entry.data?.['to']) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que erros são registrados com stack trace
   *
   * **Validates: Requirements 3.3**
   */
  it('should record errors with stack trace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (errorMessage: string) => {
          const testLogger = new AuditLogger();
          const error = new Error(errorMessage);
          
          // Registra erro
          testLogger.error('VIDEO_CAPTURE', 'CAPTURE_FAILED', {
            error: errorMessage,
          }, error);
          
          // Obtém as entradas
          const entries = testLogger.getEntries();
          
          if (entries.length !== 1) {
            return false;
          }
          
          const entry = entries[0];
          if (!entry) {
            return false;
          }
          
          // Verifica que o erro foi registrado corretamente
          return (
            entry.level === 'ERROR' &&
            entry.error?.message === errorMessage &&
            entry.error?.name === 'Error' &&
            typeof entry.error?.stack === 'string'
          );
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * Testa que o summary contém contagens corretas por nível
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('should generate correct summary with counts by level', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          infoCount: fc.integer({ min: 0, max: 10 }),
          warnCount: fc.integer({ min: 0, max: 5 }),
          errorCount: fc.integer({ min: 0, max: 3 }),
        }),
        async (counts: { infoCount: number; warnCount: number; errorCount: number }) => {
          const testLogger = new AuditLogger();
          
          // Registra entradas de cada nível
          for (let i = 0; i < counts.infoCount; i++) {
            testLogger.info('VIDEO_CAPTURE', `INFO_${i}`, {});
          }
          for (let i = 0; i < counts.warnCount; i++) {
            testLogger.warn('VIDEO_CAPTURE', `WARN_${i}`, {});
          }
          for (let i = 0; i < counts.errorCount; i++) {
            testLogger.error('VIDEO_CAPTURE', `ERROR_${i}`, {});
          }
          
          // Obtém summary
          const summary = testLogger.getSummary();
          
          // Verifica contagens
          return (
            summary.countByLevel.INFO === counts.infoCount &&
            summary.countByLevel.WARN === counts.warnCount &&
            summary.countByLevel.ERROR === counts.errorCount &&
            summary.entriesCount === counts.infoCount + counts.warnCount + counts.errorCount
          );
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que o summary contém contagens corretas por processo
   *
   * **Validates: Requirements 3.1**
   */
  it('should generate correct summary with counts by process', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          videoCaptureCount: fc.integer({ min: 0, max: 5 }),
          uploadCount: fc.integer({ min: 0, max: 5 }),
          forensicCount: fc.integer({ min: 0, max: 5 }),
        }),
        async (counts: { videoCaptureCount: number; uploadCount: number; forensicCount: number }) => {
          const testLogger = new AuditLogger();
          
          // Registra entradas de cada processo
          for (let i = 0; i < counts.videoCaptureCount; i++) {
            testLogger.info('VIDEO_CAPTURE', `ACTION_${i}`, {});
          }
          for (let i = 0; i < counts.uploadCount; i++) {
            testLogger.info('UPLOAD', `ACTION_${i}`, {});
          }
          for (let i = 0; i < counts.forensicCount; i++) {
            testLogger.info('FORENSIC', `ACTION_${i}`, {});
          }
          
          // Obtém summary
          const summary = testLogger.getSummary();
          
          // Verifica contagens (usa ?? 0 pois countByProcess é Partial e não inclui chaves com 0 entradas)
          return (
            (summary.countByProcess.VIDEO_CAPTURE ?? 0) === counts.videoCaptureCount &&
            (summary.countByProcess.UPLOAD ?? 0) === counts.uploadCount &&
            (summary.countByProcess.FORENSIC ?? 0) === counts.forensicCount
          );
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });

  /**
   * Testa que withContext preserva correlationId
   *
   * **Validates: Requirements 3.1**
   */
  it('should preserve correlationId when using withContext', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        logContextArb,
        async (correlationId: string, context) => {
          const testLogger = new AuditLogger(correlationId);
          const contextLogger = testLogger.withContext(context);
          
          // Registra entrada
          contextLogger.info('VIDEO_CAPTURE', 'TEST_ACTION', {});
          
          // Obtém as entradas
          const entries = contextLogger.getEntries();
          
          if (entries.length !== 1) {
            return false;
          }
          
          const entry = entries[0];
          if (!entry) {
            return false;
          }
          
          // Verifica que o correlationId foi preservado
          return entry.correlationId === correlationId;
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * Testa que dados sensíveis são sanitizados
   *
   * **Validates: Requirements 3.1**
   */
  it('should sanitize sensitive data in logs', async () => {
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret'];
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...sensitiveKeys),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (sensitiveKey: string, sensitiveValue: string) => {
          const testLogger = new AuditLogger();
          
          // Registra entrada com dado sensível
          testLogger.info('VIDEO_CAPTURE', 'TEST_ACTION', {
            [sensitiveKey]: sensitiveValue,
            normalData: 'visible',
          });
          
          // Obtém as entradas
          const entries = testLogger.getEntries();
          
          if (entries.length !== 1) {
            return false;
          }
          
          const entry = entries[0];
          if (!entry?.data) {
            return false;
          }
          
          // Verifica que o dado sensível foi sanitizado
          const sanitizedValue = entry.data[sensitiveKey];
          return (
            sanitizedValue === MASK_PATTERN &&
            entry.data['normalData'] === 'visible'
          );
        }
      ),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * Testa completude de logs para operação de captura simulada
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('should have complete logs for simulated capture operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 10000 }),
        fc.boolean(),
        async (captureId: string, tabId: number, shouldFail: boolean) => {
          const testLogger = new AuditLogger();
          const captureLogger = testLogger.withContext({ captureId, tabId });
          
          // Simula operação de captura
          captureLogger.info('VIDEO_CAPTURE', 'CAPTURE_START', {
            type: 'video',
          });
          
          captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', {
            from: 'IDLE',
            to: 'INITIALIZING',
          });
          
          captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', {
            from: 'INITIALIZING',
            to: 'CAPTURING',
          });
          
          if (shouldFail) {
            captureLogger.error('VIDEO_CAPTURE', 'CAPTURE_FAILED', {
              error: 'Simulated error',
            });
          } else {
            captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', {
              from: 'CAPTURING',
              to: 'FINALIZING',
            });
            
            captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', {
              from: 'FINALIZING',
              to: 'COMPLETED',
            });
            
            captureLogger.info('VIDEO_CAPTURE', 'CAPTURE_COMPLETE', {
              durationMs: 5000,
            });
          }
          
          // Obtém as entradas
          const entries = captureLogger.getEntries();
          
          // Verifica que tem CAPTURE_START
          const hasStart = entries.some((e) => e.action === 'CAPTURE_START');
          if (!hasStart) {
            return false;
          }
          
          // Verifica que tem pelo menos 2 transições de fase
          const transitions = entries.filter((e) => e.action === 'PHASE_TRANSITION');
          if (transitions.length < 2) {
            return false;
          }
          
          // Verifica que tem CAPTURE_COMPLETE ou CAPTURE_FAILED
          const hasEnd = entries.some(
            (e) => e.action === 'CAPTURE_COMPLETE' || e.action === 'CAPTURE_FAILED'
          );
          if (!hasEnd) {
            return false;
          }
          
          // Verifica que todas as entradas têm o contexto
          for (const entry of entries) {
            if (entry.data?.['captureId'] !== captureId) {
              return false;
            }
          }
          
          return true;
        }
      ),
      { numRuns: 30, verbose: true }
    );
  });
});
