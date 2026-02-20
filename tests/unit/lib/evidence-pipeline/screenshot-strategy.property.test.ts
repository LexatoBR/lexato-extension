/**
 * Testes de Propriedade para ScreenshotStrategy
 *
 * Valida a robustez e integridade da ScreenshotStrategy gerando inputs
 * aleatórios e verificando invariantes do CaptureResult unificado.
 *
 * @module ScreenshotStrategyPropertyTests
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { ScreenshotStrategy } from '../../../../src/lib/evidence-pipeline/screenshot-strategy';
import type { CaptureConfig, CaptureType } from '../../../../src/lib/evidence-pipeline/types';

/** Tipo para mensagem do PISA */
interface PisaMessage {
  type: string;
  [key: string]: unknown;
}

/** Tipo para resposta do PISA */
interface PisaResponse {
  success: boolean;
  data: {
    imageData: string;
    imageHash: string;
    htmlContent?: string;
    htmlHash?: string;
    metadata?: {
      url: string;
      captureId: string;
      timestamp?: string;
    };
    metadataHash?: string;
  };
}

// Mock do crypto-helper
vi.mock('../../../../src/lib/evidence-pipeline/crypto-helper', () => ({
  calcularHashSHA256: vi.fn(async (data: string | ArrayBuffer) => {
    // Hash simples e determinístico para teste
    if (typeof data === 'string') {
      return `hash-of-${data.substring(0, 10)}`;
    }
    return 'hash-of-buffer';
  }),
  calcularMerkleRoot: vi.fn(async (hashes: string[]) => {
    return `merkle-root-of-[${hashes.join(',')}]`;
  }),
  gerarUUIDv4: vi.fn(() => 'test-uuid-v4'),
}));

// Mock do chrome já configurado no setup.ts, mas precisamos especificar retornos do sendMessage
// para os testes de propriedade

describe('ScreenshotStrategy - Property Tests', () => {
  let strategy: ScreenshotStrategy;

  beforeAll(() => {
    strategy = new ScreenshotStrategy();

    // Mock global do chrome.tabs.sendMessage para simular resposta do PISA
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.chrome.tabs.sendMessage as any) = vi.fn(
      (_tabId: number, _msg: unknown, callback?: (response: PisaResponse) => void) => {
        // Simula resposta assíncrona se callback for fornecido
        if (callback) {
          callback({
            success: true,
            data: {
              imageData: 'base64data',
              imageHash: 'hash-image',
              htmlContent: '<html></html>',
              htmlHash: 'hash-html',
              metadata: {
                captureId: 'test-id',
                url: 'http://test.com',
              },
            },
          });
        }
        return Promise.resolve({ success: true, data: {} });
      }
    );

    // Mock do chrome.tabs.get
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global.chrome.tabs.get as any) = vi.fn(
      (_tabId: number, callback: (tab: chrome.tabs.Tab) => void) => {
        callback({
          id: _tabId,
          url: 'http://example.com',
          title: 'Example Domain',
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          active: true,
          incognito: false,
          selected: true,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
        });
      }
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 7: Estrutura Unificada de CaptureResult
   * Todo CaptureResult gerado deve respeitar a interface unificada,
   * independentemente da configuração de entrada válida.
   */
  it('Property 7: deve gerar CaptureResult com estrutura válida para qualquer config válida', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1 }), // tabId
        fc.boolean(), // collectHtml
        fc.boolean(), // collectMetadata
        async (tabId, collectHtml, collectMetadata) => {
          // Setup do mock específico para esta execução
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (global.chrome.tabs.sendMessage as any) = vi.fn(
            (
              _tId: number,
              msg: unknown,
              callback?: (response: PisaResponse) => void
            ): Promise<PisaResponse> => {
              const pisaMsg = msg as PisaMessage;
              if (pisaMsg.type === 'START_PISA') {
                const response: PisaResponse = {
                  success: true,
                  data: {
                    imageData: 'base64data',
                    imageHash: 'mock-hash-image',
                    ...(collectHtml && { htmlContent: '<html>content</html>' }),
                    ...(collectHtml && { htmlHash: 'mock-hash-html' }),
                    ...(collectMetadata && {
                      metadata: {
                        url: 'http://example.com',
                        captureId: 'test-id',
                        timestamp: new Date().toISOString(),
                      },
                    }),
                    ...(collectMetadata && { metadataHash: 'mock-hash-metadata' }),
                  },
                };
                if (callback) {
                  callback(response);
                }
                return Promise.resolve(response);
              }
              return Promise.resolve({ success: false, data: { imageData: '', imageHash: '' } });
            }
          );

          const config: CaptureConfig = {
            tabId,
            windowId: 1,
            type: 'screenshot' as CaptureType,
            storageConfig: {
              storageClass: 'STANDARD',
              retentionYears: 5,
            },
          };

          const result = await strategy.execute(config);

          // Verificações Invariantes (Post-conditions)

          // 1. ID deve ser válido
          expect(result.evidenceId).toBe('test-uuid-v4');

          // 2. Tipo deve ser screenshot
          expect(result.type).toBe('screenshot');

          // 3. Deve ter hashes
          expect(result.media.hash).toBeDefined();
          expect(result.html.hash).toBeDefined(); // Mesmo vazia tem hash
          expect(result.metadataHash).toBeDefined();

          // 4. Deve ter Merkle Root derivado dos hashes (mockado)
          expect(result.merkleRoot).toContain('merkle-root-of');

          // 5. Timestamps devem ser sequenciais
          const start = new Date(result.timestamps.startedAt).getTime();
          const end = new Date(result.timestamps.endedAt).getTime();
          expect(end).toBeGreaterThanOrEqual(start);
          expect(result.timestamps.durationMs).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 20 } // Property test rápido
    );
  });
});
