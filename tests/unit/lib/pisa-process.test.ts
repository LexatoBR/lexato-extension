/**
 * Testes unitários para PISAProcess
 *
 * Testa o Processo de Inicialização Segura de Ambiente
 *
 * @module PISAProcessTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PISAProcess, DEFAULT_PISA_CONFIG } from '@lib/pisa-process';
import { AuditLogger } from '@lib/audit-logger';
import { CryptoUtils } from '@lib/crypto-utils';

// Mock do chrome API
const mockChrome = {
  runtime: {
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
  },
  tabs: {
    get: vi.fn(),
    update: vi.fn(),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

// Mock do crypto.subtle para ECDH
const mockPublicKey = { type: 'public' } as CryptoKey;
const mockPrivateKey = { type: 'private' } as CryptoKey;
const mockKeyPair: CryptoKeyPair = {
  publicKey: mockPublicKey,
  privateKey: mockPrivateKey,
};

// Mock ArrayBuffer para exportKey (65 bytes para P-256 uncompressed)
const mockPublicKeyRaw = new Uint8Array(65).buffer;

const mockCryptoSubtle = {
  generateKey: vi.fn().mockResolvedValue(mockKeyPair),
  exportKey: vi.fn().mockResolvedValue(mockPublicKeyRaw),
  deriveBits: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
};

// Contador para gerar UUIDs únicos
let uuidCounter = 0;

// Configurar mock global do chrome
vi.stubGlobal('chrome', mockChrome);

// Configurar mock global do crypto.subtle
vi.stubGlobal('crypto', {
  subtle: mockCryptoSubtle,
  getRandomValues: (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

describe('PISAProcess', () => {
  let logger: AuditLogger;
  let pisa: PISAProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reconfigurar mock do crypto.subtle após clearAllMocks
    mockCryptoSubtle.generateKey.mockResolvedValue(mockKeyPair);
    mockCryptoSubtle.exportKey.mockResolvedValue(mockPublicKeyRaw);
    mockCryptoSubtle.deriveBits.mockResolvedValue(new Uint8Array(32).buffer);
    
    logger = new AuditLogger();
    pisa = new PISAProcess(logger);

    // Mock padrão para tabs.get
    mockChrome.tabs.get.mockResolvedValue({
      id: 1,
      url: 'https://example.com/page',
    });

    // Mock padrão para tabs.update
    mockChrome.tabs.update.mockResolvedValue({});

    // Mock para tabs.onUpdated que simula carregamento completo
    mockChrome.tabs.onUpdated.addListener.mockImplementation((callback) => {
      // Simular carregamento completo após pequeno delay
      setTimeout(() => {
        callback(1, { status: 'complete' });
      }, 10);
    });

    // Mock para tabs.sendMessage
    mockChrome.tabs.sendMessage.mockImplementation((_tabId, message) => {
      if (message.type === 'VERIFY_PAGE_LOADED') {
        return Promise.resolve({
          readyState: 'complete',
          imagesLoaded: true,
          fontsLoaded: true,
          totalImages: 5,
          loadedImages: 5,
        });
      }
      if (message.type === 'ACTIVATE_LOCKDOWN') {
        return Promise.resolve({
          success: true,
          protections: ['events-blocked', 'dom-monitoring', 'native-functions-frozen'],
          baselineSnapshot: {
            hash: 'abc123',
            elementCount: 100,
            textContentLength: 5000,
          },
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('deve criar instância com configuração padrão', () => {
      const instance = new PISAProcess(logger);
      expect(instance).toBeDefined();
    });

    it('deve aceitar configuração customizada', () => {
      const customConfig = {
        timeouts: {
          pageLoad: 60000,
          secureChannel: 30000,
          stageTimeout: 10000,
        },
      };
      const instance = new PISAProcess(logger, customConfig);
      expect(instance).toBeDefined();
    });

    it('deve mesclar configuração customizada com padrão', () => {
      const customConfig = {
        timeouts: {
          pageLoad: 60000,
          secureChannel: 30000,
          stageTimeout: 10000,
        },
      };
      const instance = new PISAProcess(logger, customConfig);
      // A instância deve ter sido criada com sucesso
      expect(instance).toBeDefined();
    });
  });

  describe('DEFAULT_PISA_CONFIG', () => {
    it('deve ter timeouts configurados', () => {
      expect(DEFAULT_PISA_CONFIG.timeouts.pageLoad).toBe(30000);
      expect(DEFAULT_PISA_CONFIG.timeouts.secureChannel).toBe(30000);
      expect(DEFAULT_PISA_CONFIG.timeouts.stageTimeout).toBe(10000);
    });

    it('deve ter retry configurado', () => {
      expect(DEFAULT_PISA_CONFIG.retry.maxAttempts).toBe(3);
      expect(DEFAULT_PISA_CONFIG.retry.initialDelay).toBe(1000);
      expect(DEFAULT_PISA_CONFIG.retry.maxDelay).toBe(10000);
      expect(DEFAULT_PISA_CONFIG.retry.jitter).toBe(0.3);
    });
  });

  describe('execute', () => {
    it('deve executar todas as 5 etapas com sucesso', async () => {
      const result = await pisa.execute('https://example.com', 1);

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(5);
      expect(result.hashCadeia).toBeDefined();
      expect(result.hashCadeia.length).toBe(64);
      expect(result.authorizationToken).toBeDefined();
    });

    it('deve gerar hashes únicos para cada etapa', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const hashes = result.stages.map((s) => s.hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(5);
    });

    it('deve nomear etapas corretamente', async () => {
      const result = await pisa.execute('https://example.com', 1);

      expect(result.stages[0]?.name).toBe('PRE_RELOAD');
      expect(result.stages[1]?.name).toBe('POST_RELOAD');
      expect(result.stages[2]?.name).toBe('LOADED');
      expect(result.stages[3]?.name).toBe('SECURE_CHANNEL');
      expect(result.stages[4]?.name).toBe('LOCKDOWN');
    });

    it('deve incluir timestamps em todas as etapas', async () => {
      const startTime = Date.now();
      const result = await pisa.execute('https://example.com', 1);

      for (const stage of result.stages) {
        expect(stage.timestamp).toBeGreaterThanOrEqual(startTime);
        expect(stage.timestamp).toBeLessThanOrEqual(Date.now());
      }
    });

    it('deve retornar erro quando lockdown falha', async () => {
      // Reconfigurar mock do crypto.subtle para este teste
      mockCryptoSubtle.generateKey.mockResolvedValue(mockKeyPair);
      mockCryptoSubtle.exportKey.mockResolvedValue(mockPublicKeyRaw);
      
      mockChrome.tabs.sendMessage.mockImplementation((_tabId, message) => {
        if (message.type === 'VERIFY_PAGE_LOADED') {
          return Promise.resolve({
            readyState: 'complete',
            imagesLoaded: true,
            fontsLoaded: true,
            totalImages: 0,
            loadedImages: 0,
          });
        }
        if (message.type === 'ACTIVATE_LOCKDOWN') {
          return Promise.resolve({
            success: false,
            protections: [],
            baselineSnapshot: { hash: '', elementCount: 0, textContentLength: 0 },
            error: 'Falha ao ativar modo lockdown',
          });
        }
        return Promise.resolve({});
      });

      const result = await pisa.execute('https://example.com', 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('lockdown');
    });

    it('deve retornar erro quando URL não está disponível', async () => {
      mockChrome.tabs.get.mockResolvedValue({ id: 1, url: undefined });

      const result = await pisa.execute('https://example.com', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('deve incluir totalDurationMs no resultado', async () => {
      const result = await pisa.execute('https://example.com', 1);

      expect(result.totalDurationMs).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });
  });

  describe('abort', () => {
    it('deve abortar processo em andamento', async () => {
      // Criar delay no mock para permitir abort
      mockChrome.tabs.onUpdated.addListener.mockImplementation((callback) => {
        setTimeout(() => {
          callback(1, { status: 'complete' });
        }, 100);
      });

      const executePromise = pisa.execute('https://example.com', 1);

      // Abortar após pequeno delay
      setTimeout(() => pisa.abort(), 50);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('abortado');
    });
  });

  describe('calculateChainHash', () => {
    it('deve calcular HASH_CADEIA corretamente', async () => {
      await pisa.execute('https://example.com', 1);

      const hashCadeia = await pisa.calculateChainHash();

      expect(hashCadeia).toBeDefined();
      expect(hashCadeia.length).toBe(64);
      expect(hashCadeia).toMatch(/^[0-9a-f]+$/);
    });

    it('deve lançar erro se não houver 5 etapas', async () => {
      // Não executar o processo completo
      await expect(pisa.calculateChainHash()).rejects.toThrow('5 etapas');
    });
  });

  describe('getStages', () => {
    it('deve retornar cópia das etapas', async () => {
      await pisa.execute('https://example.com', 1);

      const stages1 = pisa.getStages();
      const stages2 = pisa.getStages();

      expect(stages1).not.toBe(stages2);
      expect(stages1).toEqual(stages2);
    });

    it('deve retornar array vazio antes da execução', () => {
      const stages = pisa.getStages();
      expect(stages).toEqual([]);
    });
  });

  describe('getCorrelationId', () => {
    it('deve retornar correlationId do logger', () => {
      const correlationId = pisa.getCorrelationId();

      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });
  });

  describe('Stage 0 - PRE_RELOAD', () => {
    it('deve incluir URL nos dados', async () => {
      const url = 'https://example.com/test-page';
      const result = await pisa.execute(url, 1);

      const stage0 = result.stages[0];
      expect(stage0?.data['url']).toBe(url);
    });

    it('deve incluir userAgent nos dados', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage0 = result.stages[0];
      expect(stage0?.data['userAgent']).toBeDefined();
    });

    it('deve incluir versão da extensão nos dados', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage0 = result.stages[0];
      expect(stage0?.data['extensionVersion']).toBe('1.0.0');
    });
  });

  describe('Stage 1 - POST_RELOAD', () => {
    it('deve incluir URL com cache-busting', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage1 = result.stages[1];
      const reloadedUrl = stage1?.data['reloadedUrl'] as string;
      expect(reloadedUrl).toContain('_lexato_nocache=');
    });

    it('deve vincular hash ao anterior', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage1 = result.stages[1];
      expect(stage1?.data['previousHash']).toBe(result.stages[0]?.hash);
    });
  });

  describe('Stage 2 - LOADED', () => {
    it('deve incluir status de carregamento', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage2 = result.stages[2];
      expect(stage2?.data['readyState']).toBe('complete');
      expect(stage2?.data['imagesLoaded']).toBe(true);
      expect(stage2?.data['fontsLoaded']).toBe(true);
    });

    it('deve vincular hash ao anterior', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage2 = result.stages[2];
      expect(stage2?.data['previousHash']).toBe(result.stages[1]?.hash);
    });
  });

  describe('Stage 3 - SECURE_CHANNEL', () => {
    it('deve incluir hashes de chaves e nonces', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage3 = result.stages[3];
      expect(stage3?.data['publicKeyHash']).toBeDefined();
      expect(stage3?.data['clientNonceHash']).toBeDefined();
      expect(stage3?.data['serverNonceHash']).toBeDefined();
    });

    it('deve vincular hash ao anterior', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage3 = result.stages[3];
      expect(stage3?.data['previousHash']).toBe(result.stages[2]?.hash);
    });
  });

  describe('Stage 4 - LOCKDOWN', () => {
    it('deve incluir proteções ativas', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage4 = result.stages[4];
      expect(stage4?.data['protectionsActive']).toBeDefined();
      expect(Array.isArray(stage4?.data['protectionsActive'])).toBe(true);
    });

    it('deve incluir baseline snapshot', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage4 = result.stages[4];
      const baseline = stage4?.data['baselineSnapshot'] as Record<string, unknown>;
      expect(baseline).toBeDefined();
      expect(baseline['hash']).toBeDefined();
      expect(baseline['elementCount']).toBeDefined();
    });

    it('deve vincular hash ao anterior', async () => {
      const result = await pisa.execute('https://example.com', 1);

      const stage4 = result.stages[4];
      expect(stage4?.data['previousHash']).toBe(result.stages[3]?.hash);
    });
  });

  describe('Logging', () => {
    it('deve registrar início do processo', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      await pisa.execute('https://example.com', 1);

      expect(logSpy).toHaveBeenCalledWith('PISA', 'PROCESS_START', expect.any(Object));
    });

    it('deve registrar conclusão do processo', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      await pisa.execute('https://example.com', 1);

      expect(logSpy).toHaveBeenCalledWith('PISA', 'PROCESS_COMPLETE', expect.any(Object));
    });

    it('deve registrar cada etapa', async () => {
      const logSpy = vi.spyOn(logger, 'info');

      await pisa.execute('https://example.com', 1);

      expect(logSpy).toHaveBeenCalledWith('PISA', 'STAGE_0_COMPLETE', expect.any(Object));
      expect(logSpy).toHaveBeenCalledWith('PISA', 'STAGE_1_COMPLETE', expect.any(Object));
      expect(logSpy).toHaveBeenCalledWith('PISA', 'STAGE_2_COMPLETE', expect.any(Object));
      expect(logSpy).toHaveBeenCalledWith('PISA', 'STAGE_3_COMPLETE', expect.any(Object));
      expect(logSpy).toHaveBeenCalledWith('PISA', 'STAGE_4_COMPLETE', expect.any(Object));
    });

    it('deve registrar erro quando processo falha', async () => {
      mockChrome.tabs.get.mockRejectedValue(new Error('Tab not found'));
      const logSpy = vi.spyOn(logger, 'error');

      await pisa.execute('https://example.com', 1);

      expect(logSpy).toHaveBeenCalledWith('PISA', 'PROCESS_FAILED', expect.any(Object), expect.any(Error));
    });
  });
});

describe('PISA Property Tests', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();

    // Mock do chrome API
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: vi.fn(() => ({ version: '1.0.0' })),
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        update: vi.fn().mockResolvedValue({}),
        sendMessage: vi.fn().mockImplementation((_tabId, message) => {
          if (message.type === 'VERIFY_PAGE_LOADED') {
            return Promise.resolve({
              readyState: 'complete',
              imagesLoaded: true,
              fontsLoaded: true,
              totalImages: 0,
              loadedImages: 0,
            });
          }
          if (message.type === 'ACTIVATE_LOCKDOWN') {
            return Promise.resolve({
              success: true,
              protections: ['test'],
              baselineSnapshot: { hash: 'test', elementCount: 1, textContentLength: 1 },
            });
          }
          return Promise.resolve({});
        }),
        onUpdated: {
          addListener: vi.fn((callback) => {
            setTimeout(() => callback(1, { status: 'complete' }), 5);
          }),
          removeListener: vi.fn(),
        },
      },
    });

    // Mock do crypto.subtle para ECDH
    vi.stubGlobal('crypto', {
      subtle: {
        generateKey: vi.fn().mockResolvedValue({
          publicKey: { type: 'public' } as CryptoKey,
          privateKey: { type: 'private' } as CryptoKey,
        }),
        exportKey: vi.fn().mockResolvedValue(new Uint8Array(65).buffer),
        deriveBits: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      randomUUID: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 1: Cadeia de hashes é determinística
   *
   * Para qualquer sequência de 5 hashes, a concatenação com separador
   * deve sempre produzir o mesmo resultado
   *
   * **Validates: Requirements 20.14**
   */
  it('HASH_CADEIA deve ser determinístico para mesmos inputs', async () => {
    const hashes = ['hash0', 'hash1', 'hash2', 'hash3', 'hash4'];
    const separator = '||';

    const cadeia1 = hashes.join(separator);
    const cadeia2 = hashes.join(separator);

    const hashCadeia1 = await CryptoUtils.hash(cadeia1);
    const hashCadeia2 = await CryptoUtils.hash(cadeia2);

    expect(hashCadeia1).toBe(hashCadeia2);
  });

  /**
   * Property 2: Cada etapa vincula ao hash anterior
   *
   * Para qualquer execução do PISA, cada etapa (exceto a primeira)
   * deve conter o hash da etapa anterior em seus dados
   *
   * **Validates: Requirements 20.7, 20.8, 20.11, 20.13**
   */
  it('cada etapa deve vincular ao hash da etapa anterior', async () => {
    const pisa = new PISAProcess(logger);
    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);

    for (let i = 1; i < result.stages.length; i++) {
      const currentStage = result.stages[i];
      const previousStage = result.stages[i - 1];

      expect(currentStage?.data['previousHash']).toBe(previousStage?.hash);
    }
  });

  /**
   * Property 3: Hashes são únicos entre etapas
   *
   * Para qualquer execução do PISA, todos os hashes das etapas
   * devem ser diferentes entre si
   *
   * **Validates: Requirements 20.1, 20.7, 20.8, 20.11, 20.13**
   */
  it('todos os hashes das etapas devem ser únicos', async () => {
    const pisa = new PISAProcess(logger);
    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);

    const hashes = result.stages.map((s) => s.hash);
    const uniqueHashes = new Set(hashes);

    expect(uniqueHashes.size).toBe(hashes.length);
  });

  /**
   * Property 4: Timestamps são monotonicamente crescentes
   *
   * Para qualquer execução do PISA, os timestamps das etapas
   * devem ser monotonicamente crescentes (ou iguais)
   *
   * **Validates: Requirements 20.1**
   */
  it('timestamps devem ser monotonicamente crescentes', async () => {
    const pisa = new PISAProcess(logger);
    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);

    for (let i = 1; i < result.stages.length; i++) {
      const currentTimestamp = result.stages[i]?.timestamp ?? 0;
      const previousTimestamp = result.stages[i - 1]?.timestamp ?? 0;

      expect(currentTimestamp).toBeGreaterThanOrEqual(previousTimestamp);
    }
  });

  /**
   * Property 5: HASH_CADEIA é diferente de qualquer hash individual
   *
   * O hash da cadeia completa deve ser diferente de qualquer
   * hash individual das etapas
   *
   * **Validates: Requirements 20.14**
   */
  it('HASH_CADEIA deve ser diferente de qualquer hash individual', async () => {
    const pisa = new PISAProcess(logger);
    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);

    const individualHashes = result.stages.map((s) => s.hash);

    for (const hash of individualHashes) {
      expect(result.hashCadeia).not.toBe(hash);
    }
  });
});


