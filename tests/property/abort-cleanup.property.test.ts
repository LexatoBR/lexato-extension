/**
 * Property tests para Abort Cleanup
 *
 * Valida a propriedade de limpeza ao abortar upload:
 * - Property 28: Abort Cleanup on Cancel
 *
 * Para qualquer cancelamento de gravação, o serviço DEVE:
 * 1. Chamar AbortMultipartUpload na API
 * 2. Limpar o storage local
 * 3. Resetar o estado interno
 *
 * @module abort-cleanup.property.test
 * @requirements 7.7

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
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera ID de captura aleatório
 */
const captureIdArbitrary = fc.stringMatching(/^capture-[a-z0-9]{8}$/).map((s) => s || 'capture-default1');

/**
 * Gera ID de upload aleatório
 */
const uploadIdArbitrary = fc.stringMatching(/^upload-[a-z0-9]{16}$/).map((s) => s || 'upload-default12345');

/**
 * Gera tamanho de chunk grande (acima do threshold)
 */
const largeChunkSizeArbitrary = fc.integer({ min: MIN_PART_SIZE, max: MIN_PART_SIZE + 1024 * 1024 });

/**
 * Gera tamanho de chunk pequeno (abaixo do threshold)
 */
const smallChunkSizeArbitrary = fc.integer({ min: 1024, max: MIN_PART_SIZE - 1 });

/**
 * Gera número de chunks a adicionar
 */
