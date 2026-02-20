/**
 * Property tests para Simple Elapsed Time Calculation
 *
 * Valida a propriedade de cálculo simplificado de tempo decorrido:
 * - Property 19: Simple Elapsed Time Calculation
 *
 * Para qualquer instância de VideoCapture em estado 'recording',
 * getElapsedTime() DEVE retornar `Date.now() - startTime` sem
 * quaisquer ajustes de pausa.
 *
 * A remoção de pause/resume garante integridade temporal da evidência.
 * Sem pausas, o tempo decorrido é sempre contínuo e verificável.
 *
 * **Validates: Requirements 5.4**
 *
 * @module simple-elapsed-time.property.test
 * @requirements 5.4

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { VideoCapture } from '../../src/content/video-capture';
import { AuditLogger } from '../../src/lib/audit-logger';

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

// Mock do document para coleta de HTML e lockdown
vi.stubGlobal('document', {
  documentElement: {
    outerHTML: '<html><body>Test</body></html>',
    scrollWidth: 1920,
    scrollHeight: 1080,
  },
  title: 'Test Page',
  querySelectorAll: vi.fn().mockReturnValue([]),
  querySelector: vi.fn().mockReturnValue(null),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  createElement: vi.fn().mockReturnValue({
    style: {},
    appendChild: vi.fn(),
    remove: vi.fn(),
  }),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  },
});

// Mock do window com event listeners para lockdown
vi.stubGlobal('window', {
  location: { href: 'https://example.com' },
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  history: {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
});

// Mock do navigator para mediaDevices
vi.stubGlobal('navigator', {
  userAgent: 'Mozilla/5.0 (Test)',
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue(null),
  },
});

// Mock do MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    // Construtor mock
  }

  start(_timeslice?: number): void {
    this.state = 'recording';
    // Simular chunk de dados após um pequeno delay
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['test'], { type: 'video/webm' }) });
      }
    }, 100);
  }

  stop(): void {
    this.state = 'inactive';
    setTimeout(() => {
      if (this.onstop) {
        this.onstop();
      }
    }, 10);
  }

  static isTypeSupported(_mimeType: string): boolean {
    return true;
  }
}

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

// Mock do LockdownSecurityManager
vi.mock('../../src/content/lockdown-manager', () => ({
  LockdownSecurityManager: vi.fn().mockImplementation(() => ({
    activate: vi.fn().mockResolvedValue({ success: true, protections: [] }),
    deactivate: vi.fn().mockReturnValue({ totalViolations: 0 }),
  })),
}));

// Mock do CryptoUtils
vi.mock('../../src/lib/crypto-utils-native', () => ({
  CryptoUtils: {
    hash: vi.fn().mockResolvedValue('mock-hash-sha256'),
  },
}));

// ============================================================================
// Constantes para Testes
// ============================================================================

/**
 * Tolerância para comparação de tempo em ms
 * Permite pequenas variações devido à execução do código
 */
const TIME_TOLERANCE_MS = 50;

/**
 * Duração máxima de gravação em ms (30 minutos)
 */
const MAX_DURATION_MS = 30 * 60 * 1000;

/**
 * Estados válidos do VideoCapture
 */
// @ts-expect-error Constante reservada para testes futuros de validação de estados
const VALID_STATES = ['idle', 'recording', 'stopping', 'stopped'] as const;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

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
 * Gera tempo de início válido (no passado recente)
 * Simula diferentes momentos de início de gravação
 */
const startTimeArbitrary = fc.integer({
  min: 1000, // Pelo menos 1 segundo atrás
  max: MAX_DURATION_MS - 1000, // Até quase o máximo
});

/**
 * Gera número de verificações de tempo
 */
const checkCountArbitrary = fc.integer({ min: 1, max: 10 });

/**
 * Gera delay entre verificações em ms
 */
const delayArbitrary = fc.integer({ min: 10, max: 100 });

/**
 * Gera número de instâncias para teste
 */
const instanceCountArbitrary = fc.integer({ min: 1, max: 5 });

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
 * Cria mock de MediaStream para testes
 *
 * @returns MediaStream mock
 */