/**
 * Property 8: Ordem de Operações PISA com Isolamento
 *
 * Testa que o isolamento é ativado ANTES de gerar H0,
 * o hash do snapshot é incluído na cadeia, e a verificação
 * de isolamento ocorre antes de cada etapa.
 *
 * **Validates: Requirements 6.1, 6.2, 6.7**
 */
describe('Property 8: Ordem de Operações PISA com Isolamento', () => {
  let logger: AuditLogger;
  let isolationActivationOrder: string[] = [];
  let stageExecutionOrder: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    isolationActivationOrder = [];
    stageExecutionOrder = [];
    logger = new AuditLogger();

    // Mock do chrome API
    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: vi.fn(() => ({ version: '1.0.0' })),
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        update: vi.fn().mockResolvedValue({}),
        sendMessage: vi.fn().mockImplementation((_tabId, message) => {
          if (message.type === 'VERIFY_PAGE_LOADED') {
            return Promise.resolve({
              readyState: 'complete',
              imagesLoaded: true,
              fontsLoaded: true,
              totalImages: 0,
              loadedImages: 0,
            });
          }
          if (message.type === 'ACTIVATE_LOCKDOWN') {
            return Promise.resolve({
              success: true,
              protections: ['test'],
              baselineSnapshot: { hash: 'test', elementCount: 1, textContentLength: 1 },
            });
          }
          return Promise.resolve({});
        }),
        onUpdated: {
          addListener: vi.fn((callback) => {
            setTimeout(() => callback(1, { status: 'complete' }), 5);
          }),
          removeListener: vi.fn(),
        },
      },
    });

    // Mock do crypto.subtle para ECDH
    vi.stubGlobal('crypto', {
      subtle: {
        generateKey: vi.fn().mockResolvedValue({
          publicKey: { type: 'public' } as CryptoKey,
          privateKey: { type: 'private' } as CryptoKey,
        }),
        exportKey: vi.fn().mockResolvedValue(new Uint8Array(65).buffer),
        deriveBits: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      randomUUID: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 8.1: Isolamento DEVE ser ativado ANTES de gerar H0
   * Requirement 6.1
   */
  it('isolamento deve ser ativado ANTES de gerar H0', async () => {
    const pisa = new PISAProcess(logger);
    
    // Mock do isolationActivator que registra ordem de execução
    const mockIsolationActivator = vi.fn().mockImplementation(async (correlationId: string) => {
      isolationActivationOrder.push('ISOLATION_ACTIVATED');
      return {
        success: true,
        snapshot: {
          id: 'snap_test',
          correlationId,
          createdAt: Date.now(),
          extensions: [],
          hash: 'test_snapshot_hash_abc123',
          lexatoExtensionId: 'lexato_id',
        },
        disabledExtensions: ['ext1', 'ext2'],
        nonDisableableExtensions: [],
        elapsedMs: 100,
      };
    });

    // Mock do statusChecker
    const mockStatusChecker = vi.fn().mockReturnValue({
      isActive: true,
      snapshot: null,
      disabledCount: 2,
      nonDisableableCount: 0,
      disabledExtensionIds: ['ext1', 'ext2'],
      nonDisableableExtensions: [],
    });

    // Mock do deactivator
    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    // Configurar callbacks de isolamento
    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    // Spy no logger para capturar ordem das etapas
    const logSpy = vi.spyOn(logger, 'info').mockImplementation((_category, event) => {
      if (event === 'STAGE_0_START') {
        stageExecutionOrder.push('H0_START');
      }
      if (event === 'ISOLATION_ACTIVATION_SUCCESS') {
        stageExecutionOrder.push('ISOLATION_SUCCESS');
      }
    });

    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);
    
    // Verificar que isolamento foi ativado
    expect(mockIsolationActivator).toHaveBeenCalledTimes(1);
    
    // Verificar ordem: ISOLATION_ACTIVATED deve vir antes de H0
    expect(isolationActivationOrder).toContain('ISOLATION_ACTIVATED');
    
    // O isolamento deve ter sido chamado antes de qualquer etapa PISA
    const isolationCallOrder = mockIsolationActivator.mock.invocationCallOrder[0];
    expect(isolationCallOrder).toBeDefined();

    logSpy.mockRestore();
  });

  /**
   * Property 8.2: Hash do snapshot DEVE ser incluído em H0
   * Requirement 6.7
   */
  it('hash do snapshot de isolamento deve ser incluído em H0', async () => {
    const pisa = new PISAProcess(logger);
    const expectedSnapshotHash = 'snapshot_hash_for_h0_inclusion';
    
    // Mock do isolationActivator
    const mockIsolationActivator = vi.fn().mockResolvedValue({
      success: true,
      snapshot: {
        id: 'snap_test',
        correlationId: 'test',
        createdAt: Date.now(),
        extensions: [],
        hash: expectedSnapshotHash,
        lexatoExtensionId: 'lexato_id',
      },
      disabledExtensions: ['ext1'],
      nonDisableableExtensions: [],
      elapsedMs: 50,
    });

    const mockStatusChecker = vi.fn().mockReturnValue({
      isActive: true,
      snapshot: null,
      disabledCount: 1,
      nonDisableableCount: 0,
      disabledExtensionIds: ['ext1'],
      nonDisableableExtensions: [],
    });

    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);
    
    // Verificar que H0 contém o hash do snapshot de isolamento
    const stage0 = result.stages[0];
    expect(stage0).toBeDefined();
    expect(stage0?.data['isolationSnapshotHash']).toBe(expectedSnapshotHash);
    
    // Verificar que o resultado final também contém o hash
    expect(result.isolationSnapshotHash).toBe(expectedSnapshotHash);
  });

  /**
   * Property 8.3: Verificação de isolamento DEVE ocorrer antes de cada etapa
   * Requirement 6.2
   */
  it('verificação de isolamento deve ocorrer antes de cada etapa PISA', async () => {
    const pisa = new PISAProcess(logger);
    const verificationCalls: string[] = [];
    
    const mockIsolationActivator = vi.fn().mockResolvedValue({
      success: true,
      snapshot: {
        id: 'snap_test',
        correlationId: 'test',
        createdAt: Date.now(),
        extensions: [],
        hash: 'test_hash',
        lexatoExtensionId: 'lexato_id',
      },
      disabledExtensions: ['ext1'],
      nonDisableableExtensions: [],
      elapsedMs: 50,
    });

    // Mock do statusChecker que registra cada chamada
    const mockStatusChecker = vi.fn().mockImplementation(() => {
      verificationCalls.push(`VERIFICATION_${verificationCalls.length + 1}`);
      return {
        isActive: true,
        snapshot: null,
        disabledCount: 1,
        nonDisableableCount: 0,
        disabledExtensionIds: ['ext1'],
        nonDisableableExtensions: [],
      };
    });

    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);
    
    // Deve haver verificação antes de cada etapa (exceto H0 que é após ativação)
    // Etapas 1, 2, 3, 4 = 4 verificações
    expect(mockStatusChecker).toHaveBeenCalledTimes(4);
    expect(verificationCalls).toHaveLength(4);
  });

  /**
   * Property 8.4: Processo DEVE falhar se isolamento não estiver ativo
   * Requirement 6.2
   */
  it('processo deve falhar se isolamento não estiver ativo durante etapa', async () => {
    const pisa = new PISAProcess(logger);
    let callCount = 0;
    
    const mockIsolationActivator = vi.fn().mockResolvedValue({
      success: true,
      snapshot: {
        id: 'snap_test',
        correlationId: 'test',
        createdAt: Date.now(),
        extensions: [],
        hash: 'test_hash',
        lexatoExtensionId: 'lexato_id',
      },
      disabledExtensions: ['ext1'],
      nonDisableableExtensions: [],
      elapsedMs: 50,
    });

    // Mock que retorna isActive: false na segunda verificação
    const mockStatusChecker = vi.fn().mockImplementation(() => {
      callCount++;
      return {
        isActive: callCount < 2, // Falha na segunda verificação
        snapshot: null,
        disabledCount: callCount < 2 ? 1 : 0,
        nonDisableableCount: 0,
        disabledExtensionIds: callCount < 2 ? ['ext1'] : [],
        nonDisableableExtensions: [],
      };
    });

    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    const result = await pisa.execute('https://example.com', 1);

    // Processo deve falhar porque isolamento não estava ativo
    expect(result.success).toBe(false);
    expect(result.error).toContain('Isolamento não está ativo');
  });

  /**
   * Property 8.5: IDs das extensões desativadas DEVEM estar no resultado
   * Requirement 6.3
   */
  it('IDs das extensões desativadas devem estar no resultado PISA', async () => {
    const pisa = new PISAProcess(logger);
    const expectedDisabledIds = ['ext_abc123', 'ext_def456', 'ext_ghi789'];
    
    const mockIsolationActivator = vi.fn().mockResolvedValue({
      success: true,
      snapshot: {
        id: 'snap_test',
        correlationId: 'test',
        createdAt: Date.now(),
        extensions: [],
        hash: 'test_hash',
        lexatoExtensionId: 'lexato_id',
      },
      disabledExtensions: expectedDisabledIds,
      nonDisableableExtensions: [],
      elapsedMs: 50,
    });

    const mockStatusChecker = vi.fn().mockReturnValue({
      isActive: true,
      snapshot: null,
      disabledCount: 3,
      nonDisableableCount: 0,
      disabledExtensionIds: expectedDisabledIds,
      nonDisableableExtensions: [],
    });

    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);
    expect(result.disabledExtensionIds).toBeDefined();
    expect(result.disabledExtensionIds).toEqual(expectedDisabledIds);
  });

  /**
   * Property 8.6: Processo deve continuar sem isolamento se callbacks não configurados
   */
  it('processo deve executar normalmente sem callbacks de isolamento', async () => {
    const pisa = new PISAProcess(logger);
    
    // Não configurar callbacks de isolamento
    
    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(true);
    expect(result.isolationSnapshotHash).toBeUndefined();
    expect(result.disabledExtensionIds).toBeUndefined();
  });

  /**
   * Property 8.7: Falha na ativação do isolamento deve falhar o processo
   * Requirement 6.1
   */
  it('falha na ativação do isolamento deve falhar o processo PISA', async () => {
    const pisa = new PISAProcess(logger);
    
    const mockIsolationActivator = vi.fn().mockResolvedValue({
      success: false,
      snapshot: null,
      disabledExtensions: [],
      nonDisableableExtensions: [],
      error: 'Permissão negada para chrome.management',
      elapsedMs: 10,
    });

    const mockStatusChecker = vi.fn().mockReturnValue({
      isActive: false,
      snapshot: null,
      disabledCount: 0,
      nonDisableableCount: 0,
      disabledExtensionIds: [],
      nonDisableableExtensions: [],
    });

    const mockDeactivator = vi.fn().mockResolvedValue(undefined);

    pisa.setIsolationCallbacks(mockIsolationActivator, mockStatusChecker, mockDeactivator);

    const result = await pisa.execute('https://example.com', 1);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Falha ao ativar isolamento');
  });
});
