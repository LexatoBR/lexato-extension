import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VideoCaptureHandler,
  CaptureConfig,
  cancelVideoCaptureWithPipeline,
} from '../../../src/background/video-capture-handler';
import { AuditLogger } from '../../../src/lib/audit-logger';
import { TabIsolationManager } from '../../../src/background/tab-isolation-manager';
import { ChunkManager } from '../../../src/background/chunk-manager';
import { MultipartUploadService } from '../../../src/lib/multipart-upload';

// Mock dependencies
vi.mock('../../../src/lib/audit-logger');
vi.mock('../../../src/background/tab-isolation-manager');
vi.mock('../../../src/background/chunk-manager');
vi.mock('../../../src/lib/multipart-upload');

// Mock Chrome API
const chromeMock = {
    runtime: {
        getContexts: vi.fn(),
        sendMessage: vi.fn(),
        lastError: undefined,
    },
    offscreen: {
        createDocument: vi.fn(),
        Reason: { USER_MEDIA: 'USER_MEDIA' },
    },
    tabCapture: {
        getMediaStreamId: vi.fn(),
    },
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue(undefined),
    },
};
global.chrome = chromeMock as any;

describe('VideoCaptureHandler', () => {
    let handler: VideoCaptureHandler;
    let mockLogger: any;
    let mockIsolationManager: any;
    let mockUploadService: any;
    let mockChunkManager: any;

    const mockConfig: CaptureConfig = {
        tabId: 100,
        windowId: 200,
        captureId: 'test-capture-id',
        storageType: 'STANDARD',
    };

    beforeEach(() => {
        vi.resetAllMocks();

        // Setup mocks
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        };
        (AuditLogger as any).mockImplementation(() => mockLogger);

        mockIsolationManager = {
            activate: vi.fn().mockResolvedValue(undefined),
            deactivate: vi.fn().mockResolvedValue(undefined),
            generateManifestSection: vi.fn().mockReturnValue({}),
        };
        (TabIsolationManager as any).mockImplementation(() => mockIsolationManager);

        mockChunkManager = {
            processChunk: vi.fn(),
        };
        (ChunkManager as any).mockImplementation(() => mockChunkManager);

        mockUploadService = {
            initiate: vi.fn().mockResolvedValue(undefined),
            uploadPart: vi.fn().mockResolvedValue(undefined),
            isInProgress: vi.fn().mockReturnValue(true),
            getUploadId: vi.fn().mockReturnValue('upload-123'),
            complete: vi.fn().mockResolvedValue(undefined),
        };
        (MultipartUploadService as any).mockImplementation(() => mockUploadService);

        handler = new VideoCaptureHandler(new AuditLogger(), new TabIsolationManager({} as any));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('startCapture', () => {
        it('should successfully start capture', async () => {
            // Setup Chrome mocks for success path
            chromeMock.runtime.getContexts.mockResolvedValue([]); // No offscreen yet
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            await handler.startCapture(mockConfig);

            // Verify Offscreen creation
            expect(chromeMock.offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({
                url: 'src/offscreen/offscreen.html',
                reasons: ['USER_MEDIA']
            }));

            // Verify Stream ID retrieval
            expect(chromeMock.tabCapture.getMediaStreamId).toHaveBeenCalled();

            // Verify Initialization of components
            expect(MultipartUploadService).toHaveBeenCalled();
            expect(mockUploadService.initiate).toHaveBeenCalledWith('test-capture-id', 'STANDARD');

            // Verify Start Recording Message
            expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
                type: 'start-recording',
                data: expect.objectContaining({
                    streamId: 'stream-123'
                })
            }));

            // Verify Isolation Activation
            expect(mockIsolationManager.activate).toHaveBeenCalledWith(100, 200);

            // Verify Logging
            expect(mockLogger.info).toHaveBeenCalledWith('CAPTURE', 'STARTED', expect.anything());
        });

        it('should handle offscreen creation failure', async () => {
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockRejectedValue(new Error('Offscreen failed'));

            await expect(handler.startCapture(mockConfig)).rejects.toThrow('Offscreen failed');

            expect(mockLogger.error).toHaveBeenCalledWith('CAPTURE', 'START_FAILED', expect.anything());
        });

        it('should reuse existing offscreen document', async () => {
            chromeMock.runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            await handler.startCapture(mockConfig);

            expect(chromeMock.offscreen.createDocument).not.toHaveBeenCalled();
        });
    });

    describe('handleChunk', () => {
        it('should process and upload chunk when capturing', async () => {
            // Mock internal state to 'capturing' by running startCapture first
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
            await handler.startCapture(mockConfig);

            // Setup chunk processing mocks
            const blob = new Blob(['test']);
            mockChunkManager.processChunk.mockResolvedValue({
                index: 1,
                data: blob,
                hash: 'hash123',
                previousHash: 'hash000',
                partNumber: 2 // S3 Multipart usa 1-based (index + 1)
            });

            const validChunkData = {
                chunk: [1, 2, 3],
                index: 1,
                timestamp: new Date().toISOString()
            };

            // Override global Blob since node doesn't have it natively (vitest might provided it via jsdom, but let's be safe if environment is node)
            // Check if Blob exists, if not mock it. Vite environment likely is jsdom or happy-dom.

            await handler.handleChunk(validChunkData);

            expect(mockChunkManager.processChunk).toHaveBeenCalled();
            expect(mockUploadService.uploadPart).toHaveBeenCalledWith(
                expect.anything(), // blob
                2, // index + 1
                'hash123',
                'hash000'
            );
        });

        it('should ignore chunk if not capturing', async () => {
            await handler.handleChunk({ chunk: [], index: 0, timestamp: '' });

            expect(mockChunkManager.processChunk).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith('CAPTURE', 'CHUNK_IGNORED_STATE', expect.anything());
        });
    });
});