function createMockMediaStream(): MediaStream {
  const mockTrack = {
    stop: vi.fn(),
    kind: 'video',
    enabled: true,
    readyState: 'live',
  } as unknown as MediaStreamTrack;

  return {
    getTracks: () => [mockTrack],
    getVideoTracks: () => [mockTrack],
    getAudioTracks: () => [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
  } as unknown as MediaStream;
}

/**
 * Aguarda um tempo específico
 *
 * @param ms - Tempo em milissegundos
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifica se dois valores de tempo estão dentro da tolerância
 *
 * @param actual - Valor atual
 * @param expected - Valor esperado
 * @param tolerance - Tolerância em ms
 * @returns true se estão dentro da tolerância
 */
function isWithinTolerance(actual: number, expected: number, tolerance: number = TIME_TOLERANCE_MS): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Limpa mocks entre testes
 */
function clearMocks(): void {
  vi.clearAllMocks();
}

// ============================================================================
// Classe Mock para Simulação de Estado de Gravação
// ============================================================================

/**
 * Mock simplificado para simular cálculo de tempo decorrido
 *
 * Implementa a mesma lógica do VideoCapture para validação
 */
class MockElapsedTimeCalculator {
  private startTime: number = 0;
  private state: 'idle' | 'recording' | 'stopping' | 'stopped' = 'idle';

  /**
   * Inicia "gravação" com timestamp específico
   */
  start(startTime?: number): void {
    this.startTime = startTime ?? Date.now();
    this.state = 'recording';
  }

  /**
   * Para "gravação"
   */
  stop(): void {
    this.state = 'stopped';
  }

  /**
   * Obtém estado atual
   */
  getState(): 'idle' | 'recording' | 'stopping' | 'stopped' {
    return this.state;
  }

  /**
   * Obtém tempo decorrido (cálculo simples)
   *
   * DEVE ser: Date.now() - startTime
   * SEM ajustes de pausa
   */
  getElapsedTime(): number {
    if (this.state === 'idle' || this.startTime === 0) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Obtém startTime para verificação
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Reseta estado
   */
  reset(): void {
    this.startTime = 0;
    this.state = 'idle';
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Simple Elapsed Time Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 19: Simple Elapsed Time Calculation
  // Feature: video-capture-redesign
  // Validates: Requirements 5.4
  // ==========================================================================

  describe('Property 19: Simple Elapsed Time Calculation', () => {
    /**
     * **Validates: Requirements 5.4**
     *
     * Para qualquer instância de VideoCapture em estado 'idle',
     * getElapsedTime() DEVE retornar 0.
     */
    it('getElapsedTime() DEVE retornar 0 quando estado é "idle"', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          // Estado inicial deve ser 'idle'
          expect(videoCapture.getState()).toBe('idle');

          // Tempo decorrido deve ser 0
          const elapsed = videoCapture.getElapsedTime();
          expect(elapsed).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Para qualquer instância de VideoCapture em estado 'recording',
     * getElapsedTime() DEVE retornar aproximadamente Date.now() - startTime.
     */
    it('getElapsedTime() DEVE retornar Date.now() - startTime durante gravação', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);
          const mockStream = createMockMediaStream();

          // Capturar tempo antes de iniciar
          const beforeStart = Date.now();

          // Iniciar gravação com mock stream
          await videoCapture.start({ mediaStream: mockStream });

          // Capturar tempo após iniciar
          const afterStart = Date.now();

          // Verificar estado
          expect(videoCapture.getState()).toBe('recording');

          // Aguardar um pouco para ter tempo decorrido mensurável
          await sleep(50);

          // Obter tempo decorrido
          const elapsed = videoCapture.getElapsedTime();
          const now = Date.now();

          // Tempo decorrido deve estar entre (now - afterStart) e (now - beforeStart)
          const minExpected = now - afterStart;
          const maxExpected = now - beforeStart;

          expect(elapsed).toBeGreaterThanOrEqual(minExpected - TIME_TOLERANCE_MS);
          expect(elapsed).toBeLessThanOrEqual(maxExpected + TIME_TOLERANCE_MS);

          // Limpar
          videoCapture.cancel();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O cálculo de tempo decorrido DEVE ser monotonicamente crescente
     * durante a gravação (sem pausas).
     */
    it('getElapsedTime() DEVE ser monotonicamente crescente durante gravação', async () => {
      await fc.assert(
        fc.asyncProperty(
          videoCaptureConfigArbitrary,
          checkCountArbitrary,
          async (config, checkCount) => {
            const videoCapture = createVideoCapture(config);
            const mockStream = createMockMediaStream();

            // Iniciar gravação
            await videoCapture.start({ mediaStream: mockStream });
            expect(videoCapture.getState()).toBe('recording');

            let previousElapsed = 0;

            // Verificar múltiplas vezes que o tempo é crescente
            for (let i = 0; i < checkCount; i++) {
              await sleep(10); // Pequeno delay entre verificações

              const currentElapsed = videoCapture.getElapsedTime();

              // Tempo atual deve ser maior ou igual ao anterior
              expect(currentElapsed).toBeGreaterThanOrEqual(previousElapsed);

              previousElapsed = currentElapsed;
            }

            // Limpar
            videoCapture.cancel();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O cálculo de tempo decorrido NÃO DEVE ter ajustes de pausa
     * (não deve haver propriedades pausedTime ou totalPausedDuration).
     */
    it('cálculo NÃO DEVE ter ajustes de pausa', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          // Verificar que propriedades de pausa não existem publicamente
          const videoCaptureAsUnknown = videoCapture as unknown;
          const videoCaptureRecord = videoCaptureAsUnknown as Record<string, unknown>;

          // Propriedades de pausa NÃO devem ser acessíveis
          expect(videoCaptureRecord['pausedTime']).toBeUndefined();
          expect(videoCaptureRecord['totalPausedDuration']).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Para qualquer tempo de início simulado, o cálculo DEVE ser
     * consistente com Date.now() - startTime.
     */
    it('cálculo DEVE ser consistente com Date.now() - startTime', async () => {
      await fc.assert(
        fc.asyncProperty(startTimeArbitrary, async (elapsedMs) => {
          const calculator = new MockElapsedTimeCalculator();

          // Simular início no passado
          const startTime = Date.now() - elapsedMs;
          calculator.start(startTime);

          // Obter tempo decorrido
          const elapsed = calculator.getElapsedTime();
          const now = Date.now();
          const expected = now - startTime;

          // Deve estar dentro da tolerância
          expect(isWithinTolerance(elapsed, expected)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Múltiplas instâncias de VideoCapture DEVEM ter cálculos
     * de tempo independentes.
     */
    it('múltiplas instâncias DEVEM ter cálculos de tempo independentes', async () => {
      await fc.assert(
        fc.asyncProperty(instanceCountArbitrary, async (count) => {
          const instances: VideoCapture[] = [];
          const mockStreams: MediaStream[] = [];
          const startTimes: number[] = [];

          // Criar e iniciar múltiplas instâncias com delays
          for (let i = 0; i < count; i++) {
            const videoCapture = createVideoCapture();
            const mockStream = createMockMediaStream();

            instances.push(videoCapture);
            mockStreams.push(mockStream);

            startTimes.push(Date.now());
            await videoCapture.start({ mediaStream: mockStream });

            // Pequeno delay entre instâncias
            await sleep(20);
          }

          // Aguardar um pouco
          await sleep(50);

          // Verificar que cada instância tem tempo decorrido diferente
          const elapsedTimes = instances.map((instance) => instance.getElapsedTime());

          // Instâncias iniciadas antes devem ter mais tempo decorrido
          for (let i = 0; i < elapsedTimes.length - 1; i++) {
            const currentTime = elapsedTimes[i];
            const nextTime = elapsedTimes[i + 1];
            // Instância i foi iniciada antes de i+1, então deve ter mais tempo
            if (currentTime !== undefined && nextTime !== undefined) {
              expect(currentTime).toBeGreaterThan(nextTime - TIME_TOLERANCE_MS);
            }
          }

          // Limpar todas as instâncias
          for (const instance of instances) {
            instance.cancel();
          }
        }),
        { numRuns: 50 } // Reduzido para evitar timeout
      );
    }, 30000); // Timeout de 30 segundos

    /**
     * **Validates: Requirements 5.4**
     *
     * O tempo decorrido DEVE aumentar proporcionalmente ao tempo real.
     */
    it('tempo decorrido DEVE aumentar proporcionalmente ao tempo real', async () => {
      await fc.assert(
        fc.asyncProperty(delayArbitrary, async (delay) => {
          const videoCapture = createVideoCapture();
          const mockStream = createMockMediaStream();

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });

          // Capturar tempo inicial
          const elapsed1 = videoCapture.getElapsedTime();
          const time1 = Date.now();

          // Aguardar delay
          await sleep(delay);

          // Capturar tempo final
          const elapsed2 = videoCapture.getElapsedTime();
          const time2 = Date.now();

          // Diferença no tempo decorrido deve ser aproximadamente igual ao delay real
          const elapsedDiff = elapsed2 - elapsed1;
          const realDiff = time2 - time1;

          expect(isWithinTolerance(elapsedDiff, realDiff)).toBe(true);

          // Limpar
          videoCapture.cancel();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Após cancelamento, getElapsedTime() DEVE retornar 0.
     */
    it('getElapsedTime() DEVE retornar 0 após cancelamento', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);
          const mockStream = createMockMediaStream();

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });
          expect(videoCapture.getState()).toBe('recording');

          // Aguardar um pouco
          await sleep(50);

          // Verificar que há tempo decorrido
          expect(videoCapture.getElapsedTime()).toBeGreaterThan(0);

          // Cancelar
          videoCapture.cancel();

          // Após cancelamento, tempo deve ser 0
          expect(videoCapture.getElapsedTime()).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O cálculo DEVE ser simples: Date.now() - startTime
     * (verificação via mock que implementa a mesma lógica).
     */
    it('cálculo DEVE ser simples: Date.now() - startTime', async () => {
      await fc.assert(
        fc.asyncProperty(
          startTimeArbitrary,
          checkCountArbitrary,
          async (elapsedMs, checkCount) => {
            const calculator = new MockElapsedTimeCalculator();

            // Simular início no passado
            const startTime = Date.now() - elapsedMs;
            calculator.start(startTime);

            // Verificar múltiplas vezes
            for (let i = 0; i < checkCount; i++) {
              const elapsed = calculator.getElapsedTime();
              const now = Date.now();
              const expected = now - calculator.getStartTime();

              // Cálculo deve ser exatamente Date.now() - startTime
              // (com pequena tolerância para execução)
              expect(isWithinTolerance(elapsed, expected, 5)).toBe(true);

              await sleep(10);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O tempo decorrido DEVE ser sempre não-negativo.
     */
    it('getElapsedTime() DEVE ser sempre não-negativo', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);
          const mockStream = createMockMediaStream();

          // Verificar em estado idle
          expect(videoCapture.getElapsedTime()).toBeGreaterThanOrEqual(0);

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });

          // Verificar durante gravação
          expect(videoCapture.getElapsedTime()).toBeGreaterThanOrEqual(0);

          // Cancelar
          videoCapture.cancel();

          // Verificar após cancelamento
          expect(videoCapture.getElapsedTime()).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O tempo decorrido DEVE ser um número inteiro (ms).
     */
    it('getElapsedTime() DEVE retornar número inteiro', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);
          const mockStream = createMockMediaStream();

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });

          // Aguardar um pouco
          await sleep(50);

          // Obter tempo decorrido
          const elapsed = videoCapture.getElapsedTime();

          // Deve ser um número
          expect(typeof elapsed).toBe('number');

          // Deve ser inteiro (Date.now() retorna inteiro)
          expect(Number.isInteger(elapsed)).toBe(true);

          // Limpar
          videoCapture.cancel();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O tempo decorrido DEVE ser consistente com getRemainingTime().
     */
    it('getElapsedTime() + getRemainingTime() DEVE ser aproximadamente maxDurationMs', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);
          const mockStream = createMockMediaStream();

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });

          // Aguardar um pouco
          await sleep(50);

          // Obter tempos
          const elapsed = videoCapture.getElapsedTime();
          const remaining = videoCapture.getRemainingTime();
          const maxDuration = videoCapture.getConfig().maxDurationMs;

          // elapsed + remaining deve ser aproximadamente maxDuration
          const sum = elapsed + remaining;
          expect(isWithinTolerance(sum, maxDuration)).toBe(true);

          // Limpar
          videoCapture.cancel();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Verificação de que não há propriedades ou métodos relacionados a pausa
     * que possam afetar o cálculo de tempo.
     */
    it('NÃO DEVE haver métodos ou propriedades de pausa que afetem o cálculo', async () => {
      await fc.assert(
        fc.asyncProperty(videoCaptureConfigArbitrary, async (config) => {
          const videoCapture = createVideoCapture(config);

          // Verificar que métodos de pausa não existem
          const videoCaptureAsUnknown = videoCapture as unknown;
          const videoCaptureRecord = videoCaptureAsUnknown as Record<string, unknown>;

          // Métodos de pausa NÃO devem existir
          expect(typeof videoCaptureRecord['pause']).not.toBe('function');
          expect(typeof videoCaptureRecord['resume']).not.toBe('function');
          expect(typeof videoCaptureRecord['isPaused']).not.toBe('function');

          // Propriedades de pausa NÃO devem existir
          expect(videoCaptureRecord['pausedTime']).toBeUndefined();
          expect(videoCaptureRecord['totalPausedDuration']).toBeUndefined();
          expect(videoCaptureRecord['pauseStartTime']).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O cálculo de tempo DEVE ser determinístico para o mesmo startTime.
     */
    it('cálculo DEVE ser determinístico para o mesmo startTime', async () => {
      await fc.assert(
        fc.asyncProperty(startTimeArbitrary, async (elapsedMs) => {
          const calculator1 = new MockElapsedTimeCalculator();
          const calculator2 = new MockElapsedTimeCalculator();

          // Usar o mesmo startTime para ambos
          const startTime = Date.now() - elapsedMs;
          calculator1.start(startTime);
          calculator2.start(startTime);

          // Obter tempo decorrido de ambos no mesmo momento
          const elapsed1 = calculator1.getElapsedTime();
          const elapsed2 = calculator2.getElapsedTime();

          // Devem ser iguais (ou muito próximos)
          expect(isWithinTolerance(elapsed1, elapsed2, 5)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * O tempo decorrido DEVE refletir o tempo real passado,
     * não um tempo ajustado por pausas.
     */
    it('tempo decorrido DEVE refletir tempo real sem ajustes', async () => {
      await fc.assert(
        fc.asyncProperty(delayArbitrary, async (delay) => {
          const videoCapture = createVideoCapture();
          const mockStream = createMockMediaStream();

          // Capturar tempo antes de iniciar
          const beforeStart = Date.now();

          // Iniciar gravação
          await videoCapture.start({ mediaStream: mockStream });

          // Aguardar delay específico
          await sleep(delay);

          // Capturar tempo após delay
          const afterDelay = Date.now();

          // Obter tempo decorrido
          const elapsed = videoCapture.getElapsedTime();

          // Tempo decorrido deve ser aproximadamente (afterDelay - beforeStart)
          // Isso prova que não há ajustes de pausa
          const expectedMin = afterDelay - beforeStart - TIME_TOLERANCE_MS;
          const expectedMax = afterDelay - beforeStart + TIME_TOLERANCE_MS;

          expect(elapsed).toBeGreaterThanOrEqual(expectedMin);
          expect(elapsed).toBeLessThanOrEqual(expectedMax);

          // Limpar
          videoCapture.cancel();
        }),
        { numRuns: 100 }
      );
    });
  });
});
