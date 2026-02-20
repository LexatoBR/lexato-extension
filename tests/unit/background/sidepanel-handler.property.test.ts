/**
 * Testes de Propriedade (Property-Based Tests) para SidePanelHandler
 *
 * Feature: video-capture-redesign
 * Valida propriedades de corretude do gerenciamento do Side Panel
 *
 * @module SidePanelHandlerPropertyTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { chromeMock } from '../../setup';

// Mock do AuditLogger
vi.mock('../../../src/lib/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    getCorrelationId: vi.fn(() => 'test-correlation-id'),
    getTraceId: vi.fn(() => '1-test-trace-id'),
    getEntries: vi.fn(() => []),
    getSummary: vi.fn(() => ({
      correlationId: 'test-correlation-id',
      traceId: '1-test-trace-id',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      totalDurationMs: 0,
      entriesCount: 0,
      countByLevel: { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 },
      countByProcess: {},
    })),
  })),
}));

// Importar após os mocks
import {
  SidePanelHandler,
  resetSidePanelHandler,
} from '../../../src/background/sidepanel-handler';

// =============================================================================
// SETUP DO MOCK DO SIDEPANEL
// =============================================================================

/**
 * Configura mock do chrome.sidePanel para testes
 */
function setupSidePanelMock(): void {
  // Adicionar mock do sidePanel ao chromeMock
  const sidePanelMock = {
    open: vi.fn().mockResolvedValue(undefined),
    setOptions: vi.fn().mockResolvedValue(undefined),
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    getOptions: vi.fn().mockResolvedValue({ enabled: true }),
    getPanelBehavior: vi.fn().mockResolvedValue({ openPanelOnActionClick: false }),
  };

  // Adicionando mock do sidePanel ao chromeMock
  (chromeMock as Record<string, unknown>)['sidePanel'] = sidePanelMock;
}

/**
 * Remove mock do chrome.sidePanel
 */
function removeSidePanelMock(): void {
  // Removendo mock do sidePanel
  delete (chromeMock as Record<string, unknown>)['sidePanel'];
}

// =============================================================================
// TESTES DE PROPRIEDADE
// =============================================================================

describe('Property-Based Tests - SidePanelHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSidePanelHandler();
    setupSidePanelMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetSidePanelHandler();
    removeSidePanelMock();
  });

  // ==========================================================================
  // Property 1: Side Panel Opens on Recording Start
  // Feature: video-capture-redesign
  // Validates: Requirements 1.1
  // ==========================================================================

  describe('Property 1: Side Panel Opens on Recording Start', () => {
    /**
     * Para qualquer windowId válido, sidePanel.open() deve ser chamado
     * com o windowId correto ao iniciar gravação
     *
     * **Validates: Requirements 1.1**
     */
    it('deve chamar sidePanel.open() com windowId correto para qualquer windowId válido', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Gerar windowIds válidos (inteiros positivos típicos do Chrome)
          fc.integer({ min: 1, max: 999999 }),
          async (windowId) => {
            // Limpar mocks e resetar handler para cada iteração
            vi.clearAllMocks();
            resetSidePanelHandler();
            setupSidePanelMock();

            const handler = new SidePanelHandler();

            // Executar abertura do Side Panel
            await handler.open(windowId);

            // Verificar que sidePanel.open foi chamado com o windowId correto
            const sidePanel = chromeMock['sidePanel'] as unknown as { open: ReturnType<typeof vi.fn> };
            expect(sidePanel.open).toHaveBeenCalledTimes(1);
            expect(sidePanel.open).toHaveBeenCalledWith({ windowId });

            // Verificar que o estado interno foi atualizado
            expect(handler.getIsOpen()).toBe(true);
            expect(handler.getCurrentWindowId()).toBe(windowId);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Para qualquer sequência de aberturas, apenas a última deve estar ativa
     *
     * **Validates: Requirements 1.1**
     */
    it('deve manter apenas o último windowId após múltiplas aberturas', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Gerar array de windowIds (2 a 5 aberturas consecutivas)
          fc.array(fc.integer({ min: 1, max: 999999 }), { minLength: 2, maxLength: 5 }),
          async (windowIds) => {
            vi.clearAllMocks();
            resetSidePanelHandler();
            setupSidePanelMock();

            const handler = new SidePanelHandler();

            // Abrir Side Panel múltiplas vezes
            for (const windowId of windowIds) {
              await handler.open(windowId);
            }

            // Verificar que o último windowId está ativo
            const lastWindowId = windowIds[windowIds.length - 1];
            expect(handler.getCurrentWindowId()).toBe(lastWindowId);
            expect(handler.getIsOpen()).toBe(true);

            // Verificar que sidePanel.open foi chamado para cada windowId
            const sidePanel = chromeMock['sidePanel'] as unknown as { open: ReturnType<typeof vi.fn> };
            expect(sidePanel.open).toHaveBeenCalledTimes(windowIds.length);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Após fechar o Side Panel, getIsOpen() deve retornar false
     *
     * **Validates: Requirements 1.1**
     */
    it('deve atualizar estado para fechado após close()', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999 }),
          async (windowId) => {
            vi.clearAllMocks();
            resetSidePanelHandler();
            setupSidePanelMock();

            const handler = new SidePanelHandler();

            // Abrir e depois fechar
            await handler.open(windowId);
            expect(handler.getIsOpen()).toBe(true);

            await handler.close();
            expect(handler.getIsOpen()).toBe(false);
            expect(handler.getCurrentWindowId()).toBe(null);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Se chrome.sidePanel não estiver disponível, deve lançar erro
     *
     * **Validates: Requirements 1.1**
     */
    it('deve lançar erro quando chrome.sidePanel não está disponível', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999 }),
          async (windowId) => {
            vi.clearAllMocks();
            resetSidePanelHandler();
            removeSidePanelMock(); // Remover mock para simular API indisponível

            const handler = new SidePanelHandler();

            // Deve lançar erro
            await expect(handler.open(windowId)).rejects.toThrow(
              'Falha ao abrir Side Panel: chrome.sidePanel API não disponível'
            );

            // Estado deve permanecer fechado
            expect(handler.getIsOpen()).toBe(false);
            expect(handler.getCurrentWindowId()).toBe(null);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Se sidePanel.open() falhar, deve propagar o erro
     *
     * **Validates: Requirements 1.1**
     */
    it('deve propagar erro quando sidePanel.open() falha', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (windowId, errorMessage) => {
            vi.clearAllMocks();
            resetSidePanelHandler();
            setupSidePanelMock();

            // Configurar mock para falhar
            const sidePanel = chromeMock['sidePanel'] as unknown as { open: ReturnType<typeof vi.fn> };
            vi.mocked(sidePanel.open).mockRejectedValueOnce(
              new Error(errorMessage)
            );

            const handler = new SidePanelHandler();

            // Deve lançar erro com mensagem apropriada
            await expect(handler.open(windowId)).rejects.toThrow(
              `Falha ao abrir Side Panel: ${errorMessage}`
            );

            // Estado deve permanecer fechado
            expect(handler.getIsOpen()).toBe(false);
            expect(handler.getCurrentWindowId()).toBe(null);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
