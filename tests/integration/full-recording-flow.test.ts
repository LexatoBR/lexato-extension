/**
 * Testes de Integração: Upload ↔ S3
 *
 * Testa o fluxo completo de multipart upload para S3, incluindo:
 * - Fluxo completo: CreateMultipartUpload → UploadPart → CompleteMultipartUpload
 * - Retry com falhas simuladas (até 3 tentativas com backoff exponencial)
 * - Abort cleanup (AbortMultipartUpload e limpeza de storage)
 *
 * @module full-recording-flow.test
 * @requirements 7.2, 7.4, 7.5, 7.6, 7.7

 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultipartUploadService,
  MIN_PART_SIZE,
  MultipartUploadError,
} from '../../src/lib/multipart-upload';
import type { UploadProgress, UploadStatus } from '../../src/sidepanel/types';

// ============================================================================
// Mocks
// ============================================================================

/**
 * Mock do chrome.storage.local para persistência de estado
 */
const mockStorage: Record<string, unknown> = {};
const mockStorageGet = vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] }));
const mockStorageSet = vi.fn((data: Record<string, unknown>) => {
  Object.assign(mockStorage, data);
  return Promise.resolve();
});
const mockStorageRemove = vi.fn((key: string) => {
  delete mockStorage[key];
  return Promise.resolve();
});

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});


/**
 * Mock do API client para simular chamadas à API backend
 */
const mockApiPost = vi.fn();
vi.mock('../../src/background/api-client', () => ({
  getAPIClient: () => ({
    post: mockApiPost,
  }),
}));

/**
 * Mock do crypto helper para cálculo de hash SHA-256
 */
vi.mock('../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularHashSHA256Base64: vi.fn().mockResolvedValue('mockHashBase64=='),
}));

// ============================================================================
// Tipos Auxiliares para Testes
// ============================================================================

/**
 * Configuração de mock S3 para simular respostas
 */
interface S3MockConfig {
  /** Número de falhas antes do sucesso (para retry tests) */
  failuresBeforeSuccess?: number;
  /** Se deve sempre falhar */
  alwaysFail?: boolean;
  /** Tipo de erro a simular */
  errorType?: 'network' | 'server-500' | 'client-400';
  /** Delay em ms para simular latência */
  delayMs?: number;
}

/**
 * Rastreador de chamadas S3
 */
interface S3CallTracker {
  uploadPartCalls: number;
  createMultipartCalls: number;
  completeMultipartCalls: number;
  abortMultipartCalls: number;
}

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Limpa todos os mocks e storage
 */
function clearAllMocks(): void {
  vi.clearAllMocks();
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
}

/**
 * Cria um Blob com tamanho específico
 * @param size - Tamanho em bytes
 */
function createBlobWithSize(size: number): Blob {
  const buffer = new ArrayBuffer(size);
  return new Blob([buffer], { type: 'video/webm' });
}

/**
 * Cria instância do serviço de upload com configuração de retry rápido
 */
function createUploadService(): MultipartUploadService {
  return new MultipartUploadService({
    maxAttempts: 3,
    baseDelayMs: 10, // Delay curto para testes
    maxDelayMs: 50,
    backoffMultiplier: 2,
  });
}


/**
 * Configura mocks da API para fluxo completo de multipart upload
 * @param captureId - ID da captura
 * @param uploadId - ID do upload multipart
 * @param config - Configuração de comportamento do mock
 */
