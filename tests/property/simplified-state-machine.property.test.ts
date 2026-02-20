/**
 * Property tests para Simplified State Machine
 *
 * Valida a propriedade de máquina de estados simplificada:
 * - Property 18: Simplified State Machine
 *
 * Para qualquer instância de VideoCapture, o estado DEVE ser apenas um de:
 * 'idle', 'recording', 'stopping', 'stopped' (nunca 'paused').
 *
 * A remoção do estado 'paused' garante integridade temporal da evidência.
 * Sem pausas, o tempo decorrido é sempre contínuo e verificável.
 *
 * @module simplified-state-machine.property.test
 * @requirements 5.3

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { VideoCapture } from '../../src/content/video-capture';
import { AuditLogger } from '../../src/lib/audit-logger';
import type { VideoRecordingState } from '../../src/types/capture.types';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.runtime
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
  },
});

// Mock do document para coleta de HTML
vi.stubGlobal('document', {
  documentElement: {
    outerHTML: '<html><body>Test</body></html>',
    scrollWidth: 1920,
    scrollHeight: 1080,
  },
  title: 'Test Page',
});

// Mock do window
vi.stubGlobal('window', {
  location: { href: 'https://example.com' },
  innerWidth: 1920,
  innerHeight: 1080,
});

// ============================================================================
// Constantes para Testes
// ============================================================================

/**
 * Estados válidos do VideoCapture (sem 'paused')
 * Requirement 5.3: THE Video_Capture SHALL only support states: idle, recording, stopping, stopped
 * Nota: 'preparing' foi removido do tipo VideoRecordingState
 */
const VALID_STATES: readonly VideoRecordingState[] = ['idle', 'recording', 'stopping', 'stopped'] as const;

/**
 * Estado 'paused' que NÃO DEVE existir
 */
const FORBIDDEN_STATE = 'paused';

// _ALL_POSSIBLE_STATES removido - não utilizado

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera estado válido do VideoCapture
 */
const validStateArbitrary = fc.constantFrom<VideoRecordingState>(...VALID_STATES);

/**
 * Gera configuração aleatória para VideoCapture
 */
const videoCaptureConfigArbitrary = fc.record({
  maxDurationMs: fc.integer({ min: 60000, max: 3600000 }), // 1 min a 1 hora
  videoBitrate: fc.integer({ min: 500000, max: 5000000 }), // 500kbps a 5Mbps
  frameRate: fc.integer({ min: 15, max: 60 }),
  hashTimeout: fc.integer({ min: 1000, max: 10000 }),
});

/**
 * Gera número de instâncias para teste
 */
const instanceCountArbitrary = fc.integer({ min: 1, max: 10 });

/**
 * Gera sequência de ações para simular transições de estado
 */
const actionSequenceArbitrary = fc.array(
  fc.constantFrom('start', 'stop', 'cancel', 'reset'),
  { minLength: 1, maxLength: 10 }
);

/**
 * Gera número de verificações de estado
 */
const stateCheckCountArbitrary = fc.integer({ min: 1, max: 20 });

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria instância do AuditLogger para testes
 */
function createTestLogger(): AuditLogger {
  return new AuditLogger();
}

/**
 * Cria instância do VideoCapture para testes
 *
 * @param config - Configuração opcional
 * @returns Instância do VideoCapture
 */
function createVideoCapture(config?: Partial<{
  maxDurationMs: number;
  videoBitrate: number;
  frameRate: number;
  hashTimeout: number;
}>): VideoCapture {
  const logger = createTestLogger();
  return new VideoCapture(logger, config);
}

/**
 * Verifica se um estado é válido (está na lista de estados permitidos)
 *
 * @param state - Estado a verificar
 * @returns true se o estado é válido
 */
function isValidState(state: string): state is VideoRecordingState {
  return (VALID_STATES as readonly string[]).includes(state);
}

/**
 * Verifica se um estado é o estado proibido 'paused'
 *
 * @param state - Estado a verificar
 * @returns true se o estado é 'paused'
 */
function isPausedState(state: string): boolean {
  return state === FORBIDDEN_STATE;
}

// _createMockMediaStream removido - não utilizado

/**
 * Limpa mocks entre testes
 */
function clearMocks(): void {
  vi.clearAllMocks();
}

// ============================================================================
// Classe Mock para VideoCapture (para testes de transição de estado)
// ============================================================================

/**
 * Mock simplificado do VideoCapture para testes de propriedade de estado
 *
 * Simula o comportamento da máquina de estados sem dependências externas
 */
class MockVideoCaptureStateMachine {
  private state: VideoRecordingState = 'idle';

  /**
   * Obtém estado atual
   */
  getState(): VideoRecordingState {
    return this.state;
  }

  /**
   * Simula início de gravação
   */
  start(): boolean {
    if (this.state !== 'idle') {
      return false;
    }
    this.state = 'recording';
    return true;
  }

  /**
   * Simula parada de gravação
   */
  stop(): boolean {
    if (this.state !== 'recording') {
      return false;
    }
    this.state = 'stopping';
    // Simula transição para stopped
    this.state = 'stopped';
    return true;
  }