describe('cancelVideoCaptureWithPipeline', () => {
    let mockLogger: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        };

        // Reset Chrome mocks
        chromeMock.runtime.sendMessage.mockReset();
        chromeMock.tabs = {
            query: vi.fn().mockResolvedValue([]),
            sendMessage: vi.fn().mockResolvedValue(undefined),
        } as any;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('quando não há captura ativa', () => {
        it('deve retornar sucesso sem enviar mensagens', async () => {
            const result = await cancelVideoCaptureWithPipeline(mockLogger);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'VIDEO_CAPTURE',
                'NO_ACTIVE_CAPTURE_TO_CANCEL',
                expect.anything()
            );
            // Não deve tentar enviar mensagem ao offscreen
            expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
        });
    });

    describe('envio de mensagem cancel-recording ao offscreen', () => {
        it('deve enviar mensagem cancel-recording com target offscreen', async () => {
            // Simular captura ativa iniciando uma captura primeiro
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            const handler = new VideoCaptureHandler(
                new AuditLogger(),
                new TabIsolationManager({} as any)
            );
            await handler.startCapture({
                tabId: 100,
                windowId: 200,
                captureId: 'test-capture',
                storageType: 'STANDARD',
            });

            // Resetar mocks para verificar apenas o cancel
            chromeMock.runtime.sendMessage.mockReset();
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
            chromeMock.tabs.query.mockResolvedValue([{ id: 100 }]);
            chromeMock.tabs.sendMessage.mockResolvedValue(undefined);

            const result = await cancelVideoCaptureWithPipeline(mockLogger);

            // Verificar que enviou mensagem cancel-recording
            expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'cancel-recording',
                target: 'offscreen',
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                'VIDEO_CAPTURE',
                'STOPPING_OFFSCREEN_RECORDING',
                expect.anything()
            );
            expect(result.success).toBe(true);
        });

        it('deve continuar mesmo se offscreen falhar', async () => {
            // Simular captura ativa
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            const handler = new VideoCaptureHandler(
                new AuditLogger(),
                new TabIsolationManager({} as any)
            );
            await handler.startCapture({
                tabId: 100,
                windowId: 200,
                captureId: 'test-capture',
                storageType: 'STANDARD',
            });

            // Simular falha no offscreen
            chromeMock.runtime.sendMessage.mockReset();
            chromeMock.runtime.sendMessage.mockRejectedValue(new Error('Offscreen não existe'));
            chromeMock.tabs.query.mockResolvedValue([{ id: 100 }]);
            chromeMock.tabs.sendMessage.mockResolvedValue(undefined);

            const result = await cancelVideoCaptureWithPipeline(mockLogger);

            // Deve logar warning mas continuar
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'VIDEO_CAPTURE',
                'OFFSCREEN_CANCEL_FAILED',
                expect.objectContaining({
                    error: 'Offscreen não existe',
                })
            );
            // Deve ainda assim completar com sucesso
            expect(result.success).toBe(true);
        });
    });

    describe('limpeza de recursos', () => {
        it('deve desativar lockdown e restaurar extensões', async () => {
            // Simular captura ativa
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            const handler = new VideoCaptureHandler(
                new AuditLogger(),
                new TabIsolationManager({} as any)
            );
            await handler.startCapture({
                tabId: 100,
                windowId: 200,
                captureId: 'test-capture',
                storageType: 'STANDARD',
            });

            chromeMock.runtime.sendMessage.mockReset();
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
            chromeMock.tabs.query.mockResolvedValue([{ id: 100 }]);
            chromeMock.tabs.sendMessage.mockResolvedValue(undefined);

            const result = await cancelVideoCaptureWithPipeline(mockLogger);

            // Verificar que enviou DEACTIVATE_LOCKDOWN
            expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(100, {
                type: 'DEACTIVATE_LOCKDOWN',
            });
            // Verificar que enviou CAPTURE_CLEANUP
            expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(100, {
                type: 'CAPTURE_CLEANUP',
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                'VIDEO_CAPTURE',
                'DEACTIVATING_ISOLATION_ON_CANCEL',
                expect.anything()
            );
            expect(result.success).toBe(true);
        });

        it('deve continuar mesmo se tab não tiver content script', async () => {
            // Simular captura ativa
            chromeMock.runtime.getContexts.mockResolvedValue([]);
            chromeMock.offscreen.createDocument.mockResolvedValue(undefined);
            chromeMock.tabCapture.getMediaStreamId.mockImplementation((_, cb) => cb('stream-123'));
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });

            const handler = new VideoCaptureHandler(
                new AuditLogger(),
                new TabIsolationManager({} as any)
            );
            await handler.startCapture({
                tabId: 100,
                windowId: 200,
                captureId: 'test-capture',
                storageType: 'STANDARD',
            });

            chromeMock.runtime.sendMessage.mockReset();
            chromeMock.runtime.sendMessage.mockResolvedValue({ success: true });
            chromeMock.tabs.query.mockResolvedValue([{ id: 100 }]);
            // Simular tab sem content script
            chromeMock.tabs.sendMessage.mockRejectedValue(new Error('No content script'));

            const result = await cancelVideoCaptureWithPipeline(mockLogger);

            // Deve completar com sucesso mesmo assim
            expect(result.success).toBe(true);
        });
    });
});