function setupS3Mocks(
  captureId: string,
  uploadId: string,
  config: S3MockConfig = {}
): S3CallTracker {
  const tracker: S3CallTracker = {
    uploadPartCalls: 0,
    createMultipartCalls: 0,
    completeMultipartCalls: 0,
    abortMultipartCalls: 0,
  };

  mockApiPost.mockImplementation(async (endpoint: string) => {
    // Simula delay se configurado
    if (config.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, config.delayMs));
    }

    if (endpoint === '/video/start') {
      tracker.createMultipartCalls++;
      return {
        success: true,
        data: {
          uploadId,
          captureId,
          s3Key: `evidence/${captureId}/video.webm`,
        },
      };
    }

    if (endpoint === '/video/chunk') {
      return {
        success: true,
        data: {
          presignedUrl: `https://s3.amazonaws.com/test-evidence-bucket/${captureId}?partNumber=${tracker.uploadPartCalls + 1}&uploadId=${uploadId}`,
          checksumSha256: 'mockHashBase64==',
        },
      };
    }

    if (endpoint === '/video/complete') {
      tracker.completeMultipartCalls++;
      return {
        success: true,
        data: {
          url: `https://s3.amazonaws.com/test-evidence-bucket/${captureId}/video.webm`,
          s3Key: `evidence/${captureId}/video.webm`,
        },
      };
    }

    if (endpoint === '/video/cancel') {
      tracker.abortMultipartCalls++;
      return { success: true, data: {} };
    }

    return { success: true, data: {} };
  });

  // Configura mock do fetch para S3 (upload direto via presigned URL)
  setupFetchMock(config, tracker);

  return tracker;
}


/**
 * Configura mock do fetch para simular upload direto ao S3
 * @param config - Configuração de comportamento
 * @param tracker - Rastreador de chamadas
 */
function setupFetchMock(config: S3MockConfig, tracker: S3CallTracker): void {
  let failureCount = 0;

  global.fetch = vi.fn().mockImplementation(async () => {
    tracker.uploadPartCalls++;

    // Simula delay se configurado
    if (config.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, config.delayMs));
    }

    // Verifica se deve falhar
    if (config.alwaysFail) {
      return createErrorResponse(config.errorType || 'network');
    }

    if (config.failuresBeforeSuccess && failureCount < config.failuresBeforeSuccess) {
      failureCount++;
      return createErrorResponse(config.errorType || 'network');
    }

    // Sucesso
    return {
      ok: true,
      status: 200,
      headers: new Headers({ etag: `"etag-part-${tracker.uploadPartCalls}"` }),
      text: () => Promise.resolve(''),
    };
  });
}

/**
 * Cria resposta de erro baseada no tipo
 */
function createErrorResponse(errorType: string): Promise<Response> | never {
  switch (errorType) {
    case 'network':
      throw new TypeError('Network error: Failed to fetch');
    case 'server-500':
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve('Internal Server Error'),
      } as Response);
    case 'client-400':
      return Promise.resolve({
        ok: false,
        status: 400,
        headers: new Headers(),
        text: () => Promise.resolve('Bad Request'),
      } as Response);
    default:
      throw new TypeError('Network error');
  }
}


// ============================================================================
// Testes de Integração
// ============================================================================