// @ts-expect-error Arbitrário reservado para testes futuros
const _chunkCountArbitrary = fc.integer({ min: 0, max: 3 });

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
function setupSuccessfulUploadMocks(captureId: string, uploadId: string): { getCancelCalls: () => number } {
  let cancelCalls = 0;
  
  mockApiPost.mockImplementation((endpoint: string) => {
    if (endpoint === '/video/start') {
      return Promise.resolve({
        success: true,
        data: {
          uploadId,
          captureId,
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
    if (endpoint === '/video/cancel') {
      cancelCalls++;
      return Promise.resolve({ success: true, data: {} });
    }
    if (endpoint === '/video/complete') {
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
  
  return { getCancelCalls: () => cancelCalls };
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

describe('Abort Cleanup Properties', () => {
  beforeEach(() => {
    clearMocks();
  });

  afterEach(() => {
    clearMocks();
  });

  // ==========================================================================
  // Property 28: Abort Cleanup on Cancel
  // Feature: video-capture-redesign
  // Validates: Requirements 7.7
  // ==========================================================================

  describe('Property 28: Abort Cleanup on Cancel', () => {
    /**
     * **Validates: Requirements 7.7**
     *
     * Para qualquer upload em progresso, abort() DEVE chamar /video/cancel.
     */
    it('DEVE chamar /video/cancel ao abortar upload em progresso', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          async (captureId, uploadId) => {
            const uploadService = createUploadService();
            const { getCancelCalls } = setupSuccessfulUploadMocks(captureId, uploadId);
            
            // Inicia upload
            await uploadService.initiate(captureId, 'evidence');

            // Verifica que upload está em progresso
            expect(uploadService.isInProgress()).toBe(true);

            // Aborta upload
            await uploadService.abort();

            // Verifica que /video/cancel foi chamado
            expect(getCancelCalls()).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * Para qualquer upload em progresso, abort() DEVE limpar o storage.
     */
    it('DEVE limpar storage ao abortar', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          async (captureId, uploadId) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks(captureId, uploadId);
            
            // Inicia upload
            await uploadService.initiate(captureId, 'evidence');

            // Verifica que estado foi salvo no storage
            const storageKey = `upload_state_${captureId}`;
            expect(mockStorage[storageKey]).toBeDefined();

            // Aborta upload
            await uploadService.abort();

            // Verifica que storage foi limpo
            expect(mockStorage[storageKey]).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * Para qualquer upload em progresso, abort() DEVE resetar estado interno.
     */
    it('DEVE resetar estado interno ao abortar', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          largeChunkSizeArbitrary,
          async (captureId, uploadId, chunkSize) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks(captureId, uploadId);
            
            // Inicia upload
            await uploadService.initiate(captureId, 'evidence');

            // Adiciona chunk grande (dispara upload)
            const blob = createBlobWithSize(chunkSize);
            await uploadService.addChunk(blob, 'hash');

            // Verifica estado antes de abortar
            expect(uploadService.isInProgress()).toBe(true);
            expect(uploadService.getUploadId()).not.toBeNull();
            expect(uploadService.getPartsCount()).toBe(1);

            // Aborta upload
            await uploadService.abort();

            // Verifica que estado foi resetado
            expect(uploadService.isInProgress()).toBe(false);
            expect(uploadService.getUploadId()).toBeNull();
            expect(uploadService.getPartsCount()).toBe(0);
            expect(uploadService.getBufferCount()).toBe(0);
            expect(uploadService.getBufferSize()).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * abort() sem upload em progresso NÃO deve falhar.
     */
    it('DEVE ser seguro chamar abort() sem upload em progresso', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          async (captureId) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks(captureId, 'upload-id');
            
            // NÃO inicia upload

            // Verifica que não está em progresso
            expect(uploadService.isInProgress()).toBe(false);

            // abort() não deve lançar erro
            await expect(uploadService.abort()).resolves.toBeUndefined();

            // Estado deve continuar limpo
            expect(uploadService.isInProgress()).toBe(false);
            expect(uploadService.getUploadId()).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * abort() DEVE limpar buffer pendente.
     */
    it('DEVE limpar buffer pendente ao abortar', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          smallChunkSizeArbitrary,
          async (captureId, uploadId, chunkSize) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks(captureId, uploadId);
            
            // Inicia upload
            await uploadService.initiate(captureId, 'evidence');

            // Adiciona chunk pequeno (fica no buffer)
            const blob = createBlobWithSize(chunkSize);
            await uploadService.addChunk(blob, 'hash');

            // Verifica que há chunks no buffer
            expect(uploadService.getBufferCount()).toBe(1);
            expect(uploadService.getBufferSize()).toBe(chunkSize);

            // Aborta upload
            await uploadService.abort();

            // Verifica que buffer foi limpo
            expect(uploadService.getBufferCount()).toBe(0);
            expect(uploadService.getBufferSize()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * abort() DEVE funcionar mesmo se API falhar (best-effort).
     */
    it('DEVE completar abort mesmo se API falhar (best-effort)', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          async (captureId, uploadId) => {
            const uploadService = createUploadService();
            
            // Configura mock para falhar no cancel
            mockApiPost.mockImplementation((endpoint: string) => {
              if (endpoint === '/video/start') {
                return Promise.resolve({
                  success: true,
                  data: { uploadId, captureId, s3Key: 'test-s3-key' },
                });
              }
              if (endpoint === '/video/cancel') {
                return Promise.reject(new Error('Network error'));
              }
              return Promise.resolve({ success: true, data: {} });
            });
            
            // Inicia upload
            await uploadService.initiate(captureId, 'evidence');

            // Verifica que upload está em progresso
            expect(uploadService.isInProgress()).toBe(true);

            // abort() não deve lançar erro mesmo com falha na API
            await expect(uploadService.abort()).resolves.toBeUndefined();

            // Estado deve estar limpo mesmo com falha na API
            expect(uploadService.isInProgress()).toBe(false);
            expect(uploadService.getUploadId()).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Validates: Requirements 7.7**
     *
     * Após abort(), deve ser possível iniciar novo upload.
     */
    it('DEVE permitir novo upload após abort()', async () => {
      await fc.assert(
        fc.asyncProperty(
          captureIdArbitrary,
          uploadIdArbitrary,
          async (captureId, uploadId) => {
            const uploadService = createUploadService();
            setupSuccessfulUploadMocks(captureId, uploadId);
            
            // Primeiro upload
            await uploadService.initiate(captureId, 'evidence');
            expect(uploadService.isInProgress()).toBe(true);

            // Aborta
            await uploadService.abort();
            expect(uploadService.isInProgress()).toBe(false);

            // Novo upload deve funcionar
            const newCaptureId = `${captureId}-new`;
            setupSuccessfulUploadMocks(newCaptureId, `${uploadId}-new`);
            
            const result = await uploadService.initiate(newCaptureId, 'evidence');
            
            expect(uploadService.isInProgress()).toBe(true);
            expect(result.captureId).toBe(newCaptureId);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
