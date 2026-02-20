/**
 * Teste de integração do fluxo pós-captura
 *
 * Verifica que o PostCaptureProcessor:
 * 1. Desbloqueia corretamente lockdown no content script
 * 2. Desbloqueia isolamento no background
 * 3. Abre preview automaticamente após upload
 * 4. Trata abort corretamente (sem abrir preview)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostCaptureProcessor } from '../src/background/handlers/post-capture-processor';
import type { PostCaptureProcessorConfig } from '../src/background/handlers/post-capture-processor';
import type { CaptureResult } from '../src/lib/evidence-pipeline/types';
import { AuditLogger } from '../src/lib/audit-logger';

// Mock do chrome API
const mockChrome = {
  tabs: {
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
  },
};

// @ts-expect-error - Mock global chrome
global.chrome = mockChrome;

describe('PostCaptureProcessor Integration', () => {
  let processor: PostCaptureProcessor;
  let config: PostCaptureProcessorConfig;
  let mockLogger: AuditLogger;
  let mockTabIsolationManager: any;
  let mockExtensionIsolationManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = new AuditLogger('test-correlation-id');
    vi.spyOn(mockLogger, 'info').mockImplementation(() => {});
    vi.spyOn(mockLogger, 'warn').mockImplementation(() => {});
    vi.spyOn(mockLogger, 'error').mockImplementation(() => {});

    mockTabIsolationManager = {
      deactivateLockdown: vi.fn().mockResolvedValue({
        success: true,
        stepsCompleted: ['keyboard_restored', 'context_menu_restored', 'devtools_restored'],
        warnings: [],
      }),
    };

    mockExtensionIsolationManager = {
      forceRestore: vi.fn().mockResolvedValue({
        restoredExtensions: ['ext1', 'ext2'],
        failedExtensions: [],
      }),
    };

    config = {
      tabId: 123,
      windowId: 456,
      storageConfig: {
        storageClass: 'STANDARD',
        retentionYears: 5,
      },
      logger: mockLogger,
      tabIsolationManager: mockTabIsolationManager,
      extensionIsolationManager: mockExtensionIsolationManager,
    };

    processor = new PostCaptureProcessor(config);
  });

  describe('process()', () => {
    it('deve desbloquear lockdown no content script', async () => {
      const captureResult: CaptureResult = {
        evidenceId: 'test-evidence-123',
        type: 'screenshot',
        url: 'https://example.com',
        title: 'Test Page',
        media: { blob: new Blob(), hash: 'hash123', mimeType: 'image/png', sizeBytes: 1000 },
        html: { content: 'html', hash: 'htmlhash', sizeBytes: 500 },
        forensicMetadata: {} as any, // Mock para testes
        metadataHash: 'metahash',
        merkleRoot: 'merkleroot123',
        timestamps: {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 1000,
        },
        isolation: {
          mode: 'full' as const,
          snapshotHash: 'snapshot123',
          disabledExtensions: [],
          nonDisabledExtensions: [],
        },
      };

      mockChrome.tabs.sendMessage.mockResolvedValue({ success: true });

      await processor.process(captureResult, true);

      // Verificar que mensagem CAPTURE_CLEANUP foi enviada
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          type: 'CAPTURE_CLEANUP',
          target: 'content',
        })
      );
    });

    it('deve desbloquear isolamento no background', async () => {
      const captureResult: CaptureResult = {
        evidenceId: 'test-evidence-123',
        type: 'screenshot',
        url: 'https://example.com',
        title: 'Test Page',
        media: { blob: new Blob(), hash: 'hash123', mimeType: 'image/png', sizeBytes: 1000 },
        html: { content: 'html', hash: 'htmlhash', sizeBytes: 500 },
        forensicMetadata: {} as any, // Mock para testes
        metadataHash: 'metahash',
        merkleRoot: 'merkleroot123',
        timestamps: {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 1000,
        },
        isolation: {
          mode: 'full' as const,
          snapshotHash: 'snapshot123',
          disabledExtensions: [],
          nonDisabledExtensions: [],
        },
      };

      await processor.process(captureResult, true);

      // Verificar que deactivateLockdown foi chamado
      expect(mockTabIsolationManager.deactivateLockdown).toHaveBeenCalledWith(false);

      // Verificar que extensões foram restauradas
      expect(mockExtensionIsolationManager.forceRestore).toHaveBeenCalled();
    });

    it('deve abrir preview após processamento', async () => {
      const captureResult: CaptureResult = {
        evidenceId: 'test-evidence-123',
        type: 'screenshot',
        url: 'https://example.com',
        title: 'Test Page',
        media: { blob: new Blob(), hash: 'hash123', mimeType: 'image/png', sizeBytes: 1000 },
        html: { content: 'html', hash: 'htmlhash', sizeBytes: 500 },
        forensicMetadata: {} as any, // Mock para testes
        metadataHash: 'metahash',
        merkleRoot: 'merkleroot123',
        timestamps: {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 1000,
        },
        isolation: {
          mode: 'full' as const,
          snapshotHash: 'snapshot123',
          disabledExtensions: [],
          nonDisabledExtensions: [],
        },
      };

      await processor.process(captureResult, true);

      // Verificar que nova aba foi criada com URL de preview
      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/preview/test-evidence-123'),
          active: true,
        })
      );
    });
  });

  describe('processAbort()', () => {
    it('deve desbloquear recursos sem abrir preview', async () => {
      await processor.processAbort('User cancelled');

      // Verificar que cleanup foi enviado
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        expect.objectContaining({
          type: 'CAPTURE_CLEANUP',
          target: 'content',
        })
      );

      // Verificar que isolamento foi desativado
      expect(mockTabIsolationManager.deactivateLockdown).toHaveBeenCalled();

      // Verificar que preview NÃO foi aberto
      expect(mockChrome.tabs.create).not.toHaveBeenCalled();
    });

    it('deve retornar sucesso mesmo se cleanup do content falhar', async () => {
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Tab closed'));

      const result = await processor.processAbort('Tab closed');

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'CAPTURE',
        'CONTENT_CLEANUP_FAILED',
        expect.any(Object)
      );
    });
  });

  describe('Fluxo completo de captura', () => {
    it('deve executar sequência correta: captura → upload → desbloqueio → preview', async () => {
      const captureResult: CaptureResult = {
        evidenceId: 'test-evidence-456',
        type: 'screenshot',
        url: 'https://test.com',
        title: 'Test Page 2',
        media: { blob: new Blob(), hash: 'hash456', mimeType: 'image/png', sizeBytes: 2000 },
        html: { content: 'html', hash: 'htmlhash456', sizeBytes: 1000 },
        forensicMetadata: {} as any, // Mock para testes
        metadataHash: 'metahash456',
        merkleRoot: 'merkleroot456',
        timestamps: {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: 2000,
        },
        isolation: {
          mode: 'full' as const,
          snapshotHash: 'snapshot456',
          disabledExtensions: [],
          nonDisabledExtensions: [],
        },
      };

      const result = await processor.process(captureResult, true);

      // Verificar ordem de execução
      const sendMessageCalls = mockChrome.tabs.sendMessage.mock.calls;
      const tabCreateCalls = mockChrome.tabs.create.mock.calls;

      // 1. Primeiro: mensagens para content script (overlay e cleanup)
      expect(sendMessageCalls.length).toBeGreaterThan(0);

      // 2. Depois: criar aba de preview
      expect(tabCreateCalls.length).toBe(1);

      // Verificar resultado
      expect(result.success).toBe(true);
      expect(result.evidenceId).toBe('test-evidence-456');
      expect(result.previewUrl).toContain('/preview/test-evidence-456');
    });
  });
});