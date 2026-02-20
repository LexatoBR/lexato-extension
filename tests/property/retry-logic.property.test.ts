/**
 * Property tests para Retry Logic
 *
 * Valida a propriedade de retry com backoff exponencial:
 * - Property 26: Retry on Upload Failure
 *
 * Para qualquer falha de upload de chunk, o ChunkUploader DEVE
 * tentar novamente até 3 vezes com backoff exponencial antes de
 * marcar como falha.
 *
 * @module retry-logic.property.test
 * @requirements 7.4

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { MultipartUploadService, MIN_PART_SIZE, MultipartUploadError } from '../../src/lib/multipart-upload';

// ============================================================================
// Mocks
// ============================================================================

// Mock do chrome.storage.local
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        delete mockStorage[key];
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});

// Mock do API client
const mockApiPost = vi.fn();
vi.mock('../../src/background/api-client', () => ({
  getAPIClient: () => ({
    post: mockApiPost,
  }),
}));

// Mock do crypto helper
vi.mock('../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularHashSHA256Base64: vi.fn().mockResolvedValue('mockHashBase64=='),
}));

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera número de falhas antes do sucesso (0 a 3)
 */
const failuresBeforeSuccessArbitrary = fc.integer({ min: 0, max: 2 });

/**
 * Gera número de falhas que excedem o limite (3+)
 */
const tooManyFailuresArbitrary = fc.integer({ min: 3, max: 5 });

/**
 * Gera tamanho de chunk válido (>= 5MB para disparar upload)
 */
const chunkSizeArbitrary = fc.integer({ min: MIN_PART_SIZE, max: MIN_PART_SIZE + 1024 * 1024 });

/**
 * Gera hash aleatório para chunks
 */
const hashArbitrary = fc.stringMatching(/^[a-f0-9]{64}$/).map((s) => s || 'a'.repeat(64));

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um Blob com tamanho específico
 */
function createBlobWithSize(size: number): Blob {
  const buffer = new ArrayBuffer(size);
  return new Blob([buffer], { type: 'video/webm' });
}

/**
 * Limpa todos os mocks
 */
function clearMocks(): void {
  vi.clearAllMocks();
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
}

/**
 * Configura mock da API para iniciar upload
 */
function setupInitiateMock(): void {
  mockApiPost.mockImplementation((endpoint: string) => {
    if (endpoint === '/video/start') {
      return Promise.resolve({
        success: true,
        data: {
          uploadId: 'test-upload-id',
          captureId: 'test-capture-id',
          s3Key: 'test-s3-key',
        },
      });
    }
    if (endpoint === '/video/chunk') {
      return Promise.resolve({
        success: true,
        data: {
          presignedUrl: 'https://s3.amazonaws.com/test-bucket/test-key?presigned=true',
          checksumSha256: 'mockHashBase64==',
        },
      });
    }
    return Promise.resolve({ success: true, data: {} });
  });
}

/**
 * Configura mock do fetch para falhar N vezes e depois ter sucesso
 */
function setupFetchWithFailures(failuresBeforeSuccess: number): { fetchCallCount: () => number } {
  let callCount = 0;
  
  global.fetch = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount <= failuresBeforeSuccess) {
      // Simula erro de rede recuperável
      return Promise.reject(new TypeError('Network error'));
    }
    // Sucesso após N falhas
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"test-etag"' }),
      text: () => Promise.resolve(''),
    });
  });
  
  return { fetchCallCount: () => callCount };
}

/**
 * Configura mock do fetch para sempre falhar
 */
function setupFetchAlwaysFails(): { fetchCallCount: () => number } {
  let callCount = 0;
  
  global.fetch = vi.fn().mockImplementation(() => {
    callCount++;
    return Promise.reject(new TypeError('Network error'));
  });
  
  return { fetchCallCount: () => callCount };
}

/**
 * Configura mock do fetch para falhar com erro HTTP 500
 */
function setupFetchWithServerError(failuresBeforeSuccess: number): { fetchCallCount: () => number } {
  let callCount = 0;
  
  global.fetch = vi.fn().mockImplementation(() => {
    callCount++;
    if (callCount <= failuresBeforeSuccess) {
      // Simula erro 500 (recuperável)
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('Internal Server Error'),
      });
    }
    // Sucesso após N falhas
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"test-etag"' }),
      text: () => Promise.resolve(''),
    });
  });
  
  return { fetchCallCount: () => callCount };
}

/**
 * Cria nova instância do serviço de upload com retry rápido para testes
 */
