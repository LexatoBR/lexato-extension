/**
 * Property tests para Final Chunk Upload
 *
 * Valida a propriedade de upload de chunks finais ao parar gravação:
 * - Property 27: Final Chunk Upload on Stop
 *
 * Para qualquer evento de parada de gravação, todos os chunks
 * restantes no buffer DEVEM ser enviados antes de chamar
 * CompleteMultipartUpload.
 *
 * @module final-chunk-upload.property.test
 * @requirements 7.5, 7.6

 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { MultipartUploadService, MIN_PART_SIZE } from '../../src/lib/multipart-upload';

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
// Tipos para Testes
// ============================================================================

/**
 * Configuração de chunk para testes
 */
interface ChunkConfig {
  /** Tamanho do chunk em bytes */
  size: number;
  /** Hash do chunk */
  hash: string;
}

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera tamanho de chunk pequeno (abaixo do threshold)
 */
const smallChunkSizeArbitrary = fc.integer({ min: 1024, max: MIN_PART_SIZE - 1 });

/**
 * Gera tamanho de chunk grande (acima do threshold)
 */
const largeChunkSizeArbitrary = fc.integer({ min: MIN_PART_SIZE, max: MIN_PART_SIZE + 1024 * 1024 });

/**
 * Gera hash aleatório para chunks
 */
const hashArbitrary = fc.stringMatching(/^[a-f0-9]{64}$/).map((s) => s || 'a'.repeat(64));

/**
 * Gera configuração de chunk pequeno
 */
const smallChunkArbitrary: fc.Arbitrary<ChunkConfig> = fc.record({
  size: smallChunkSizeArbitrary,
  hash: hashArbitrary,
});

/**
 * Gera lista de chunks pequenos (que ficam no buffer)
 */
const pendingChunksArbitrary = fc.array(smallChunkArbitrary, { minLength: 1, maxLength: 5 })
  .filter((chunks) => {
    const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
    return totalSize < MIN_PART_SIZE; // Garante que não dispara upload automático
  });

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
 * Configura mocks para simular upload bem-sucedido
 */
function setupSuccessfulUploadMocks(): { getCompleteCalls: () => number } {
  let completeCalls = 0;
  
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
    if (endpoint === '/video/complete') {
      completeCalls++;
      return Promise.resolve({
        success: true,
        data: {
          url: 'https://s3.amazonaws.com/test-bucket/test-key',
          s3Key: 'test-s3-key',
        },
      });
    }
    return Promise.resolve({ success: true, data: {} });
  });

  // Mock do fetch para S3
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ etag: '"test-etag"' }),
    text: () => Promise.resolve(''),
  });
  
  return { getCompleteCalls: () => completeCalls };
}

/**
 * Cria nova instância do serviço de upload
 */
