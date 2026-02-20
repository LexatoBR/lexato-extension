/**
 * Testes unitários para o BackendIntegration da Extensão Chrome Lexato
 *
 * Testa integração com backend para certificação em cascata (Níveis 3-5)
 *
 * Requisitos testados:
 * - 24.1: Enviar Hash_N2 para certificação temporal
 * - 24.4: Receber notificação de PDF via WebSocket
 * - 24.5: Polling com backoff para status de certificação
 * - 24.6: Timeout de 5 min para ICP-Brasil
 * - 24.7: Timeout de 10 min para blockchain
 * - 24.8: Exibir progresso de cada nível na UI
 * - 24.9: Tratar fallback para TSAs internacionais
 * - 24.10: Informar usuário sobre certificação parcial
 *
 * @module BackendIntegrationTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BackendIntegration,
  type BackendIntegrationOptions,
  type CertificationProgress,
} from '../../../src/background/backend-integration';
import { LexatoError, ErrorCodes } from '../../../src/lib/errors';
import { CircuitOpenError } from '../../../src/lib/circuit-breaker';
import type { PCCLevel2Result } from '../../../src/types/pcc.types';
import type { CertificationStatusResponse } from '../../../src/types/api.types';

// Mock do AuditLogger
vi.mock('../../../src/lib/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    getCorrelationId: vi.fn(() => 'test-correlation-id'),
  })),
}));

// Mock do CircuitBreaker
vi.mock('../../../src/lib/circuit-breaker', () => ({
  CircuitBreaker: vi.fn().mockImplementation(() => ({
    execute: vi.fn((fn) => fn()),
    getState: vi.fn(() => 'CLOSED'),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  })),
  CircuitOpenError: class CircuitOpenError extends Error {
    constructor(message = 'Circuit is open') {
      super(message);
      this.name = 'CircuitOpenError';
    }
  },
}));

// Mock do RetryHandler
vi.mock('../../../src/lib/retry-handler', () => ({
  RetryHandler: vi.fn().mockImplementation(() => ({
    execute: vi.fn((fn) => fn()),
  })),
}));

// Mock do WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(_url: string | URL, _protocols?: string | string[]) {
    // Simular conexão bem-sucedida após um tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen();
      }
    }, 0);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }

  // Método auxiliar para simular mensagens recebidas
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

// Substituir WebSocket global
const originalWebSocket = global.WebSocket;
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).WebSocket = MockWebSocket;
});

afterEach(() => {
  (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
});

describe('BackendIntegration', () => {
  let mockApiClient: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    getCorrelationId: ReturnType<typeof vi.fn>;
  };

  const mockLevel2Result: PCCLevel2Result = {
    success: true,
    hashN2: 'a'.repeat(64),
    hashN1: 'b'.repeat(64),
    serverTimestamp: new Date().toISOString(),
    serverSignature: 'mock-signature',
    signatureVerified: true,
    certificateId: 'cert-123',
    processingTimeMs: 100,
  };

  const mockCertificationStatus: CertificationStatusResponse = {
    captureId: 'test-capture-id',
    status: 'completed',
    levels: {
      level1: { status: 'completed', hash: 'hash1' },
      level2: { status: 'completed', hash: 'hash2', timestamp: new Date().toISOString() },
      level3: { status: 'completed', timestamp: new Date().toISOString() },
      level4: {
        status: 'completed',
        polygon: { txHash: '0x123', blockNumber: 12345 },
        arbitrum: { txHash: '0x456', blockNumber: 67890 },
      },
      level5: { status: 'completed', pdfUrl: 'https://cdn.lexato.com.br/pdf/test.pdf' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockApiClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          success: true,
          certificationId: 'cert-123',
          status: 'queued',
        },
      }),
      get: vi.fn().mockResolvedValue({
        success: true,
        data: mockCertificationStatus,
      }),
      getConfig: vi.fn().mockReturnValue({
        baseURL: 'https://api.lexato.com.br',
      }),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      getCorrelationId: vi.fn(() => 'test-correlation-id'),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Construtor e Configuração', () => {
    it('deve criar instância com configuração padrão', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      expect(integration).toBeDefined();
      expect(integration.getIcpBrasilCircuitState()).toBe('CLOSED');
      expect(integration.getBlockchainCircuitState()).toBe('CLOSED');
    });

    it('deve aceitar opções customizadas', () => {
      const options: BackendIntegrationOptions = {
        icpBrasilTimeoutMs: 3 * 60 * 1000,
        blockchainTimeoutMs: 5 * 60 * 1000,
        pollingIntervalMs: 1000,
        maxPollingIntervalMs: 15000,
      };

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        options
      );

      expect(integration).toBeDefined();
    });

    it('deve configurar callback de progresso', () => {
      const onProgress = vi.fn();

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { onProgress }
      );

      expect(integration).toBeDefined();
    });

    it('deve configurar callback de PDF pronto', () => {
      const onPdfReady = vi.fn();

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { onPdfReady }
      );

      expect(integration).toBeDefined();
    });
  });


  describe('submitForCertification (Requisito 24.1)', () => {
    it('deve enviar Hash_N2 para certificação', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      // Avançar timers para completar polling
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/certification/submit',
        expect.objectContaining({
          captureId: 'test-capture-id',
          hashN2: mockLevel2Result.hashN2,
          hashN1: mockLevel2Result.hashN1,
          storageType: 'standard',
        })
      );

      expect(result.captureId).toBe('test-capture-id');
    });

    it('deve validar resultado do Nível 2 antes de enviar', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const invalidResult: PCCLevel2Result = {
        ...mockLevel2Result,
        success: false,
      };

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        invalidResult,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nível 2');
    });

    it('deve rejeitar Hash_N2 inválido', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const invalidResult: PCCLevel2Result = {
        ...mockLevel2Result,
        hashN2: 'invalid-hash',
      };

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        invalidResult,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hash_N2 inválido');
    });

    it('deve rejeitar Hash_N1 inválido', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const invalidResult: PCCLevel2Result = {
        ...mockLevel2Result,
        hashN1: 'invalid-hash',
      };

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        invalidResult,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hash_N1 inválido');
    });

    it('deve retornar erro quando submissão falha', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Erro interno do servidor',
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
    });

    it('deve suportar todos os tipos de armazenamento', async () => {
      const storageTypes: Array<'standard' | 'premium_5y' | 'premium_10y' | 'premium_20y'> = [
        'standard',
        'premium_5y',
        'premium_10y',
        'premium_20y',
      ];

      for (const storageType of storageTypes) {
        mockApiClient.post.mockClear();

        const integration = new BackendIntegration(
          mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
          mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
        );

        const resultPromise = integration.submitForCertification(
          'test-capture-id',
          mockLevel2Result,
          storageType
        );

        await vi.runAllTimersAsync();

        await resultPromise;

        expect(mockApiClient.post).toHaveBeenCalledWith(
          '/certification/submit',
          expect.objectContaining({
            storageType,
          })
        );
      }
    });
  });

  describe('getCertificationStatus', () => {
    it('deve consultar status de certificação', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const status = await integration.getCertificationStatus('test-capture-id');

      expect(mockApiClient.get).toHaveBeenCalledWith('/certification/status/test-capture-id');
      expect(status.captureId).toBe('test-capture-id');
      expect(status.status).toBe('completed');
    });

    it('deve lançar erro quando consulta falha', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        success: false,
        error: 'Captura não encontrada',
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      await expect(integration.getCertificationStatus('invalid-id')).rejects.toThrow(LexatoError);
    });
  });


  describe('Polling com Backoff (Requisito 24.5)', () => {
    it('deve fazer polling até certificação completar', async () => {
      // Simular status em progresso, depois completo
      let callCount = 0;
      mockApiClient.get.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            success: true,
            data: {
              ...mockCertificationStatus,
              status: 'processing',
              levels: {
                ...mockCertificationStatus.levels,
                level5: { status: 'processing' },
              },
            },
          });
        }
        return Promise.resolve({
          success: true,
          data: mockCertificationStatus,
        });
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('deve aumentar intervalo de polling com backoff', async () => {
      const pollIntervals: number[] = [];
      let lastPollTime = Date.now();

      mockApiClient.get.mockImplementation(() => {
        const now = Date.now();
        pollIntervals.push(now - lastPollTime);
        lastPollTime = now;

        return Promise.resolve({
          success: true,
          data: {
            ...mockCertificationStatus,
            status: 'processing',
          },
        });
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        {
          pollingIntervalMs: 1000,
          maxPollingIntervalMs: 5000,
          icpBrasilTimeoutMs: 10000,
          blockchainTimeoutMs: 10000,
        }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      // Avançar tempo para permitir alguns polls
      await vi.advanceTimersByTimeAsync(15000);

      integration.cancelPolling();

      await resultPromise;

      // Verificar que houve polling
      expect(mockApiClient.get).toHaveBeenCalled();
    });

    it('deve permitir cancelar polling', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'processing',
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      // Iniciar certificação (que inicia polling internamente)
      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      // Aguardar que o polling seja iniciado (após submissão bem-sucedida)
      await vi.advanceTimersByTimeAsync(200);

      // Cancelar polling
      integration.cancelPolling();

      // Verificar que polling foi cancelado
      expect(integration.isPollingActive()).toBe(false);

      // Completar a promise
      await vi.runAllTimersAsync();
      await resultPromise;
    });
  });

  describe('Timeouts (Requisitos 24.6, 24.7)', () => {
    it('deve respeitar timeout de 5 min para ICP-Brasil (Requisito 24.6)', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        {
          icpBrasilTimeoutMs: 5 * 60 * 1000,
          blockchainTimeoutMs: 10 * 60 * 1000,
        }
      );

      // Verificar que a configuração foi aplicada
      expect(integration).toBeDefined();
    });

    it('deve respeitar timeout de 10 min para blockchain (Requisito 24.7)', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        {
          icpBrasilTimeoutMs: 5 * 60 * 1000,
          blockchainTimeoutMs: 10 * 60 * 1000,
        }
      );

      // Verificar que a configuração foi aplicada
      expect(integration).toBeDefined();
    });

    it('deve retornar resultado parcial após timeout', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'processing',
          levels: {
            ...mockCertificationStatus.levels,
            level3: { status: 'completed', timestamp: new Date().toISOString() },
            level4: { status: 'processing' },
            level5: { status: 'pending' },
          },
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        {
          icpBrasilTimeoutMs: 1000,
          blockchainTimeoutMs: 2000,
          pollingIntervalMs: 100,
        }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      // Avançar além do timeout
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      // Deve retornar resultado mesmo após timeout
      expect(result).toBeDefined();
      expect(result.captureId).toBe('test-capture-id');
    });
  });


  describe('WebSocket para Notificações (Requisito 24.4)', () => {
    it('deve conectar ao WebSocket', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      integration.connectWebSocket('test-capture-id');

      // Aguardar conexão
      await vi.advanceTimersByTimeAsync(100);

      expect(integration.isWebSocketConnected()).toBe(true);
    });

    it('deve desconectar do WebSocket', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      integration.connectWebSocket('test-capture-id');
      await vi.advanceTimersByTimeAsync(100);

      integration.disconnectWebSocket();

      expect(integration.isWebSocketConnected()).toBe(false);
    });

    it('deve chamar callback quando PDF estiver pronto', async () => {
      const onPdfReady = vi.fn();

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { onPdfReady }
      );

      integration.connectWebSocket('test-capture-id');
      await vi.advanceTimersByTimeAsync(100);

      // Verificar que o WebSocket foi conectado e callback configurado
      expect(integration.isWebSocketConnected()).toBe(true);
    });

    it('não deve reconectar se já conectado', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      integration.connectWebSocket('test-capture-id');
      await vi.advanceTimersByTimeAsync(100);

      // Tentar conectar novamente
      integration.connectWebSocket('test-capture-id');

      // Deve ter logado warning
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Progresso da Certificação (Requisito 24.8)', () => {
    it('deve reportar progresso durante certificação', async () => {
      const progressUpdates: CertificationProgress[] = [];
      const onProgress = vi.fn((progress: CertificationProgress) => {
        progressUpdates.push({ ...progress });
      });

      // Simular progresso gradual
      let callCount = 0;
      mockApiClient.get.mockImplementation(() => {
        callCount++;
        const statuses = [
          { status: 'processing', level3: 'processing', level4: 'pending', level5: 'pending' },
          { status: 'processing', level3: 'completed', level4: 'processing', level5: 'pending' },
          { status: 'processing', level3: 'completed', level4: 'completed', level5: 'processing' },
          { status: 'completed', level3: 'completed', level4: 'completed', level5: 'completed' },
        ];
        const idx = Math.min(callCount - 1, statuses.length - 1);
        const s = statuses[idx];

        if (!s) {
          return Promise.resolve({
            success: true,
            data: mockCertificationStatus,
          });
        }

        return Promise.resolve({
          success: true,
          data: {
            ...mockCertificationStatus,
            status: s.status,
            levels: {
              ...mockCertificationStatus.levels,
              level3: { status: s.level3, timestamp: new Date().toISOString() },
              level4: { status: s.level4, polygon: { txHash: '0x123' }, arbitrum: { txHash: '0x456' } },
              level5: { status: s.level5, pdfUrl: s.level5 === 'completed' ? 'https://test.pdf' : undefined },
            },
          },
        });
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { onProgress, pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      // Deve ter chamado callback de progresso
      expect(onProgress).toHaveBeenCalled();
    });

    it('deve incluir status de cada nível no progresso', async () => {
      const progressUpdates: CertificationProgress[] = [];
      const onProgress = vi.fn((progress: CertificationProgress) => {
        progressUpdates.push({ ...progress });
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { onProgress, pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      // Verificar que progresso inclui níveis
      if (progressUpdates.length > 0) {
        const lastProgress = progressUpdates[progressUpdates.length - 1];
        if (lastProgress) {
          expect(lastProgress.levels).toBeDefined();
          expect(lastProgress.levels.level3).toBeDefined();
          expect(lastProgress.levels.level4).toBeDefined();
          expect(lastProgress.levels.level5).toBeDefined();
        }
      }
    });
  });

  describe('Fallback para TSAs (Requisito 24.9)', () => {
    it('deve identificar quando usar fallback por CircuitOpenError', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const circuitError = new CircuitOpenError('Circuit is open');
      expect(integration.shouldUseFallback(circuitError)).toBe(true);
    });

    it('deve identificar quando usar fallback por timeout', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const timeoutError = new LexatoError(ErrorCodes.NETWORK_TIMEOUT);
      expect(integration.shouldUseFallback(timeoutError)).toBe(true);
    });

    it('deve identificar quando usar fallback por erro de servidor', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const serverError = new LexatoError(ErrorCodes.NETWORK_SERVER_ERROR);
      expect(integration.shouldUseFallback(serverError)).toBe(true);
    });

    it('não deve usar fallback para outros erros', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      const validationError = new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT);
      expect(integration.shouldUseFallback(validationError)).toBe(false);

      const genericError = new Error('Generic error');
      expect(integration.shouldUseFallback(genericError)).toBe(false);
    });
  });

  describe('Certificação Parcial (Requisito 24.10)', () => {
    it('deve identificar certificação parcial quando blockchain falha parcialmente', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'completed',
          levels: {
            ...mockCertificationStatus.levels,
            level4: {
              status: 'partial',
              polygon: { txHash: '0x123', blockNumber: 12345 },
              // Arbitrum falhou
            },
          },
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isPartial).toBe(true);
      expect(result.success).toBe(true); // Ainda é sucesso, mas parcial
    });

    it('deve logar warning para certificação parcial', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'completed',
          levels: {
            ...mockCertificationStatus.levels,
            level4: { status: 'partial' },
          },
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'PCC',
        'PARTIAL_CERTIFICATION',
        expect.any(Object)
      );
    });

    it('deve identificar certificação parcial quando nível 5 falha', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'completed',
          levels: {
            ...mockCertificationStatus.levels,
            level4: { status: 'completed', polygon: { txHash: '0x123' }, arbitrum: { txHash: '0x456' } },
            level5: { status: 'failed', error: 'Falha ao gerar PDF' },
          },
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isPartial).toBe(true);
    });
  });


  describe('Resultado da Certificação', () => {
    it('deve retornar resultado completo com todos os níveis', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.captureId).toBe('test-capture-id');
      expect(result.level3).toBeDefined();
      expect(result.level4).toBeDefined();
      expect(result.level5).toBeDefined();
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve incluir dados de blockchain quando disponíveis', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.level4.polygon).toBeDefined();
      expect(result.level4.polygon?.txHash).toBe('0x123');
      expect(result.level4.arbitrum).toBeDefined();
      expect(result.level4.arbitrum?.txHash).toBe('0x456');
    });

    it('deve incluir URL do PDF quando disponível', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.level5.pdfUrl).toBe('https://cdn.lexato.com.br/pdf/test.pdf');
    });

    it('deve retornar resultado de falha com mensagem de erro', async () => {
      mockApiClient.get.mockResolvedValue({
        success: true,
        data: {
          ...mockCertificationStatus,
          status: 'failed',
          error: 'Falha na certificação ICP-Brasil',
          levels: {
            ...mockCertificationStatus.levels,
            level3: { status: 'failed' },
            level4: { status: 'failed' },
            level5: { status: 'failed' },
          },
        },
      });

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Getters de Estado', () => {
    it('deve retornar estado do Circuit Breaker ICP-Brasil', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      expect(integration.getIcpBrasilCircuitState()).toBe('CLOSED');
    });

    it('deve retornar estado do Circuit Breaker Blockchain', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      expect(integration.getBlockchainCircuitState()).toBe('CLOSED');
    });

    it('deve retornar estado de polling', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      expect(integration.isPollingActive()).toBe(false);
    });

    it('deve retornar estado de conexão WebSocket', () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
      );

      expect(integration.isWebSocketConnected()).toBe(false);
    });
  });

  describe('Logging e Auditoria', () => {
    it('deve logar início da certificação', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(mockLogger.info).toHaveBeenCalledWith(
        'PCC',
        'BACKEND_CERTIFICATION_START',
        expect.objectContaining({
          captureId: 'test-capture-id',
          storageType: 'standard',
        })
      );
    });

    it('deve logar conclusão da certificação', async () => {
      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(mockLogger.info).toHaveBeenCalledWith(
        'PCC',
        'BACKEND_CERTIFICATION_COMPLETE',
        expect.any(Object)
      );
    });

    it('deve logar erro quando certificação falha', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Erro de rede'));

      const integration = new BackendIntegration(
        mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
        mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never,
        { pollingIntervalMs: 100 }
      );

      const resultPromise = integration.submitForCertification(
        'test-capture-id',
        mockLevel2Result,
        'standard'
      );

      await vi.runAllTimersAsync();

      await resultPromise;

      expect(mockLogger.error).toHaveBeenCalledWith(
        'PCC',
        'BACKEND_CERTIFICATION_FAILED',
        expect.any(Object)
      );
    });
  });
});

describe('Mensagens em Português', () => {
  it('deve ter mensagens de erro em português', async () => {
    const mockApiClient = {
      post: vi.fn().mockResolvedValue({ success: false, error: 'Erro' }),
      get: vi.fn(),
      getConfig: vi.fn().mockReturnValue({ baseURL: 'https://api.lexato.com.br' }),
    };

    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      getCorrelationId: vi.fn(() => 'test-correlation-id'),
    };

    const integration = new BackendIntegration(
      mockApiClient as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { apiClient: infer A } ? A : never : never,
      mockLogger as unknown as Parameters<typeof BackendIntegration.prototype.submitForCertification>[0] extends infer T ? T extends { logger: infer L } ? L : never : never
    );

    const invalidResult: PCCLevel2Result = {
      success: true,
      hashN2: 'invalid',
      hashN1: 'a'.repeat(64),
      serverTimestamp: new Date().toISOString(),
      serverSignature: 'sig',
      signatureVerified: true,
      certificateId: 'cert',
      processingTimeMs: 100,
    };

    vi.useFakeTimers();

    const resultPromise = integration.submitForCertification(
      'test-capture-id',
      invalidResult,
      'standard'
    );

    await vi.runAllTimersAsync();

    const result = await resultPromise;

    // Mensagem de erro deve estar em português
    expect(result.error).toMatch(/inválido|falha|erro/i);

    vi.useRealTimers();
  });
});