function createUploadService(): MultipartUploadService {
  return new MultipartUploadService({
    maxAttempts: 3,
    baseDelayMs: 10, // Delay curto para testes
    maxDelayMs: 50,
    backoffMultiplier: 2,
  });
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Retry Logic Properties', () => {
  beforeEach(() => {
    clearMocks();
    setupInitiateMock();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 26: Retry on Upload Failure
  // Feature: video-capture-redesign
  // Validates: Requirements 7.4
  // ==========================================================================

  describe('Property 26: Retry on Upload Failure', () => {
    /**
     * **Validates: Requirements 7.4**
     *
     * Para qualquer número de falhas menor que 3, o upload DEVE
     * ter sucesso após as retentativas.
     */
    it('DEVE ter sucesso após retentativas quando falhas < 3', async () => {
      await fc.assert(
        fc.asyncProperty(
          failuresBeforeSuccessArbitrary,
          chunkSizeArbitrary,
          hashArbitrary,
          async (failures, size, hash) => {
            const uploadService = createUploadService();
            const { fetchCallCount } = setupFetchWithFailures(failures);
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande para disparar upload
            const blob = createBlobWithSize(size);
            const result = await uploadService.addChunk(blob, hash);

            // Upload deve ter sucesso
            expect(result).not.toBeNull();
            expect(result?.partNumber).toBe(1);
            expect(result?.etag).toBeDefined();
            
            // Número de chamadas ao fetch deve ser failures + 1 (sucesso)
            expect(fetchCallCount()).toBe(failures + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * Para 3 ou mais falhas consecutivas, o upload DEVE falhar
     * com erro após esgotar as retentativas.
     */
    it('DEVE falhar após 3 tentativas sem sucesso', async () => {
      await fc.assert(
        fc.asyncProperty(
          tooManyFailuresArbitrary,
          chunkSizeArbitrary,
          hashArbitrary,
          async (_failures, size, hash) => {
            const uploadService = createUploadService();
            const { fetchCallCount } = setupFetchAlwaysFails();
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande para disparar upload
            const blob = createBlobWithSize(size);
            
            // Upload deve falhar após 3 tentativas
            await expect(uploadService.addChunk(blob, hash)).rejects.toThrow();
            
            // Deve ter tentado exatamente 3 vezes
            expect(fetchCallCount()).toBe(3);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * O retry deve funcionar para erros HTTP 500 (servidor).
     */
    it('DEVE fazer retry para erros HTTP 500', async () => {
      await fc.assert(
        fc.asyncProperty(
          failuresBeforeSuccessArbitrary,
          chunkSizeArbitrary,
          hashArbitrary,
          async (failures, size, hash) => {
            const uploadService = createUploadService();
            const { fetchCallCount } = setupFetchWithServerError(failures);
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande para disparar upload
            const blob = createBlobWithSize(size);
            const result = await uploadService.addChunk(blob, hash);

            // Upload deve ter sucesso após retries
            expect(result).not.toBeNull();
            expect(result?.partNumber).toBe(1);
            
            // Número de chamadas deve ser failures + 1
            expect(fetchCallCount()).toBe(failures + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * O número máximo de tentativas deve ser exatamente 3.
     */
    it('número máximo de tentativas deve ser 3', async () => {
      const uploadService = createUploadService();
      const { fetchCallCount } = setupFetchAlwaysFails();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk grande para disparar upload
      const blob = createBlobWithSize(MIN_PART_SIZE);
      
      // Upload deve falhar
      await expect(uploadService.addChunk(blob, 'hash')).rejects.toThrow();
      
      // Deve ter tentado exatamente 3 vezes
      expect(fetchCallCount()).toBe(3);
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * O erro lançado após esgotar retries deve ser MultipartUploadError.
     */
    it('DEVE lançar MultipartUploadError após esgotar retries', async () => {
      const uploadService = createUploadService();
      setupFetchAlwaysFails();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk grande para disparar upload
      const blob = createBlobWithSize(MIN_PART_SIZE);
      
      // Upload deve falhar com MultipartUploadError
      try {
        await uploadService.addChunk(blob, 'hash');
        expect.fail('Deveria ter lançado erro');
      } catch (error) {
        expect(error).toBeInstanceOf(MultipartUploadError);
        expect((error as MultipartUploadError).attempts).toBe(3);
        expect((error as MultipartUploadError).recoverable).toBe(false);
      }
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * O resultado do upload bem-sucedido deve incluir o número de tentativas.
     */
    it('resultado deve incluir número de tentativas', async () => {
      await fc.assert(
        fc.asyncProperty(
          failuresBeforeSuccessArbitrary,
          chunkSizeArbitrary,
          hashArbitrary,
          async (failures, size, hash) => {
            const uploadService = createUploadService();
            setupFetchWithFailures(failures);
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande para disparar upload
            const blob = createBlobWithSize(size);
            const result = await uploadService.addChunk(blob, hash);

            // Resultado deve incluir número de tentativas
            expect(result).not.toBeNull();
            expect(result?.attempts).toBe(failures + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.4**
     *
     * Para upload sem falhas, deve ter apenas 1 tentativa.
     */
    it('upload sem falhas deve ter apenas 1 tentativa', async () => {
      const uploadService = createUploadService();
      const { fetchCallCount } = setupFetchWithFailures(0);
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk grande para disparar upload
      const blob = createBlobWithSize(MIN_PART_SIZE);
      const result = await uploadService.addChunk(blob, 'hash');

      // Deve ter apenas 1 tentativa
      expect(result?.attempts).toBe(1);
      expect(fetchCallCount()).toBe(1);
    });
  });
});
