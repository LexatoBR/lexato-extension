/**
 * Testes unitários para o Content Script da Extensão Chrome Lexato
 *
 * Testa handlers de mensagens e coleta de informações da página
 *
 * @module ContentScriptTests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

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

// Mock do ScreenshotCapture
vi.mock('../../../src/content/screenshot-capture', () => ({
  ScreenshotCapture: vi.fn().mockImplementation(() => ({
    isInProgress: vi.fn(() => false),
    capture: vi.fn(async () => ({
      success: true,
      imageData: 'data:image/png;base64,test',
      imageHash: 'test-hash',
      htmlContent: '<html></html>',
      htmlHash: 'html-hash',
      metadata: { url: 'https://example.com' },
      metadataHash: 'meta-hash',
      width: 1920,
      height: 2000,
      durationMs: 1000,
    })),
    cancel: vi.fn(),
    getConfig: vi.fn(() => ({})),
  })),
}));

// Mock do chrome.runtime
vi.stubGlobal('chrome', {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
});

// Importar após os mocks
import { handleMessage, getPageInfo, verifyPageLoaded } from '../../../src/content/content-script';

// Mock do window e document
const mockWindow = {
  location: {
    href: 'https://example.com/page',
  },
  innerWidth: 1920,
  innerHeight: 1080,
  scrollX: 0,
  scrollY: 100,
};

const mockDocument = {
  title: 'Test Page',
  readyState: 'complete' as DocumentReadyState,
  body: {
    scrollHeight: 2000,
    offsetHeight: 2000,
  },
  documentElement: {
    clientHeight: 1080,
    scrollHeight: 2000,
    offsetHeight: 2000,
  },
  images: [],
  fonts: {
    ready: Promise.resolve(),
  },
};

vi.stubGlobal('window', mockWindow);
vi.stubGlobal('document', mockDocument);

// ============================================================================
// Testes
// ============================================================================

describe('Content Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleMessage', () => {
    it('deve responder PONG para mensagem PING', async () => {
      const response = await handleMessage({ type: 'PING' });

      expect(response.success).toBe(true);
      expect(response.data).toBe('PONG');
    });

    it('deve retornar informações da página para GET_PAGE_INFO', async () => {
      const response = await handleMessage({ type: 'GET_PAGE_INFO' });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      const data = response.data as { url: string; title: string };
      expect(data.url).toBe('https://example.com/page');
      expect(data.title).toBe('Test Page');
    });

    it('deve iniciar processo PISA para START_PISA', async () => {
      const response = await handleMessage({
        type: 'START_PISA',
        payload: {
          captureId: 'test-capture-id',
          captureType: 'screenshot',
          storageType: 'standard',
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      const data = response.data as { status: string; pageInfo: unknown };
      // Para screenshots, o processo executa a captura completa
      expect(data.status).toBe('completed');
      expect(data.pageInfo).toBeDefined();
    });

    it('deve parar captura para STOP_CAPTURE', async () => {
      const response = await handleMessage({ type: 'STOP_CAPTURE' });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect((response.data as { status: string }).status).toBe('stopped');
    });

    it('deve cancelar captura para CANCEL_CAPTURE', async () => {
      const response = await handleMessage({ type: 'CANCEL_CAPTURE' });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect((response.data as { status: string }).status).toBe('cancelled');
    });

    it('deve retornar erro para tipo de mensagem desconhecido', async () => {
      const response = await handleMessage({ type: 'UNKNOWN_TYPE' as never });

      expect(response.success).toBe(false);
      expect(response.error).toContain('desconhecido');
    });

    it('deve retornar erro para ACTIVATE_LOCKDOWN (não implementado)', async () => {
      const response = await handleMessage({ type: 'ACTIVATE_LOCKDOWN' });

      expect(response.success).toBe(false);
      expect(response.error).toContain('não implementado');
    });
  });

  describe('getPageInfo', () => {
    it('deve retornar informações básicas da página', () => {
      const info = getPageInfo();

      expect(info.url).toBe('https://example.com/page');
      expect(info.title).toBe('Test Page');
      expect(info.readyState).toBe('complete');
      expect(info.viewport.width).toBe(1920);
      expect(info.viewport.height).toBe(1080);
      expect(info.scrollPosition.x).toBe(0);
      expect(info.scrollPosition.y).toBe(100);
      expect(info.timestamp).toBeDefined();
    });
  });

  describe('verifyPageLoaded', () => {
    it('deve retornar status de carregamento da página', async () => {
      const status = await verifyPageLoaded(1000);

      expect(status.readyState).toBe('complete');
      expect(status.imagesLoaded).toBe(true);
      expect(status.fontsLoaded).toBe(true);
      expect(status.imageCount).toBe(0);
      expect(status.loadedImageCount).toBe(0);
    });
  });
});