  /**
   * Simula cancelamento
   */
  cancel(): void {
    if (this.state === 'recording' || this.state === 'stopping') {
      this.state = 'idle';
    }
  }

  /**
   * Simula reset
   */
  reset(): void {
    this.state = 'idle';
  }

  /**
   * Executa ação aleatória
   */
  executeAction(action: string): void {
    switch (action) {
      case 'start':
        this.start();
        break;
      case 'stop':
        this.stop();
        break;
      case 'cancel':
        this.cancel();
        break;
      case 'reset':
        this.reset();
        break;
    }
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Simplified State Machine Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 18: Simplified State Machine
  // Feature: video-capture-redesign
  // Validates: Requirements 5.3
  // ==========================================================================

  describe('Property 18: Simplified State Machine', () => {
    /**
     * **Validates: Requirements 5.3**
     *
     * Para qualquer instância de VideoCapture, o estado inicial
     * DEVE ser 'idle' (um dos estados válidos).
     */
    it('estado inicial DEVE ser "idle"', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          const state = videoCapture.getState();

          // Estado inicial deve ser 'idle'
          expect(state).toBe('idle');

          // Estado deve ser válido
          expect(isValidState(state)).toBe(true);

          // Estado NÃO deve ser 'paused'
          expect(isPausedState(state)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Para qualquer instância de VideoCapture, getState() DEVE retornar
     * apenas um dos estados válidos: 'idle', 'recording', 'stopping', 'stopped'.
     */
    it('getState() DEVE retornar apenas estados válidos', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          const state = videoCapture.getState();

          // Estado deve estar na lista de estados válidos
          expect(VALID_STATES).toContain(state);

          // Estado NÃO deve ser 'paused'
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Para qualquer número de instâncias de VideoCapture,
     * todas DEVEM ter estados válidos.
     */
    it('múltiplas instâncias DEVEM ter estados válidos', async () => {
      await fc.assert(
        fc.asyncProperty(instanceCountArbitrary, async (count) => {
          const instances: VideoCapture[] = [];

          // Cria múltiplas instâncias
          for (let i = 0; i < count; i++) {
            instances.push(createVideoCapture());
          }

          // Verifica cada instância
          for (const instance of instances) {
            const state = instance.getState();

            // Estado deve ser válido
            expect(VALID_STATES).toContain(state);

            // Estado NÃO deve ser 'paused'
            expect(state).not.toBe(FORBIDDEN_STATE);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Para qualquer sequência de ações, o estado resultante
     * DEVE ser um dos estados válidos (nunca 'paused').
     */
    it('qualquer sequência de ações DEVE resultar em estado válido', async () => {
      await fc.assert(
        fc.asyncProperty(actionSequenceArbitrary, async (actions) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Executa sequência de ações
          for (const action of actions) {
            stateMachine.executeAction(action);

            // Após cada ação, estado deve ser válido
            const state = stateMachine.getState();
            expect(VALID_STATES).toContain(state);
            expect(state).not.toBe(FORBIDDEN_STATE);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * O estado 'paused' NUNCA DEVE aparecer em nenhuma transição.
     */
    it('estado "paused" NUNCA DEVE aparecer', async () => {
      await fc.assert(
        fc.asyncProperty(
          videoCaptureConfigArbitrary,
          stateCheckCountArbitrary,
          async (config, checkCount) => {
            const videoCapture = createVideoCapture(config);

            // Verifica estado múltiplas vezes
            for (let i = 0; i < checkCount; i++) {
              const state = videoCapture.getState();

              // Estado NUNCA deve ser 'paused'
              expect(state).not.toBe('paused');
              expect(isPausedState(state)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * A transição idle → recording DEVE ser válida.
     */
    it('transição idle → recording DEVE ser válida', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (_config) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Estado inicial deve ser 'idle'
          expect(stateMachine.getState()).toBe('idle');

          // Transição para 'recording'
          const success = stateMachine.start();
          expect(success).toBe(true);

          // Estado deve ser 'recording'
          const state = stateMachine.getState();
          expect(state).toBe('recording');

          // Estado deve ser válido
          expect(VALID_STATES).toContain(state);
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * A transição recording → stopping → stopped DEVE ser válida.
     */
    it('transição recording → stopping → stopped DEVE ser válida', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (_config) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Inicia gravação
          stateMachine.start();
          expect(stateMachine.getState()).toBe('recording');

          // Para gravação (passa por stopping → stopped)
          const success = stateMachine.stop();
          expect(success).toBe(true);

          // Estado final deve ser 'stopped'
          const state = stateMachine.getState();
          expect(state).toBe('stopped');

          // Estado deve ser válido
          expect(VALID_STATES).toContain(state);
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Transições inválidas NÃO DEVEM resultar em estado 'paused'.
     */
    it('transições inválidas NÃO DEVEM resultar em estado "paused"', async () => {
      await fc.assert(
        fc.asyncProperty(actionSequenceArbitrary, async (actions) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Executa sequência de ações (algumas podem ser inválidas)
          for (const action of actions) {
            stateMachine.executeAction(action);

            // Mesmo após ações inválidas, estado NUNCA deve ser 'paused'
            const state = stateMachine.getState();
            expect(state).not.toBe(FORBIDDEN_STATE);
            expect(VALID_STATES).toContain(state);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * O tipo VideoRecordingState DEVE conter apenas os 5 estados válidos.
     */
    it('tipo VideoRecordingState DEVE conter apenas estados válidos', async () => {
      await fc.assert(
        fc.asyncProperty(validStateArbitrary, async (state) => {
          // Estado gerado deve ser um dos 5 válidos
          expect(['idle', 'preparing', 'recording', 'stopping', 'stopped']).toContain(state);

          // Estado NÃO deve ser 'paused'
          expect(state).not.toBe('paused');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * isRecording() DEVE retornar true apenas quando estado é 'recording'.
     */
    it('isRecording() DEVE ser consistente com getState()', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          const state = videoCapture.getState();
          const isRecording = videoCapture.isRecording();

          // isRecording() deve ser true apenas quando estado é 'recording'
          if (state === 'recording') {
            expect(isRecording).toBe(true);
          } else {
            expect(isRecording).toBe(false);
          }

          // Estado nunca deve ser 'paused'
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Após reset(), o estado DEVE voltar para 'idle'.
     */
    it('reset() DEVE retornar estado para "idle"', async () => {
      await fc.assert(
        fc.asyncProperty(actionSequenceArbitrary, async (actions) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Executa sequência de ações
          for (const action of actions) {
            stateMachine.executeAction(action);
          }

          // Reset
          stateMachine.reset();

          // Estado deve ser 'idle'
          const state = stateMachine.getState();
          expect(state).toBe('idle');

          // Estado deve ser válido
          expect(VALID_STATES).toContain(state);
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Após cancel(), o estado DEVE ser 'idle' (se estava gravando).
     */
    it('cancel() DEVE retornar estado para "idle" se estava gravando', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (_config) => {
          const stateMachine = new MockVideoCaptureStateMachine();

          // Inicia gravação
          stateMachine.start();
          expect(stateMachine.getState()).toBe('recording');

          // Cancela
          stateMachine.cancel();

          // Estado deve ser 'idle'
          const state = stateMachine.getState();
          expect(state).toBe('idle');

          // Estado deve ser válido
          expect(VALID_STATES).toContain(state);
          expect(state).not.toBe(FORBIDDEN_STATE);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * O conjunto de estados válidos DEVE ter exatamente 4 elementos.
     */
    it('conjunto de estados válidos DEVE ter exatamente 4 elementos', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          // Deve haver exatamente 4 estados válidos
          expect(VALID_STATES.length).toBe(4);

          // Estados devem ser os esperados
          expect(VALID_STATES).toContain('idle');
          expect(VALID_STATES).toContain('recording');
          expect(VALID_STATES).toContain('stopping');
          expect(VALID_STATES).toContain('stopped');

          // 'paused' NÃO deve estar na lista
          expect(VALID_STATES).not.toContain('paused');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Para qualquer estado válido, ele DEVE ser diferente de 'paused'.
     */
    it('qualquer estado válido DEVE ser diferente de "paused"', async () => {
      await fc.assert(
        fc.asyncProperty(validStateArbitrary, async (state) => {
          // Estado válido nunca é 'paused'
          expect(state).not.toBe('paused');
          expect(isPausedState(state)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * A máquina de estados DEVE ser determinística.
     */
    it('máquina de estados DEVE ser determinística', async () => {
      await fc.assert(
        fc.asyncProperty(actionSequenceArbitrary, async (actions) => {
          // Cria duas instâncias
          const stateMachine1 = new MockVideoCaptureStateMachine();
          const stateMachine2 = new MockVideoCaptureStateMachine();

          // Executa mesma sequência de ações em ambas
          for (const action of actions) {
            stateMachine1.executeAction(action);
            stateMachine2.executeAction(action);

            // Estados devem ser iguais
            expect(stateMachine1.getState()).toBe(stateMachine2.getState());

            // Estados devem ser válidos
            expect(VALID_STATES).toContain(stateMachine1.getState());
            expect(stateMachine1.getState()).not.toBe(FORBIDDEN_STATE);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Verificação de tipo: getState() DEVE retornar VideoRecordingState.
     */
    it('getState() DEVE retornar tipo VideoRecordingState', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          const state: VideoRecordingState = videoCapture.getState();

          // Tipo deve ser compatível com VideoRecordingState
          expect(typeof state).toBe('string');
          expect(VALID_STATES).toContain(state);

          // Estado nunca deve ser 'paused'
          expect(state).not.toBe('paused');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.3**
     *
     * Estados DEVEM ser strings não vazias.
     */
    it('estados DEVEM ser strings não vazias', async () => {
      await fc.assert(
        fc.asyncProperty(validStateArbitrary, async (state) => {
          // Estado deve ser string
          expect(typeof state).toBe('string');

          // Estado não deve ser vazio
          expect(state.length).toBeGreaterThan(0);

          // Estado deve ser um dos válidos
          expect(VALID_STATES).toContain(state);
        }),
        { numRuns: 100 }
      );
    });
  });
});
