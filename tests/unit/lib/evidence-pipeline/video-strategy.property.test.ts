/**
 * Testes de Propriedade para VideoStrategy
 *
 * Valida a robustez e integridade da VideoStrategy gerando inputs
 * aleatórios e verificando invariantes do CaptureResult unificado.
 *
 * @module VideoStrategyPropertyTests
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { VideoStrategy } from '../../../../src/lib/evidence-pipeline/video-strategy';
import type { CaptureConfig } from '../../../../src/lib/evidence-pipeline/types';

// Mock do crypto-helper
vi.mock('../../../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularHashSHA256: vi.fn(async (data: string | ArrayBuffer) => {
    if (typeof data === 'string') return `hash-of-${data.substring(0, 10)}`;
    return 'hash-of-buffer';
  }),
  calcularMerkleRoot: vi.fn(async (hashes: string[]) => {
    return hashes.length > 0 ? `merkle-root-of-[${hashes.join(',')}]` : 'empty-merkle-root';
  }),
  gerarUUIDv4: vi.fn(() => 'test-uuid-video-v4'),
}));

describe('VideoStrategy - Property Tests', () => {
  beforeAll(() => {
    // Inicializa VideoStrategy para configurar mocks
    new VideoStrategy();

    // Mock do chrome.offscreen
    (global.chrome as any).offscreen = {
      createDocument: vi.fn().mockResolvedValue(undefined),
      Reason: { USER_MEDIA: 'USER_MEDIA' },
    };

    // Mock do chrome.runtime.getContexts
    (global.chrome.runtime.getContexts as any) = vi.fn().mockResolvedValue([]);

    // Mock do chrome.tabCapture.getMediaStreamId
    (global.chrome.tabCapture as any) = {
      getMediaStreamId: vi.fn((_, cb) => cb('mock-stream-id')),
    };
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 7 (Video): Estrutura Unificada de CaptureResult para Vídeo
   */
  it('Property 7: deve gerar CaptureResult de vído com estrutura válida', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1 }), // tabId
        fc.integer({ min: 1, max: 10 }), // chunks count
        async (tabId, chunksCount) => {
            // Setup mocks dinâmicos
            const sendMessageMock = vi.fn((msg) => {
                if (msg.type === 'start-recording') return Promise.resolve({ success: true });
                if (msg.type === 'stop-recording') {
                    // Simula comportamento do offscreen: para o recorder e envia chunks finais
                    // Precisamos simular o listener recebendo chunks
                    return Promise.resolve({ success: true });
                }
                if (msg.type === 'cancel-recording') return Promise.resolve({ success: true });
                return Promise.resolve({});
            });
            (global.chrome.runtime.sendMessage as any) = sendMessageMock;

            // Instancia nova estratégia para cada run
            const strategyRun = new VideoStrategy();

            // Intercepta e guarda o listener registrado pela estratégia
            let messageListener: any = null;
            (global.chrome.runtime.onMessage.addListener as any) = (listener: any) => {
                messageListener = listener;
            };

            const config: CaptureConfig = {
                tabId,
                windowId: 1,
                type: 'video',
                storageConfig: { storageClass: 'STANDARD', retentionYears: 5 },
            };

            // Inicia captura
            const capturePromise = strategyRun.execute(config);

            // Simula envio de chunks pelo "offscreen" via listener
            if (messageListener) {
                 for (let i = 0; i < chunksCount; i++) {
                    await messageListener({
                        type: 'video-chunk',
                        target: 'extension',
                        data: {
                            chunk: 'bW9jay1jaHVuay1kYXRh', // base64 fake
                            index: i,
                            timestamp: new Date().toISOString()
                        }
                    }, {}, () => {});
                }
            }

            // Para captura (simula usuário clicando Stop)
            // Isso deve disparar o processo de finalização
            setTimeout(async () => {
                if (strategyRun.isCapturing()) {
                    await strategyRun.stop();
                }
            }, 10);

            // Aguarda resultado final
            const result = await capturePromise;

            // Verificações Invariantes
            expect(result.evidenceId).toBe('test-uuid-video-v4');
            expect(result.type).toBe('video');
            expect(result.media.blob).toBeDefined();
            expect(result.media.mimeType).toContain('video/webm');
            expect(result.merkleRoot).toBeDefined();
            expect(result.metadataHash).toBeDefined();
            
            // Verifica se processou os chunks (se listener funcionou)
            if (chunksCount > 0) {
                 expect(result.merkleRoot).toContain('merkle-root');
            }
        }
      ),
      { numRuns: 10 }
    );
  });
});
