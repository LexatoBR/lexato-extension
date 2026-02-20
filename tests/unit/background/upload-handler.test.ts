/**
 * Testes unitários para o UploadHandler da Extensão Chrome Lexato
 *
 * Testa upload de arquivos para S3, retry automático, progresso e notificação
 * 
 * NOTA: Service Workers (Manifest V3) usam fetch ao invés de XMLHttpRequest.
 * Estes testes mockam a API fetch para simular uploads.
 *
 * Requisitos testados:
 * - 11.1: Solicitar presigned URL ao backend
 * - 11.2: Enviar tipo de arquivo e tamanho na solicitação
 * - 11.3: Enviar storage_type na solicitação
 * - 11.4: Upload via PUT para presigned URL
 * - 11.5: Content-Type correto no upload
 * - 11.6: Exibir progresso na UI
 * - 11.7: Retry automático (máximo 3 tentativas)
 * - 11.8: Notificar backend após upload
 * - 11.9: Permitir retry manual após falhas
 *
 * @module UploadHandlerTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UploadHandler,
  createUploadHandler,
  type UploadHandlerConfig,
  type UploadFile,
  type UploadProgress,
  type UploadCompleteNotification,
} from '../../../src/background/upload-handler';
import { LexatoError } from '../../../src/lib/errors';
import type { StorageType } from '../../../src/types/capture.types';

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

// Mock do fetch global
const mockFetch = vi.fn();

// Salvar referência original do fetch
const originalFetch = global.fetch;

beforeEach(() => {
  // Substituir fetch global pelo mock
  global.fetch = mockFetch;
  mockFetch.mockClear();
  
  // Configurar resposta padrão de sucesso para upload S3
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(''),
  });
});

afterEach(() => {
  // Restaurar fetch original
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('UploadHandler', () => {
  let mockApiClient: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let config: UploadHandlerConfig;

  const mockPresignedUrlResponse = {
    evidenceId: 'test-evidence-id',
    uploadUrl: 'https://s3.amazonaws.com/bucket/key?signature=xxx',
    downloadUrl: 'https://cdn.lexato.com.br/bucket/key',
    bucket: 'test-evidence-bucket',
    key: 'evidences/test-evidence-id/original.png',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    expiresInSeconds: 900,
    conditions: {
      contentType: 'image/png',
      maxContentLength: 52428800,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: mockPresignedUrlResponse,
      }),
      get: vi.fn(),
    };

    config = {
      apiClient: mockApiClient as unknown as UploadHandlerConfig['apiClient'],
      maxRetries: 3,
      uploadTimeout: 120000,
    };
  });

  describe('Construtor e Configuração', () => {
    it('deve criar instância com configuração correta', () => {
      const handler = new UploadHandler(config);

      expect(handler).toBeDefined();
      expect(handler.getMaxRetries()).toBe(3);
      expect(handler.getUploadTimeout()).toBe(120000);
    });

    it('deve usar valores padrão quando não especificados', () => {
      const minimalConfig: UploadHandlerConfig = {
        apiClient: mockApiClient as unknown as UploadHandlerConfig['apiClient'],
      };

      const handler = new UploadHandler(minimalConfig);

      expect(handler.getMaxRetries()).toBe(3);
      expect(handler.getUploadTimeout()).toBe(120000);
    });

    it('deve criar instância via factory function', () => {
      const handler = createUploadHandler(config);

      expect(handler).toBeInstanceOf(UploadHandler);
    });
  });


  describe('requestPresignedUrl (Requisito 11.1, 11.2, 11.3)', () => {
    it('deve solicitar presigned URL com parâmetros corretos', async () => {
      const handler = new UploadHandler(config);

      const result = await handler.requestPresignedUrl({
        fileType: 'screenshot',
        fileSize: 1024000,
        storageType: 'premium_5y',
        captureId: 'test-capture-id',
        contentType: 'image/png',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/upload/presign',
        expect.objectContaining({
          contentType: 'image/png',
          contentLength: 1024000,
          storageType: 'premium_5y',
        })
      );

      expect(result.uploadUrl).toBe(mockPresignedUrlResponse.uploadUrl);
    });

    it('deve normalizar contentType removendo charset', async () => {
      const handler = new UploadHandler(config);

      await handler.requestPresignedUrl({
        fileType: 'html',
        fileSize: 5000,
        storageType: 'standard',
        captureId: 'test-capture-id',
        contentType: 'text/html; charset=utf-8',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/upload/presign',
        expect.objectContaining({
          contentType: 'text/html',
        })
      );
    });

    it('deve lançar erro quando API falha', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Erro interno do servidor',
      });

      const handler = new UploadHandler(config);

      await expect(
        handler.requestPresignedUrl({
          fileType: 'screenshot',
          fileSize: 1024000,
          storageType: 'standard',
          captureId: 'test-capture-id',
          contentType: 'image/png',
        })
      ).rejects.toThrow(LexatoError);
    });

    it('deve lançar erro quando API retorna dados vazios', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: null,
      });

      const handler = new UploadHandler(config);

      await expect(
        handler.requestPresignedUrl({
          fileType: 'screenshot',
          fileSize: 1024000,
          storageType: 'standard',
          captureId: 'test-capture-id',
          contentType: 'image/png',
        })
      ).rejects.toThrow(LexatoError);
    });
  });


  describe('uploadFile com fetch (Requisito 11.4, 11.5, 11.6, 11.7)', () => {
    it('deve fazer upload com Content-Type correto via fetch (Requisito 11.5)', async () => {
      const handler = new UploadHandler(config);

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test'], { type: 'image/png' }),
        contentType: 'image/png',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      // Verificar que fetch foi chamado com Content-Type correto
      expect(mockFetch).toHaveBeenCalledWith(
        mockPresignedUrlResponse.uploadUrl,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'image/png',
          }),
        })
      );

      expect(result.success).toBe(true);
      expect(result.fileType).toBe('screenshot');
    });

    it('deve chamar callback de progresso (Requisito 11.6)', async () => {
      const handler = new UploadHandler(config);
      const progressCallback = vi.fn();

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test'], { type: 'image/png' }),
        contentType: 'image/png',
      };

      await handler.uploadFile('test-capture-id', 'standard', file, progressCallback);

      // Deve ter chamado progresso pelo menos 2 vezes (início e fim)
      expect(progressCallback).toHaveBeenCalled();
      
      // Verificar que última chamada tem percent = 100
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      expect(lastCall?.[0]?.percent).toBe(100);
    });

    it('deve fazer retry em caso de falha no fetch (Requisito 11.7)', async () => {
      vi.useFakeTimers();

      const handler = new UploadHandler({
        ...config,
        maxRetries: 2,
      });

      // Primeira chamada falha, segunda sucede
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: vi.fn().mockResolvedValue(''),
        });

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test']),
        contentType: 'image/png',
      };

      const resultPromise = handler.uploadFile('test-capture-id', 'standard', file);

      // Avançar timers para permitir retries
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);

      vi.useRealTimers();
    });

    it('deve retornar erro após máximo de tentativas', async () => {
      vi.useFakeTimers();

      const handler = new UploadHandler({
        ...config,
        maxRetries: 2,
      });

      // Todas as chamadas falham
      mockFetch.mockRejectedValue(new Error('Network error'));

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test']),
        contentType: 'image/png',
      };

      const resultPromise = handler.uploadFile('test-capture-id', 'standard', file);

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(2);

      vi.useRealTimers();
    });

    it('deve tratar erro HTTP 403 Forbidden', async () => {
      vi.useFakeTimers();

      const handler = new UploadHandler({
        ...config,
        maxRetries: 1,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('Access Denied'),
      });

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test']),
        contentType: 'image/png',
      };

      const resultPromise = handler.uploadFile('test-capture-id', 'standard', file);

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');

      vi.useRealTimers();
    });
  });


  describe('uploadFiles (Batch Upload)', () => {
    it('deve fazer upload de múltiplos arquivos', async () => {
      const handler = new UploadHandler(config);

      const files: UploadFile[] = [
        { type: 'screenshot', data: new Blob(['test1']), contentType: 'image/png' },
        { type: 'html', data: '<html></html>', contentType: 'text/html' },
        { type: 'metadata', data: '{"test": true}', contentType: 'application/json' },
      ];

      const result = await handler.uploadFiles('test-capture-id', 'standard', files);

      expect(result.totalFiles).toBe(3);
      expect(result.captureId).toBe('test-capture-id');
      expect(result.successCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.success).toBe(true);
    });

    it('deve reportar falhas parciais', async () => {
      vi.useFakeTimers();

      const handler = new UploadHandler({
        ...config,
        maxRetries: 1,
      });

      // Primeiro upload sucede, segundo falha
      mockApiClient.post
        .mockResolvedValueOnce({ success: true, data: mockPresignedUrlResponse })
        .mockResolvedValueOnce({ success: false, error: 'Erro' });

      const files: UploadFile[] = [
        { type: 'screenshot', data: new Blob(['test1']), contentType: 'image/png' },
        { type: 'html', data: '<html></html>', contentType: 'text/html' },
      ];

      const resultPromise = handler.uploadFiles('test-capture-id', 'standard', files);

      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(1);

      vi.useRealTimers();
    });
  });

  describe('notifyUploadComplete (Requisito 11.8)', () => {
    it('deve notificar backend após upload', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: true,
        data: { acknowledged: true },
      });

      const handler = new UploadHandler(config);

      const notification: UploadCompleteNotification = {
        captureId: 'test-capture-id',
        storageType: 'standard',
        files: [
          {
            type: 'screenshot',
            objectKey: 'captures/test/screenshot.png',
            downloadUrl: 'https://cdn.lexato.com.br/captures/test/screenshot.png',
            contentType: 'image/png',
            sizeBytes: 1024000,
          },
        ],
        completedAt: new Date().toISOString(),
      };

      const result = await handler.notifyUploadComplete(notification);

      expect(result).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledWith('/upload/complete', notification);
    });

    it('deve retornar false quando notificação falha', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        success: false,
        error: 'Erro ao notificar',
      });

      const handler = new UploadHandler(config);

      const notification: UploadCompleteNotification = {
        captureId: 'test-capture-id',
        storageType: 'standard',
        files: [],
        completedAt: new Date().toISOString(),
      };

      const result = await handler.notifyUploadComplete(notification);

      expect(result).toBe(false);
    });
  });

  describe('retryUpload (Requisito 11.9)', () => {
    it('deve permitir retry manual', async () => {
      const handler = new UploadHandler(config);

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test'], { type: 'image/png' }),
        contentType: 'image/png',
      };

      const result = await handler.retryUpload('test-capture-id', 'standard', file);

      expect(result).toBeDefined();
      expect(result.fileType).toBe('screenshot');
      expect(result.success).toBe(true);
    });
  });


  describe('Conversão de Dados (toBlob)', () => {
    it('deve converter Blob para upload', async () => {
      const handler = new UploadHandler(config);

      const file: UploadFile = {
        type: 'screenshot',
        data: new Blob(['test content'], { type: 'image/png' }),
        contentType: 'image/png',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('deve converter ArrayBuffer para upload', async () => {
      const handler = new UploadHandler(config);

      const buffer = new ArrayBuffer(8);
      const view = new Uint8Array(buffer);
      view.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header

      const file: UploadFile = {
        type: 'screenshot',
        data: buffer,
        contentType: 'image/png',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      expect(result.success).toBe(true);
    });

    it('deve converter string base64 para upload', async () => {
      const handler = new UploadHandler(config);

      // Base64 simples
      const base64Data = btoa('test content');
      const file: UploadFile = {
        type: 'metadata',
        data: base64Data,
        contentType: 'application/json',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      expect(result.success).toBe(true);
    });

    it('deve converter data URL para upload', async () => {
      const handler = new UploadHandler(config);

      const dataUrl = `data:image/png;base64,${btoa('test content')}`;
      const file: UploadFile = {
        type: 'screenshot',
        data: dataUrl,
        contentType: 'image/png',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      expect(result.success).toBe(true);
    });

    it('deve converter texto HTML para upload', async () => {
      const handler = new UploadHandler(config);

      const htmlContent = '<!DOCTYPE html><html><head><title>Test</title></head><body>Content</body></html>';
      const file: UploadFile = {
        type: 'html',
        data: htmlContent,
        contentType: 'text/html',
      };

      const result = await handler.uploadFile('test-capture-id', 'standard', file);

      expect(result.success).toBe(true);
    });
  });

  describe('Tipos de Arquivo', () => {
    const fileTypes: Array<{ type: UploadFile['type']; contentType: string }> = [
      { type: 'screenshot', contentType: 'image/png' },
      { type: 'video', contentType: 'video/webm' },
      { type: 'html', contentType: 'text/html' },
      { type: 'metadata', contentType: 'application/json' },
      { type: 'hashes', contentType: 'application/json' },
      { type: 'frame', contentType: 'image/jpeg' },
    ];

    fileTypes.forEach(({ type, contentType }) => {
      it(`deve suportar upload de ${type}`, async () => {
        const handler = new UploadHandler(config);

        const file: UploadFile = {
          type,
          data: new Blob(['test']),
          contentType,
        };

        const result = await handler.uploadFile('test-capture-id', 'standard', file);

        expect(result.fileType).toBe(type);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Tipos de Armazenamento', () => {
    const storageTypes: StorageType[] = ['standard', 'premium_5y', 'premium_10y', 'premium_20y'];

    storageTypes.forEach((storageType) => {
      it(`deve suportar storage type ${storageType}`, async () => {
        const handler = new UploadHandler(config);

        await handler.requestPresignedUrl({
          fileType: 'screenshot',
          fileSize: 1024,
          storageType,
          captureId: 'test-capture-id',
          contentType: 'image/png',
        });

        expect(mockApiClient.post).toHaveBeenCalledWith(
          '/upload/presign',
          expect.objectContaining({
            storageType,
          })
        );
      });
    });
  });
});


describe('Mensagens de Progresso', () => {
  it('deve ter mensagens em português', async () => {
    const mockApiClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          evidenceId: 'test-id',
          uploadUrl: 'https://s3.amazonaws.com/test',
          downloadUrl: 'https://cdn.lexato.com.br/test',
          bucket: 'test-bucket',
          key: 'test/key',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          expiresInSeconds: 900,
          conditions: { contentType: 'image/png', maxContentLength: 52428800 },
        },
      }),
    };

    const handler = new UploadHandler({
      apiClient: mockApiClient as unknown as UploadHandlerConfig['apiClient'],
    });

    const progressMessages: string[] = [];
    const progressCallback = (progress: UploadProgress) => {
      progressMessages.push(progress.message);
    };

    const file: UploadFile = {
      type: 'screenshot',
      data: new Blob(['test']),
      contentType: 'image/png',
    };

    await handler.uploadFile('test-capture-id', 'standard', file, progressCallback);

    // Verificar que pelo menos uma mensagem foi registrada
    expect(progressMessages.length).toBeGreaterThan(0);
    
    // Verificar que mensagens estão em português
    const hasPortugueseMessage = progressMessages.some(
      msg => msg.includes('Solicitando') || 
             msg.includes('Enviando') || 
             msg.includes('concluído') ||
             msg.includes('Falha')
    );
    expect(hasPortugueseMessage).toBe(true);
  });
});

describe('Cálculo de Tamanho de Arquivo', () => {
  it('deve calcular tamanho correto de Blob', async () => {
    const mockApiClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          evidenceId: 'test-id',
          uploadUrl: 'https://s3.amazonaws.com/test',
          downloadUrl: 'https://cdn.lexato.com.br/test',
          bucket: 'test-bucket',
          key: 'test/key',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          expiresInSeconds: 900,
          conditions: { contentType: 'image/png', maxContentLength: 52428800 },
        },
      }),
    };

    const handler = new UploadHandler({
      apiClient: mockApiClient as unknown as UploadHandlerConfig['apiClient'],
    });

    const testContent = 'A'.repeat(1000);
    const file: UploadFile = {
      type: 'html',
      data: new Blob([testContent]),
      contentType: 'text/html',
    };

    await handler.uploadFile('test-capture-id', 'standard', file);

    // Verificar que contentLength foi enviado corretamente
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/upload/presign',
      expect.objectContaining({
        contentLength: 1000,
      })
    );
  });

  it('deve calcular tamanho correto de data URL base64', async () => {
    const mockApiClient = {
      post: vi.fn().mockResolvedValue({
        success: true,
        data: {
          evidenceId: 'test-id',
          uploadUrl: 'https://s3.amazonaws.com/test',
          downloadUrl: 'https://cdn.lexato.com.br/test',
          bucket: 'test-bucket',
          key: 'test/key',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          expiresInSeconds: 900,
          conditions: { contentType: 'image/png', maxContentLength: 52428800 },
        },
      }),
    };

    const handler = new UploadHandler({
      apiClient: mockApiClient as unknown as UploadHandlerConfig['apiClient'],
    });

    // Criar data URL com conteúdo conhecido
    const originalContent = 'Hello World!'; // 12 bytes
    const base64Content = btoa(originalContent);
    const dataUrl = `data:image/png;base64,${base64Content}`;

    const file: UploadFile = {
      type: 'screenshot',
      data: dataUrl,
      contentType: 'image/png',
    };

    await handler.uploadFile('test-capture-id', 'standard', file);

    // Verificar que contentLength foi calculado corretamente (12 bytes)
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/upload/presign',
      expect.objectContaining({
        contentLength: 12,
      })
    );
  });
});