describe('Integração Upload ↔ S3', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  // ==========================================================================
  // Fluxo Completo de Multipart Upload
  // ==========================================================================

  describe('Fluxo Completo de Multipart Upload', () => {
    /**
     * Testa o fluxo completo: CreateMultipartUpload → UploadPart → CompleteMultipartUpload
     * Requisitos 7.2, 7.5, 7.6
     */
    it('deve completar fluxo CreateMultipartUpload → UploadPart → CompleteMultipartUpload', async () => {
      const captureId = 'capture-test-001';
      const uploadId = 'upload-test-001';
      const tracker = setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      // 1. CreateMultipartUpload
      const initResult = await uploadService.initiate(captureId, 'evidence');
      expect(initResult.uploadId).toBe(uploadId);
      expect(initResult.captureId).toBe(captureId);
      expect(tracker.createMultipartCalls).toBe(1);

      // 2. UploadPart - Adiciona chunk de 5MB
      const chunk1 = createBlobWithSize(MIN_PART_SIZE);
      const result1 = await uploadService.addChunk(chunk1, 'hash1');
      expect(result1).not.toBeNull();
      expect(result1?.partNumber).toBe(1);
      expect(tracker.uploadPartCalls).toBe(1);

      // 3. UploadPart - Adiciona segundo chunk
      const chunk2 = createBlobWithSize(MIN_PART_SIZE);
      const result2 = await uploadService.addChunk(chunk2, 'hash2');
      expect(result2).not.toBeNull();
      expect(result2?.partNumber).toBe(2);
      expect(tracker.uploadPartCalls).toBe(2);

      // 4. CompleteMultipartUpload
      const completeResult = await uploadService.complete();
      expect(completeResult.totalParts).toBe(2);
      expect(completeResult.s3Key).toContain(captureId);
      expect(tracker.completeMultipartCalls).toBe(1);
    });

    /**
     * Testa upload com chunk final menor que 5MB
     * Requisito 7.5: Upload de chunks restantes ao parar
     */
    it('deve enviar chunk final menor que 5MB ao completar', async () => {
      const captureId = 'capture-final-chunk';
      const uploadId = 'upload-final-chunk';
      const tracker = setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Adiciona chunk grande (dispara upload)
      const chunk1 = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk1, 'hash1');
      expect(tracker.uploadPartCalls).toBe(1);

      // Adiciona chunk pequeno (fica no buffer)
      const smallChunk = createBlobWithSize(1024 * 1024); // 1MB
      await uploadService.addChunk(smallChunk, 'hash2');
      expect(tracker.uploadPartCalls).toBe(1); // Ainda não enviou

      // Complete deve enviar o buffer pendente
      const result = await uploadService.complete();
      expect(result.totalParts).toBe(2);
      expect(tracker.uploadPartCalls).toBe(2); // Agora enviou
      expect(tracker.completeMultipartCalls).toBe(1);
    });


    /**
     * Testa que múltiplos chunks pequenos são combinados antes do upload
     * Requisito 7.2: Upload ao atingir 5MB
     */
    it('deve combinar múltiplos chunks pequenos até atingir 5MB', async () => {
      const captureId = 'capture-combine';
      const uploadId = 'upload-combine';
      const tracker = setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Adiciona 5 chunks de 1MB cada
      const chunkSize = 1024 * 1024; // 1MB
      for (let i = 0; i < 4; i++) {
        const chunk = createBlobWithSize(chunkSize);
        await uploadService.addChunk(chunk, `hash${i}`);
        // Não deve ter enviado ainda (< 5MB)
        expect(tracker.uploadPartCalls).toBe(0);
      }

      // Quinto chunk atinge 5MB - deve disparar upload
      const chunk5 = createBlobWithSize(chunkSize);
      await uploadService.addChunk(chunk5, 'hash5');
      expect(tracker.uploadPartCalls).toBe(1);
    });

    /**
     * Testa persistência de estado no storage
     * Requisito 7.3: Backup em IndexedDB (chrome.storage.local)
     */
    it('deve persistir estado no storage durante upload', async () => {
      const captureId = 'capture-persist';
      const uploadId = 'upload-persist';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Verifica que estado foi salvo
      const storageKey = `upload_state_${captureId}`;
      expect(mockStorage[storageKey]).toBeDefined();
      expect((mockStorage[storageKey] as Record<string, unknown>)['uploadId']).toBe(uploadId);

      // Adiciona chunk
      const chunk = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk, 'hash');

      // Verifica que parts foram salvas
      const savedState = mockStorage[storageKey] as Record<string, unknown>;
      expect((savedState['parts'] as unknown[]).length).toBe(1);
    });

    /**
     * Testa rastreamento de progresso durante upload
     * Requisito 7.8: Exibir progresso no Side Panel
     */
    it('deve rastrear progresso de upload corretamente', async () => {
      const captureId = 'capture-progress';
      const uploadId = 'upload-progress';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      const progressUpdates: UploadProgress[] = [];
      uploadService.onProgress((progress) => {
        progressUpdates.push({ ...progress });
      });

      await uploadService.initiate(captureId, 'evidence');

      // Verifica status inicial
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]?.status).toBe('uploading');

      // Adiciona chunks
      const chunk1 = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk1, 'hash1');

      const chunk2 = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk2, 'hash2');

      // Verifica progresso
      const lastProgress = uploadService.getProgress();
      expect(lastProgress.chunksUploaded).toBe(2);
      expect(lastProgress.bytesUploaded).toBeGreaterThan(0);

      // Completa upload
      await uploadService.complete();

      // Verifica status final
      const finalProgress = uploadService.getProgress();
      expect(finalProgress.status).toBe('completed');
    });
  });


  // ==========================================================================
  // Retry com Falhas Simuladas
  // ==========================================================================

  describe('Retry com Falhas Simuladas', () => {
    /**
     * Testa retry com 1 falha antes do sucesso
     * Requisito 7.4: Retry até 3x com backoff exponencial
     */
    it('deve ter sucesso após 1 falha com retry', async () => {
      const captureId = 'capture-retry-1';
      const uploadId = 'upload-retry-1';
      const tracker = setupS3Mocks(captureId, uploadId, { failuresBeforeSuccess: 1 });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);
      const result = await uploadService.addChunk(chunk, 'hash');

      expect(result).not.toBeNull();
      expect(result?.partNumber).toBe(1);
      expect(result?.attempts).toBe(2); // 1 falha + 1 sucesso
      expect(tracker.uploadPartCalls).toBe(2);
    });

    /**
     * Testa retry com 2 falhas antes do sucesso
     * Requisito 7.4: Retry até 3x com backoff exponencial
     */
    it('deve ter sucesso após 2 falhas com retry', async () => {
      const captureId = 'capture-retry-2';
      const uploadId = 'upload-retry-2';
      const tracker = setupS3Mocks(captureId, uploadId, { failuresBeforeSuccess: 2 });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);
      const result = await uploadService.addChunk(chunk, 'hash');

      expect(result).not.toBeNull();
      expect(result?.partNumber).toBe(1);
      expect(result?.attempts).toBe(3); // 2 falhas + 1 sucesso
      expect(tracker.uploadPartCalls).toBe(3);
    });

    /**
     * Testa falha após esgotar todas as tentativas
     * Requisito 7.4: Máximo de 3 tentativas
     */
    it('deve falhar após 3 tentativas sem sucesso', async () => {
      const captureId = 'capture-fail';
      const uploadId = 'upload-fail';
      const tracker = setupS3Mocks(captureId, uploadId, { alwaysFail: true });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);

      await expect(uploadService.addChunk(chunk, 'hash')).rejects.toThrow(MultipartUploadError);
      expect(tracker.uploadPartCalls).toBe(3); // Exatamente 3 tentativas
    });

    /**
     * Testa retry com erro HTTP 500 (servidor)
     * Requisito 7.4: Erros recuperáveis devem fazer retry
     */
    it('deve fazer retry para erros HTTP 500', async () => {
      const captureId = 'capture-500';
      const uploadId = 'upload-500';
      const tracker = setupS3Mocks(captureId, uploadId, {
        failuresBeforeSuccess: 1,
        errorType: 'server-500',
      });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);
      const result = await uploadService.addChunk(chunk, 'hash');

      expect(result).not.toBeNull();
      expect(result?.attempts).toBe(2);
      expect(tracker.uploadPartCalls).toBe(2);
    });


    /**
     * Testa que erro lançado é MultipartUploadError com informações corretas
     * Requisito 7.4: Informar número de tentativas no erro
     */
    it('deve lançar MultipartUploadError com informações de tentativas', async () => {
      const captureId = 'capture-error-info';
      const uploadId = 'upload-error-info';
      setupS3Mocks(captureId, uploadId, { alwaysFail: true });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);

      try {
        await uploadService.addChunk(chunk, 'hash');
        expect.fail('Deveria ter lançado erro');
      } catch (error) {
        expect(error).toBeInstanceOf(MultipartUploadError);
        const uploadError = error as MultipartUploadError;
        expect(uploadError.attempts).toBe(3);
        expect(uploadError.recoverable).toBe(false);
        expect(uploadError.message).toContain('3 tentativas');
      }
    });

    /**
     * Testa que erro é lançado e upload permanece em estado de upload
     * Nota: O status 'failed' é definido apenas quando initiate() falha.
     * Quando um chunk falha, o erro é propagado para o chamador decidir.
     * Requisito 7.8: Status de upload
     */
    it('deve lançar erro quando chunk falha após todas as tentativas', async () => {
      const captureId = 'capture-status-fail';
      const uploadId = 'upload-status-fail';
      setupS3Mocks(captureId, uploadId, { alwaysFail: true });
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      const chunk = createBlobWithSize(MIN_PART_SIZE);

      // Deve lançar erro após esgotar tentativas
      await expect(uploadService.addChunk(chunk, 'hash')).rejects.toThrow(MultipartUploadError);

      // O upload ainda está em progresso (não foi abortado automaticamente)
      // O chamador deve decidir se aborta ou tenta novamente
      expect(uploadService.isInProgress()).toBe(true);
    });

    /**
     * Testa múltiplos uploads com retry em sequência
     */
    it('deve fazer retry independente para cada chunk', async () => {
      const captureId = 'capture-multi-retry';
      const uploadId = 'upload-multi-retry';
      let callCount = 0;

      // Mock customizado: primeiro chunk falha 1x, segundo chunk falha 2x
      mockApiPost.mockImplementation((endpoint: string) => {
        if (endpoint === '/video/start') {
          return Promise.resolve({
            success: true,
            data: { uploadId, captureId, s3Key: 'test-key' },
          });
        }
        if (endpoint === '/video/chunk') {
          return Promise.resolve({
            success: true,
            data: {
              presignedUrl: 'https://s3.amazonaws.com/test',
              checksumSha256: 'mockHash==',
            },
          });
        }
        return Promise.resolve({ success: true, data: {} });
      });

      let chunk1Attempts = 0;
      let chunk2Attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // Primeiro chunk: 1 falha, depois sucesso
          chunk1Attempts++;
          if (chunk1Attempts === 1) {
            return Promise.reject(new TypeError('Network error'));
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ etag: '"etag-1"' }),
            text: () => Promise.resolve(''),
          });
        } else {
          // Segundo chunk: 2 falhas, depois sucesso
          chunk2Attempts++;
          if (chunk2Attempts <= 2) {
            return Promise.reject(new TypeError('Network error'));
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ etag: '"etag-2"' }),
            text: () => Promise.resolve(''),
          });
        }
      });

      const uploadService = createUploadService();
      await uploadService.initiate(captureId, 'evidence');

      const chunk1 = createBlobWithSize(MIN_PART_SIZE);
      const result1 = await uploadService.addChunk(chunk1, 'hash1');
      expect(result1?.attempts).toBe(2);

      const chunk2 = createBlobWithSize(MIN_PART_SIZE);
      const result2 = await uploadService.addChunk(chunk2, 'hash2');
      expect(result2?.attempts).toBe(3);
    });
  });


  // ==========================================================================
  // Abort Cleanup
  // ==========================================================================

  describe('Abort Cleanup', () => {
    /**
     * Testa que AbortMultipartUpload é chamado ao cancelar
     * Requisito 7.7: Chamar AbortMultipartUpload ao cancelar
     */
    it('deve chamar AbortMultipartUpload ao abortar', async () => {
      const captureId = 'capture-abort';
      const uploadId = 'upload-abort';
      const tracker = setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Adiciona chunk
      const chunk = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk, 'hash');

      // Aborta
      await uploadService.abort();

      expect(tracker.abortMultipartCalls).toBe(1);
    });

    /**
     * Testa que storage é limpo ao abortar
     * Requisito 7.7: Limpar IndexedDB ao cancelar
     */
    it('deve limpar storage ao abortar', async () => {
      const captureId = 'capture-abort-storage';
      const uploadId = 'upload-abort-storage';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Verifica que estado foi salvo
      const storageKey = `upload_state_${captureId}`;
      expect(mockStorage[storageKey]).toBeDefined();

      // Aborta
      await uploadService.abort();

      // Verifica que storage foi limpo
      expect(mockStorage[storageKey]).toBeUndefined();
    });

    /**
     * Testa que estado interno é resetado ao abortar
     * Requisito 7.7: Resetar estado ao cancelar
     */
    it('deve resetar estado interno ao abortar', async () => {
      const captureId = 'capture-abort-state';
      const uploadId = 'upload-abort-state';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Adiciona chunks
      const chunk = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk, 'hash');

      // Verifica estado antes de abortar
      expect(uploadService.isInProgress()).toBe(true);
      expect(uploadService.getUploadId()).not.toBeNull();
      expect(uploadService.getPartsCount()).toBe(1);

      // Aborta
      await uploadService.abort();

      // Verifica que estado foi resetado
      expect(uploadService.isInProgress()).toBe(false);
      expect(uploadService.getUploadId()).toBeNull();
      expect(uploadService.getPartsCount()).toBe(0);
      expect(uploadService.getBufferCount()).toBe(0);
      expect(uploadService.getBufferSize()).toBe(0);
    });


    /**
     * Testa que buffer pendente é limpo ao abortar
     * Requisito 7.7: Limpar dados pendentes
     */
    it('deve limpar buffer pendente ao abortar', async () => {
      const captureId = 'capture-abort-buffer';
      const uploadId = 'upload-abort-buffer';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      await uploadService.initiate(captureId, 'evidence');

      // Adiciona chunk pequeno (fica no buffer)
      const smallChunk = createBlobWithSize(1024 * 1024); // 1MB
      await uploadService.addChunk(smallChunk, 'hash');

      // Verifica que há dados no buffer
      expect(uploadService.getBufferCount()).toBe(1);
      expect(uploadService.getBufferSize()).toBe(1024 * 1024);

      // Aborta
      await uploadService.abort();

      // Verifica que buffer foi limpo
      expect(uploadService.getBufferCount()).toBe(0);
      expect(uploadService.getBufferSize()).toBe(0);
    });

    /**
     * Testa que abort é seguro mesmo sem upload em progresso
     */
    it('deve ser seguro chamar abort sem upload em progresso', async () => {
      const uploadService = createUploadService();

      // Não deve lançar erro
      await expect(uploadService.abort()).resolves.toBeUndefined();

      // Estado deve continuar limpo
      expect(uploadService.isInProgress()).toBe(false);
      expect(uploadService.getUploadId()).toBeNull();
    });

    /**
     * Testa que abort funciona mesmo se API falhar (best-effort)
     * Requisito 7.7: Limpeza deve ocorrer mesmo com falha na API
     */
    it('deve completar abort mesmo se API falhar (best-effort)', async () => {
      const captureId = 'capture-abort-fail';
      const uploadId = 'upload-abort-fail';

      // Configura mock para falhar no cancel
      mockApiPost.mockImplementation((endpoint: string) => {
        if (endpoint === '/video/start') {
          return Promise.resolve({
            success: true,
            data: { uploadId, captureId, s3Key: 'test-key' },
          });
        }
        if (endpoint === '/video/cancel') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ success: true, data: {} });
      });

      const uploadService = createUploadService();
      await uploadService.initiate(captureId, 'evidence');

      // Verifica que upload está em progresso
      expect(uploadService.isInProgress()).toBe(true);

      // abort() não deve lançar erro mesmo com falha na API
      await expect(uploadService.abort()).resolves.toBeUndefined();

      // Estado deve estar limpo mesmo com falha na API
      expect(uploadService.isInProgress()).toBe(false);
      expect(uploadService.getUploadId()).toBeNull();
    });

    /**
     * Testa que é possível iniciar novo upload após abort
     */
    it('deve permitir novo upload após abort', async () => {
      const captureId1 = 'capture-first';
      const uploadId1 = 'upload-first';
      setupS3Mocks(captureId1, uploadId1);
      const uploadService = createUploadService();

      // Primeiro upload
      await uploadService.initiate(captureId1, 'evidence');
      expect(uploadService.isInProgress()).toBe(true);

      // Aborta
      await uploadService.abort();
      expect(uploadService.isInProgress()).toBe(false);

      // Novo upload
      const captureId2 = 'capture-second';
      const uploadId2 = 'upload-second';
      setupS3Mocks(captureId2, uploadId2);

      const result = await uploadService.initiate(captureId2, 'evidence');
      expect(uploadService.isInProgress()).toBe(true);
      expect(result.captureId).toBe(captureId2);
    });
  });


  // ==========================================================================
  // Cenários de Integração Completa
  // ==========================================================================

  describe('Cenários de Integração Completa', () => {
    /**
     * Testa fluxo completo de gravação com múltiplos chunks e retry
     */
    it('deve completar gravação com múltiplos chunks e retry ocasional', async () => {
      const captureId = 'capture-full-flow';
      const uploadId = 'upload-full-flow';
      let uploadAttempts = 0;

      // Mock que falha ocasionalmente
      mockApiPost.mockImplementation((endpoint: string) => {
        if (endpoint === '/video/start') {
          return Promise.resolve({
            success: true,
            data: { uploadId, captureId, s3Key: 'test-key' },
          });
        }
        if (endpoint === '/video/chunk') {
          return Promise.resolve({
            success: true,
            data: {
              presignedUrl: 'https://s3.amazonaws.com/test',
              checksumSha256: 'mockHash==',
            },
          });
        }
        if (endpoint === '/video/complete') {
          return Promise.resolve({
            success: true,
            data: { url: 'https://s3.amazonaws.com/test', s3Key: 'test-key' },
          });
        }
        return Promise.resolve({ success: true, data: {} });
      });

      // Fetch que falha no segundo chunk (primeira tentativa)
      global.fetch = vi.fn().mockImplementation(() => {
        uploadAttempts++;
        // Falha na primeira tentativa do segundo chunk
        if (uploadAttempts === 2) {
          return Promise.reject(new TypeError('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ etag: `"etag-${uploadAttempts}"` }),
          text: () => Promise.resolve(''),
        });
      });

      const uploadService = createUploadService();
      const progressUpdates: UploadProgress[] = [];
      uploadService.onProgress((p) => progressUpdates.push({ ...p }));

      // Inicia upload
      await uploadService.initiate(captureId, 'evidence');

      // Adiciona 3 chunks de 5MB
      for (let i = 0; i < 3; i++) {
        const chunk = createBlobWithSize(MIN_PART_SIZE);
        await uploadService.addChunk(chunk, `hash${i}`);
      }

      // Completa
      const result = await uploadService.complete();

      expect(result.totalParts).toBe(3);
      expect(uploadAttempts).toBe(4); // 1 + 2 (retry) + 1 = 4
      expect(progressUpdates.some((p) => p.status === 'completed')).toBe(true);
    });

    /**
     * Testa recuperação de estado após reinício
     */
    it('deve recuperar estado de upload após reinício', async () => {
      const captureId = 'capture-recover';
      const uploadId = 'upload-recover';
      setupS3Mocks(captureId, uploadId);

      // Primeira instância - inicia e adiciona chunk
      const uploadService1 = createUploadService();
      await uploadService1.initiate(captureId, 'evidence');
      const chunk = createBlobWithSize(MIN_PART_SIZE);
      await uploadService1.addChunk(chunk, 'hash');

      // Verifica estado salvo
      const storageKey = `upload_state_${captureId}`;
      expect(mockStorage[storageKey]).toBeDefined();

      // Segunda instância - carrega estado
      const uploadService2 = createUploadService();
      const loaded = await uploadService2.loadState(captureId);

      expect(loaded).toBe(true);
      expect(uploadService2.getUploadId()).toBe(uploadId);
      expect(uploadService2.getPartsCount()).toBe(1);
    });

    /**
     * Testa que progresso é notificado em todas as etapas
     */
    it('deve notificar progresso em todas as etapas do upload', async () => {
      const captureId = 'capture-progress-all';
      const uploadId = 'upload-progress-all';
      setupS3Mocks(captureId, uploadId);
      const uploadService = createUploadService();

      const statusHistory: UploadStatus[] = [];
      uploadService.onProgress((p) => {
        if (!statusHistory.includes(p.status)) {
          statusHistory.push(p.status);
        }
      });

      // Fluxo completo
      await uploadService.initiate(captureId, 'evidence');
      const chunk = createBlobWithSize(MIN_PART_SIZE);
      await uploadService.addChunk(chunk, 'hash');
      await uploadService.complete();

      // Verifica que passou por todos os status
      expect(statusHistory).toContain('uploading');
      expect(statusHistory).toContain('completing');
      expect(statusHistory).toContain('completed');
    });
  });
});