function createUploadService(): MultipartUploadService {
  return new MultipartUploadService({
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 50,
    backoffMultiplier: 2,
  });
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Final Chunk Upload Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 27: Final Chunk Upload on Stop
  // Feature: video-capture-redesign
  // Validates: Requirements 7.5, 7.6
  // ==========================================================================

  describe('Property 27: Final Chunk Upload on Stop', () => {
    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * Para qualquer conjunto de chunks pendentes no buffer,
     * complete() DEVE enviar todos antes de finalizar.
     */
    it('DEVE enviar chunks pendentes antes de completar', async () => {
      await fc.assert(
        fc.asyncProperty(
          pendingChunksArbitrary,
          async (chunks) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks();
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunks pequenos (ficam no buffer)
            for (const chunk of chunks) {
              const blob = createBlobWithSize(chunk.size);
              await uploadService.addChunk(blob, chunk.hash);
            }

            // Verifica que chunks estão no buffer
            expect(uploadService.getBufferCount()).toBe(chunks.length);
            expect(uploadService.getPartsCount()).toBe(0);

            // Completa upload
            const result = await uploadService.complete();

            // Deve ter enviado os chunks pendentes
            expect(uploadService.getPartsCount()).toBe(1);
            expect(result.totalParts).toBe(1);
            
            // Buffer deve estar vazio
            expect(uploadService.getBufferCount()).toBe(0);
            expect(uploadService.getBufferSize()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * Para upload com chunks já enviados + chunks pendentes,
     * complete() DEVE enviar os pendentes e incluir todos no resultado.
     */
    it('DEVE incluir chunks já enviados + pendentes no resultado', async () => {
      await fc.assert(
        fc.asyncProperty(
          largeChunkSizeArbitrary,
          pendingChunksArbitrary,
          async (largeSize, pendingChunks) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks();
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande (dispara upload imediato)
            const largeBlob = createBlobWithSize(largeSize);
            await uploadService.addChunk(largeBlob, 'large-hash');
            
            // Verifica que 1 part foi enviada
            expect(uploadService.getPartsCount()).toBe(1);

            // Adiciona chunks pequenos (ficam no buffer)
            for (const chunk of pendingChunks) {
              const blob = createBlobWithSize(chunk.size);
              await uploadService.addChunk(blob, chunk.hash);
            }

            // Verifica que chunks estão no buffer
            expect(uploadService.getBufferCount()).toBe(pendingChunks.length);

            // Completa upload
            const result = await uploadService.complete();

            // Deve ter 2 parts: 1 já enviada + 1 dos pendentes
            expect(result.totalParts).toBe(2);
            
            // Buffer deve estar vazio
            expect(uploadService.getBufferCount()).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * Para upload sem chunks pendentes, complete() DEVE funcionar normalmente.
     */
    it('DEVE completar normalmente sem chunks pendentes', async () => {
      await fc.assert(
        fc.asyncProperty(
          largeChunkSizeArbitrary,
          hashArbitrary,
          async (size, hash) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks();
            
            // Inicia upload
            await uploadService.initiate('test-capture', 'evidence');

            // Adiciona chunk grande (dispara upload imediato)
            const blob = createBlobWithSize(size);
            await uploadService.addChunk(blob, hash);
            
            // Verifica que não há chunks pendentes
            expect(uploadService.getBufferCount()).toBe(0);
            expect(uploadService.getPartsCount()).toBe(1);

            // Completa upload
            const result = await uploadService.complete();

            // Deve ter apenas 1 part
            expect(result.totalParts).toBe(1);
            expect(result.url).toBeDefined();
            expect(result.s3Key).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * O resultado de complete() DEVE incluir URL e s3Key.
     */
    it('resultado de complete() DEVE incluir URL e s3Key', async () => {
      const uploadService = createUploadService();
      setupSuccessfulUploadMocks();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk
      const blob = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(blob, 'hash');

      // Completa upload
      const result = await uploadService.complete();

      // Verifica resultado
      expect(result.url).toBe('https://s3.amazonaws.com/test-bucket/test-key');
      expect(result.s3Key).toBe('test-s3-key');
      expect(result.totalParts).toBeGreaterThanOrEqual(1);
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * complete() DEVE chamar a API /video/complete exatamente uma vez.
     */
    it('DEVE chamar /video/complete exatamente uma vez', async () => {
      const uploadService = createUploadService();
      const { getCompleteCalls } = setupSuccessfulUploadMocks();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk
      const blob = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(blob, 'hash');

      // Completa upload
      await uploadService.complete();

      // Verifica que /video/complete foi chamado uma vez
      expect(getCompleteCalls()).toBe(1);
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * complete() DEVE limpar o estado após sucesso.
     */
    it('DEVE limpar estado após complete() bem-sucedido', async () => {
      const uploadService = createUploadService();
      setupSuccessfulUploadMocks();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // Adiciona chunk
      const blob = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(blob, 'hash');

      // Verifica estado antes de completar
      expect(uploadService.isInProgress()).toBe(true);
      expect(uploadService.getUploadId()).not.toBeNull();

      // Completa upload
      await uploadService.complete();

      // Estado deve estar limpo (storage limpo)
      // Nota: O serviço não reseta internamente após complete,
      // mas o storage é limpo
      const storageKey = 'upload_state_test-capture-id';
      expect(mockStorage[storageKey]).toBeUndefined();
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * complete() sem nenhuma part enviada DEVE falhar.
     */
    it('DEVE falhar se nenhuma part foi enviada', async () => {
      const uploadService = createUploadService();
      setupSuccessfulUploadMocks();
      
      // Inicia upload
      await uploadService.initiate('test-capture', 'evidence');

      // NÃO adiciona nenhum chunk

      // complete() deve falhar
      await expect(uploadService.complete()).rejects.toThrow('Nenhuma part foi enviada');
    });

    /**
     * **Validates: Requirements 7.5, 7.6**
     *
     * complete() sem iniciar upload DEVE falhar.
     */
    it('DEVE falhar se upload não foi iniciado', async () => {
      const uploadService = createUploadService();
      setupSuccessfulUploadMocks();
      
      // NÃO inicia upload

      // complete() deve falhar
      await expect(uploadService.complete()).rejects.toThrow('Upload não foi iniciado');
    });
  });
});
