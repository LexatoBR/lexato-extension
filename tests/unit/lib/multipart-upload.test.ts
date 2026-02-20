import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import MultipartUploadService from '../../../src/lib/multipart-upload';
import { APIClient } from '../../../src/background/api-client';

// Mock APIClient
const mockPost = vi.fn();
const mockAPIClient = {
  post: mockPost,
} as unknown as APIClient;

vi.mock('../../../src/background/api-client', () => ({
  getAPIClient: () => mockAPIClient,
}));

// Mock global fetch (usado para upload S3 em vez de axios)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock chrome.storage.local para saveState/loadState
const mockStorageData: Record<string, unknown> = {};
global.chrome = {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorageData[key] })),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        delete mockStorageData[key];
        return Promise.resolve();
      }),
    },
  },
} as unknown as typeof chrome;

/**
 * Cria um Blob mock com arrayBuffer() funcional para testes
 */
function createMockBlob(content: string): Blob {
  const blob = new Blob([content], { type: 'video/webm' });
  // Garante que arrayBuffer funciona no ambiente de teste
  if (!blob.arrayBuffer) {
    (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => {
      const encoder = new TextEncoder();
      return encoder.encode(content).buffer;
    };
  }
  return blob;
}

describe('MultipartUploadService', () => {
  let service: MultipartUploadService;
  const captureId = 'test-capture-id';
  const uploadId = 'test-upload-id';
  const s3Key = 'test-s3-key';

  beforeEach(() => {
    service = new MultipartUploadService();
    vi.clearAllMocks();
    // Limpa storage mock
    Object.keys(mockStorageData).forEach(key => delete mockStorageData[key]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initiate', () => {
    it('deve chamar API para iniciar upload', async () => {
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });

      const result = await service.initiate(captureId, 'STANDARD');

      expect(mockPost).toHaveBeenCalledWith(
        '/video/start',
        { captureId, storageType: 'STANDARD' },
        { authenticated: true }
      );
      expect(result).toEqual({ uploadId, captureId, s3Key });
      expect(service.getUploadId()).toBe(uploadId);
    });

    it('deve extrair dados de resposta nestada no initiate', async () => {
      // API retorna formato nestado: { success, data: { success, data: { ... } } }
      mockPost.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          data: { uploadId: 'nested-upload-id', captureId: 'nested-capture-id', s3Key: 'nested-s3-key' },
        },
      });

      const result = await service.initiate(captureId, 'STANDARD');

      expect(result).toEqual({
        uploadId: 'nested-upload-id',
        captureId: 'nested-capture-id',
        s3Key: 'nested-s3-key',
      });
      expect(service.getUploadId()).toBe('nested-upload-id');
    });

    it('deve lançar erro quando API falha', async () => {
      mockPost.mockResolvedValueOnce({
        success: false,
        error: 'Failed to start',
      });

      await expect(service.initiate(captureId, 'STANDARD')).rejects.toThrow('Failed to start');
    });

    it('deve lançar erro quando captureId está vazio', async () => {
      await expect(service.initiate('', 'STANDARD')).rejects.toThrow('ID da captura é obrigatório');
    });
  });

  describe('uploadPart', () => {
    it('deve obter presigned URL e fazer upload para S3 via fetch', async () => {
      // Setup state
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');
      mockPost.mockClear();

      const chunk = createMockBlob('test data');
      const partNumber = 1;
      const hash = 'hash-1';
      const presignedUrl = 'https://s3.example.com/upload';
      const checksumSha256 = 'QLl8R4i4+SaJlrl8ZIcutc5TbZtwt2NwB8lTXkd3GH0='; // base64 mock
      const etag = '"etag-1"';

      // Mock get presigned URL (agora retorna checksumSha256)
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { presignedUrl, checksumSha256 },
      });

      // Mock fetch para S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ etag }),
        text: () => Promise.resolve(''),
      });

      const result = await service.uploadPart(chunk, partNumber, hash);

      // Verifica requisição de Presigned URL (agora inclui checksumSha256)
      expect(mockPost).toHaveBeenCalledWith(
        '/video/chunk',
        expect.objectContaining({
          captureId,
          uploadId,
          partNumber,
          chunkHash: hash,
          checksumSha256: expect.any(String), // SHA-256 calculado pelo cliente
        }),
        { authenticated: true }
      );

      // Verifica chamada fetch para S3 com header SHA-256
      expect(mockFetch).toHaveBeenCalledWith(
        presignedUrl,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'video/webm',
            'x-amz-checksum-sha256': checksumSha256,
          }),
          body: chunk,
          credentials: 'omit',
          mode: 'cors',
        })
      );

      expect(result).toEqual({
        partNumber,
        etag: 'etag-1',
        attempts: 1,
      });
    });

    it('deve fazer retry em erro de rede', async () => {
      // Setup state
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');
      mockPost.mockClear();

      const chunk = createMockBlob('test data');
      const presignedUrl = 'https://s3.example.com/upload';
      const checksumSha256 = 'QLl8R4i4+SaJlrl8ZIcutc5TbZtwt2NwB8lTXkd3GH0=';
      const etag = '"etag-1"';

      // Mock presigned URL
      mockPost.mockResolvedValue({
        success: true,
        data: { presignedUrl, checksumSha256 },
      });

      // Primeiro fetch falha com erro de rede, segundo sucede
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ etag }),
          text: () => Promise.resolve(''),
        });

      const result = await service.uploadPart(chunk, 1, 'hash');

      expect(result.attempts).toBe(2);
      expect(result.etag).toBe('etag-1');
    });

    it('deve lançar erro quando upload não foi iniciado', async () => {
      const chunk = createMockBlob('test');
      await expect(service.uploadPart(chunk, 1, 'hash')).rejects.toThrow('Upload não foi iniciado');
    });

    it('deve lançar erro quando partNumber é inválido', async () => {
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');

      const chunk = createMockBlob('test');
      await expect(service.uploadPart(chunk, 0, 'hash')).rejects.toThrow('Número da part deve ser >= 1');
    });
  });

  describe('complete', () => {
    it('deve chamar API para completar upload', async () => {
      // Setup state
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');
      mockPost.mockClear();

      // Adiciona uma part via uploadPart (agora usa checksumSha256)
      const checksumSha256 = 'QLl8R4i4+SaJlrl8ZIcutc5TbZtwt2NwB8lTXkd3GH0=';
      mockPost.mockResolvedValueOnce({ 
        success: true, 
        data: { presignedUrl: 'https://s3.example.com/upload', checksumSha256 } 
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"etag-1"' }),
        text: () => Promise.resolve(''),
      });
      await service.uploadPart(createMockBlob('test'), 1, 'hash');
      mockPost.mockClear();

      mockPost.mockResolvedValueOnce({
        success: true,
        data: { url: 'final-url', s3Key },
      });

      const result = await service.complete();

      expect(mockPost).toHaveBeenCalledWith(
        '/video/complete',
        expect.objectContaining({
          captureId,
          uploadId,
          parts: [{ partNumber: 1, etag: 'etag-1' }]
        }),
        { authenticated: true }
      );
      expect(result.url).toBe('final-url');
    });

    it('deve extrair dados de resposta nestada no complete', async () => {
      // Setup state
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');
      mockPost.mockClear();

      // Adiciona uma part (agora usa checksumSha256)
      const checksumSha256 = 'QLl8R4i4+SaJlrl8ZIcutc5TbZtwt2NwB8lTXkd3GH0=';
      mockPost.mockResolvedValueOnce({ 
        success: true, 
        data: { presignedUrl: 'https://s3.example.com/upload', checksumSha256 } 
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"etag-1"' }),
        text: () => Promise.resolve(''),
      });
      await service.uploadPart(createMockBlob('test'), 1, 'hash');
      mockPost.mockClear();

      // API retorna formato nestado
      mockPost.mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          data: { url: 'nested-url', key: 'nested-key' },
        },
      });

      const result = await service.complete();

      expect(result.url).toBe('nested-url');
      expect(result.s3Key).toBe('nested-key');
    });

    it('deve lançar erro quando nenhuma part foi enviada', async () => {
      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');

      await expect(service.complete()).rejects.toThrow('Nenhuma part foi enviada');
    });
  });

  describe('getters', () => {
    it('deve retornar estado correto', async () => {
      expect(service.isInProgress()).toBe(false);
      expect(service.getUploadId()).toBeNull();
      expect(service.getS3Key()).toBeNull();
      expect(service.getPartsCount()).toBe(0);
      expect(service.getParts()).toEqual([]);

      mockPost.mockResolvedValueOnce({
        success: true,
        data: { uploadId, captureId, s3Key },
      });
      await service.initiate(captureId, 'STANDARD');

      expect(service.isInProgress()).toBe(true);
      expect(service.getUploadId()).toBe(uploadId);
      expect(service.getS3Key()).toBe(s3Key);
    });
  });
});
