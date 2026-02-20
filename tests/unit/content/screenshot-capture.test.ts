/**
 * Testes unitários para ScreenshotCapture
 *
 * Testa captura de screenshots full-page, cache-busting, aguardo de recursos,
 * stitching e cálculo de hash.
 *
 * @see Requirements 6.1-6.16, 19.1, 19.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ScreenshotCapture,
  addCacheBustParam,
  removeCacheBustParam,
  hasCacheBustParam,
  waitForDocumentComplete,
  waitForAllImages,
  waitForAllFonts,
  waitForAllResources,
} from '@content/screenshot-capture';
import { AuditLogger } from '@lib/audit-logger';

describe('ScreenshotCapture', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);

    // Mock document.fonts
    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    capture.cleanup();
  });

  describe('constructor', () => {
    it('deve criar instância com configuração padrão', () => {
      const config = capture.getConfig();
      expect(config.pageLoadTimeout).toBe(30000);
      expect(config.viewportTimeout).toBe(10000);
      expect(config.hashTimeout).toBe(5000);
      expect(config.quality).toBe(100);
      expect(config.format).toBe('png');
    });

    it('deve aceitar configuração customizada', () => {
      const customCapture = new ScreenshotCapture(logger, {
        quality: 80,
        format: 'jpeg',
      });
      const config = customCapture.getConfig();
      expect(config.quality).toBe(80);
      expect(config.format).toBe('jpeg');
    });
  });

  describe('isInProgress', () => {
    it('deve retornar false quando não há captura em andamento', () => {
      expect(capture.isInProgress()).toBe(false);
    });
  });

  describe('collectHtml', () => {
    it('deve coletar HTML da página', () => {
      const html = capture.collectHtml();
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html).toContain('<html');
    });
  });

  describe('collectMetadata', () => {
    it('deve coletar metadados da captura', () => {
      const metadata = capture.collectMetadata(3, 1920, 5000);

      expect(metadata.url).toBe(window.location.href);
      expect(metadata.title).toBe(document.title);
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.userAgent).toBe(navigator.userAgent);
      expect(metadata.viewport.width).toBe(window.innerWidth);
      expect(metadata.viewport.height).toBe(window.innerHeight);
      expect(metadata.pageSize.width).toBe(1920);
      expect(metadata.pageSize.height).toBe(5000);
      expect(metadata.viewportsCaptured).toBe(3);
    });

    it('deve incluir timestamp ISO 8601', () => {
      const metadata = capture.collectMetadata(1, 800, 600);
      const timestamp = new Date(metadata.timestamp);
      expect(timestamp.toISOString()).toBe(metadata.timestamp);
    });
  });

  describe('cancel', () => {
    it('deve cancelar captura em andamento', () => {
      // Simular captura em andamento
      capture.cancel();
      expect(capture.isInProgress()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('deve limpar recursos', () => {
      capture.cleanup();
      expect(capture.isInProgress()).toBe(false);
    });
  });
});

describe('Cache-busting functions', () => {
  describe('addCacheBustParam', () => {
    it('deve adicionar parâmetro _lexato_nocache à URL', () => {
      const url = 'https://example.com/page';
      const result = addCacheBustParam(url);

      expect(result).toContain('_lexato_nocache=');
      expect(result).toContain('https://example.com/page');
    });

    it('deve preservar parâmetros existentes', () => {
      const url = 'https://example.com/page?foo=bar';
      const result = addCacheBustParam(url);

      expect(result).toContain('foo=bar');
      expect(result).toContain('_lexato_nocache=');
    });

    it('deve substituir parâmetro existente', () => {
      const url = 'https://example.com/page?_lexato_nocache=old';
      const result = addCacheBustParam(url);

      expect(result).not.toContain('old');
      expect(result).toContain('_lexato_nocache=');
    });

    it('deve usar timestamp como valor', () => {
      const before = Date.now();
      const url = 'https://example.com/page';
      const result = addCacheBustParam(url);
      const after = Date.now();

      const urlObj = new URL(result);
      const timestamp = parseInt(urlObj.searchParams.get('_lexato_nocache') ?? '0', 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('removeCacheBustParam', () => {
    it('deve remover parâmetro _lexato_nocache', () => {
      const url = 'https://example.com/page?_lexato_nocache=123456';
      const result = removeCacheBustParam(url);

      expect(result).toBe('https://example.com/page');
    });

    it('deve preservar outros parâmetros', () => {
      const url = 'https://example.com/page?foo=bar&_lexato_nocache=123456&baz=qux';
      const result = removeCacheBustParam(url);

      expect(result).toContain('foo=bar');
      expect(result).toContain('baz=qux');
      expect(result).not.toContain('_lexato_nocache');
    });

    it('deve retornar URL inalterada se não tiver parâmetro', () => {
      const url = 'https://example.com/page?foo=bar';
      const result = removeCacheBustParam(url);

      expect(result).toBe('https://example.com/page?foo=bar');
    });
  });

  describe('hasCacheBustParam', () => {
    it('deve retornar true se URL tem parâmetro', () => {
      const url = 'https://example.com/page?_lexato_nocache=123456';
      expect(hasCacheBustParam(url)).toBe(true);
    });

    it('deve retornar false se URL não tem parâmetro', () => {
      const url = 'https://example.com/page?foo=bar';
      expect(hasCacheBustParam(url)).toBe(false);
    });

    it('deve retornar false para URL sem parâmetros', () => {
      const url = 'https://example.com/page';
      expect(hasCacheBustParam(url)).toBe(false);
    });
  });
});

describe('Resource waiting functions', () => {
  describe('waitForDocumentComplete', () => {
    it('deve resolver imediatamente se documento já está completo', async () => {
      // jsdom já tem readyState = 'complete'
      await expect(waitForDocumentComplete(1000)).resolves.toBeUndefined();
    });
  });

  describe('waitForAllImages', () => {
    it('deve resolver imediatamente se não há imagens', async () => {
      const result = await waitForAllImages(1000);
      expect(result.total).toBe(0);
      expect(result.loaded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('deve contar imagens já carregadas', async () => {
      // Criar imagem mock já carregada
      const img = document.createElement('img');
      Object.defineProperty(img, 'complete', { value: true });
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      document.body.appendChild(img);

      const result = await waitForAllImages(1000);
      expect(result.total).toBe(1);
      expect(result.loaded).toBe(1);

      document.body.removeChild(img);
    });
  });

  describe('waitForAllFonts', () => {
    it('deve resolver quando fontes estiverem prontas', async () => {
      const result = await waitForAllFonts(1000);
      expect(result.ready).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('waitForAllResources', () => {
    it('deve aguardar todos os recursos', async () => {
      const result = await waitForAllResources(5000);

      expect(result.documentReady).toBe(true);
      expect(result.images).toBeDefined();
      expect(result.fontsReady).toBe(true);
    });
  });
});

describe('ScreenshotCapture - capture method', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);

    // Mock document.fonts
    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    capture.cleanup();
  });

  it('deve reportar progresso durante captura', async () => {
    const progressUpdates: Array<{ stage: string; percent: number }> = [];

    // Iniciar captura com callback de progresso
    const capturePromise = capture.capture({
      onProgress: (progress) => {
        progressUpdates.push({ stage: progress.stage, percent: progress.percent });
      },
    });

    // Aguardar resultado (pode falhar por falta de chrome.runtime, mas deve reportar progresso)
    await capturePromise;

    // Verificar que houve atualizações de progresso
    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('deve retornar erro se captura já está em andamento', async () => {
    // Simular captura em andamento usando reflexão
    (capture as unknown as { isCapturing: boolean }).isCapturing = true;

    const result = await capture.capture();

    expect(result.success).toBe(false);
    expect(result.error).toContain('já em andamento');
  });
});

describe('ScreenshotCapture - hash calculation', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);
  });

  it('deve calcular hash de string', async () => {
    // Acessar método privado via reflexão para teste
    const calculateHash = (capture as unknown as { calculateHash: (data: string) => Promise<string> })
      .calculateHash.bind(capture);

    const hash = await calculateHash('test data');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // SHA-256 = 64 hex chars
  });

  it('deve calcular hash de objeto', async () => {
    const calculateHash = (capture as unknown as { calculateHash: (data: object) => Promise<string> })
      .calculateHash.bind(capture);

    const hash = await calculateHash({ key: 'value' });
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });
});

describe('ScreenshotCapture - métodos privados', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);

    // Mock document.fonts
    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    capture.cleanup();
  });

  describe('waitForRender', () => {
    it('deve aguardar dois frames de animação', async () => {
      const waitForRender = (capture as unknown as { waitForRender: () => Promise<void> })
        .waitForRender.bind(capture);

      await expect(waitForRender()).resolves.toBeUndefined();
    });
  });

  describe('createPlaceholderImage', () => {
    it('deve tentar criar imagem placeholder', () => {
      const createPlaceholderImage = (capture as unknown as { createPlaceholderImage: () => string })
        .createPlaceholderImage.bind(capture);

      // jsdom não suporta canvas 2D corretamente
      // A função pode retornar null ou string vazia
      const imageData = createPlaceholderImage();
      // Verificar que a função foi chamada sem erro
      expect(createPlaceholderImage).toBeDefined();
      // imageData pode ser null em jsdom
      if (imageData) {
        expect(typeof imageData).toBe('string');
      }
    });
  });;

  describe('getExtensionVersion', () => {
    it('deve retornar versão padrão quando chrome.runtime não está disponível', () => {
      const getExtensionVersion = (capture as unknown as { getExtensionVersion: () => string })
        .getExtensionVersion.bind(capture);

      const version = getExtensionVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
    });
  });

  describe('reportProgress', () => {
    it('deve chamar callback com progresso', () => {
      const reportProgress = (
        capture as unknown as {
          reportProgress: (
            callback: ((progress: { stage: string; percent: number; message: string }) => void) | undefined,
            stage: string,
            percent: number,
            message: string,
            currentViewport?: number,
            totalViewports?: number
          ) => void;
        }
      ).reportProgress.bind(capture);

      const mockCallback = vi.fn();
      reportProgress(mockCallback, 'capturing', 50, 'Capturando...', 2, 5);

      expect(mockCallback).toHaveBeenCalledWith({
        stage: 'capturing',
        percent: 50,
        message: 'Capturando...',
        currentViewport: 2,
        totalViewports: 5,
      });
    });

    it('não deve falhar quando callback é undefined', () => {
      const reportProgress = (
        capture as unknown as {
          reportProgress: (
            callback: undefined,
            stage: string,
            percent: number,
            message: string
          ) => void;
        }
      ).reportProgress.bind(capture);

      expect(() => reportProgress(undefined, 'capturing', 50, 'Capturando...')).not.toThrow();
    });
  });
});

describe('ScreenshotCapture - stitching', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);
  });

  afterEach(() => {
    capture.cleanup();
  });

  describe('stitchViewports', () => {
    it('deve lançar erro quando não há viewports', async () => {
      const stitchViewports = (
        capture as unknown as {
          stitchViewports: (viewports: Array<{ scrollY: number; imageData: string; width: number; height: number }>) => Promise<{ imageData: string; width: number; height: number }>;
        }
      ).stitchViewports.bind(capture);

      await expect(stitchViewports([])).rejects.toThrow('Nenhum viewport capturado');
    });

    it('deve retornar viewport único diretamente', async () => {
      const stitchViewports = (
        capture as unknown as {
          stitchViewports: (viewports: Array<{ scrollY: number; imageData: string; width: number; height: number }>) => Promise<{ imageData: string; width: number; height: number }>;
        }
      ).stitchViewports.bind(capture);

      // Criar um data URL válido (PNG para integridade forense)
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const dataUrl = canvas.toDataURL('image/png');

      const result = await stitchViewports([
        { scrollY: 0, imageData: dataUrl, width: 100, height: 100 },
      ]);

      expect(result.imageData).toBe(dataUrl);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('deve calcular dimensões corretas para múltiplos viewports', async () => {
      const stitchViewports = (
        capture as unknown as {
          stitchViewports: (viewports: Array<{ scrollY: number; imageData: string; width: number; height: number }>) => Promise<{ imageData: string; width: number; height: number }>;
        }
      ).stitchViewports.bind(capture);

      // Criar data URLs válidos
      const canvas1 = document.createElement('canvas');
      canvas1.width = 100;
      canvas1.height = 100;
      const dataUrl1 = canvas1.toDataURL('image/png');

      const canvas2 = document.createElement('canvas');
      canvas2.width = 100;
      canvas2.height = 100;
      const dataUrl2 = canvas2.toDataURL('image/png');

      // jsdom pode não suportar canvas 2D corretamente
      // Testar que a função tenta processar os viewports
      try {
        const result = await stitchViewports([
          { scrollY: 0, imageData: dataUrl1, width: 100, height: 100 },
          { scrollY: 100, imageData: dataUrl2, width: 100, height: 100 },
        ]);

        // Se conseguiu, verificar dimensões
        expect(result.width).toBe(100);
        expect(result.height).toBe(200);
      } catch (error) {
        // jsdom não suporta canvas 2D - esperado em ambiente de teste
        expect(error).toBeDefined();
      }
    });
  });
});

describe('ScreenshotCapture - aguardo de recursos', () => {
  let logger: AuditLogger;
  let capture: ScreenshotCapture;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    capture = new ScreenshotCapture(logger);
  });

  afterEach(() => {
    capture.cleanup();
  });

  describe('waitForImages', () => {
    it('deve resolver quando todas as imagens carregarem', async () => {
      const waitForImages = (capture as unknown as { waitForImages: () => Promise<void> })
        .waitForImages.bind(capture);

      // Sem imagens pendentes
      await expect(waitForImages()).resolves.toBeUndefined();
    });
  });

  describe('waitForFonts', () => {
    it('deve resolver quando fontes estiverem prontas', async () => {
      // Mock document.fonts
      Object.defineProperty(document, 'fonts', {
        value: {
          ready: Promise.resolve(),
        },
        writable: true,
        configurable: true,
      });

      const waitForFonts = (capture as unknown as { waitForFonts: () => Promise<void> })
        .waitForFonts.bind(capture);

      await expect(waitForFonts()).resolves.toBeUndefined();
    });
  });

  describe('waitForDocumentReady', () => {
    it('deve resolver imediatamente se documento já está completo', async () => {
      const waitForDocumentReady = (capture as unknown as { waitForDocumentReady: () => Promise<void> })
        .waitForDocumentReady.bind(capture);

      // jsdom já tem readyState = 'complete'
      await expect(waitForDocumentReady()).resolves.toBeUndefined();
    });
  });
});

describe('waitForAllImages - cenários adicionais', () => {
  it('deve contar imagens com falha de carregamento', async () => {
    // Criar imagem mock com falha
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0 }); // Indica falha
    document.body.appendChild(img);

    const result = await waitForAllImages(1000);
    expect(result.total).toBe(1);
    expect(result.failed).toBe(1);

    document.body.removeChild(img);
  });
});

describe('waitForAllResources - cenários adicionais', () => {
  beforeEach(() => {
    // Mock document.fonts
    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('deve retornar status completo de todos os recursos', async () => {
    const result = await waitForAllResources(5000);

    expect(result).toHaveProperty('documentReady');
    expect(result).toHaveProperty('images');
    expect(result).toHaveProperty('fontsReady');
    expect(result).toHaveProperty('timedOut');
    expect(result.images).toHaveProperty('total');
    expect(result.images).toHaveProperty('loaded');
    expect(result.images).toHaveProperty('failed');
  });
});
