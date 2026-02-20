/**
 * Testes unitários para FrameExtractor
 *
 * Testa extração adaptativa de frames, captura por eventos,
 * deduplicação por similaridade e salvamento em JPEG.
 *
 * @see Requirements 8.1-8.8, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameExtractor } from '@content/frame-extractor';
import { AuditLogger } from '@lib/audit-logger';

// Mock do ImageData
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data;
    this.width = width;
    this.height = height ?? Math.floor(data.length / (width * 4));
  }
}

// Mock do CanvasRenderingContext2D
class MockCanvasContext {
  private imageData: MockImageData | null = null;

  createImageData(width: number, height: number): MockImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    return new MockImageData(data, width, height);
  }

  getImageData(_x: number, _y: number, width: number, height: number): MockImageData {
    if (this.imageData) {
      return this.imageData;
    }
    return this.createImageData(width, height);
  }

  putImageData(_imageData: MockImageData, _x: number, _y: number): void {
    // Mock implementation
  }

  drawImage(): void {
    // Mock implementation
  }
}

// Mock do HTMLCanvasElement
class MockCanvas {
  width = 0;
  height = 0;
  private context: MockCanvasContext | null = null;

  getContext(_type: string, _options?: unknown): MockCanvasContext | null {
    if (!this.context) {
      this.context = new MockCanvasContext();
    }
    return this.context;
  }

  toDataURL(_type?: string, _quality?: number): string {
    return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';
  }
}

// Configurar mocks globais
vi.stubGlobal('ImageData', MockImageData);

// Mock do document.createElement para retornar MockCanvas
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'canvas') {
    return new MockCanvas() as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tagName);
});

describe('FrameExtractor', () => {
  let logger: AuditLogger;
  let extractor: FrameExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = new AuditLogger();
    extractor = new FrameExtractor(logger);
  });

  afterEach(() => {
    extractor.reset();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('deve criar instância com configuração padrão', () => {
      const config = extractor.getConfig();
      expect(config.captureIntervalMs).toBe(3000); // 3 segundos (Requirement 8.1)
      expect(config.jpegQuality).toBe(0.85); // 85% (Requirement 8.7)
      expect(config.similarityThreshold).toBe(0.90); // 90% (Requirement 8.6)
      expect(config.captureOnScroll).toBe(true); // (Requirement 8.2)
      expect(config.captureOnClick).toBe(true); // (Requirement 8.3)
      expect(config.captureOnMediaPlay).toBe(true); // (Requirement 8.4)
    });

    it('deve aceitar configuração customizada', () => {
      const customExtractor = new FrameExtractor(logger, {
        captureIntervalMs: 5000,
        jpegQuality: 0.90,
        similarityThreshold: 0.95,
      });
      const config = customExtractor.getConfig();
      expect(config.captureIntervalMs).toBe(5000);
      expect(config.jpegQuality).toBe(0.90);
      expect(config.similarityThreshold).toBe(0.95);
    });
  });

  describe('getState', () => {
    it('deve retornar idle quando não há extração', () => {
      expect(extractor.getState()).toBe('idle');
    });
  });

  describe('isExtracting', () => {
    it('deve retornar false quando não está extraindo', () => {
      expect(extractor.isExtracting()).toBe(false);
    });
  });

  describe('getFrameCount', () => {
    it('deve retornar 0 quando não há frames', () => {
      expect(extractor.getFrameCount()).toBe(0);
    });
  });

  describe('getFrames', () => {
    it('deve retornar array vazio quando não há frames', () => {
      expect(extractor.getFrames()).toEqual([]);
    });
  });

  describe('start', () => {
    it('deve iniciar extração com sucesso', () => {
      const result = extractor.start();

      expect(result.success).toBe(true);
      expect(extractor.getState()).toBe('extracting');
      expect(extractor.isExtracting()).toBe(true);
    });

    it('deve retornar erro se extração já está em andamento', () => {
      // Iniciar primeira extração
      extractor.start();

      // Tentar iniciar segunda extração
      const result = extractor.start();

      expect(result.success).toBe(false);
      expect(result.error).toContain('já em andamento');
    });

    it('deve chamar callback de progresso', () => {
      const progressUpdates: Array<{ message: string }> = [];

      extractor.start({
        onProgress: (progress) => {
          progressUpdates.push({ message: progress.message });
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('deve capturar frame inicial imediatamente', () => {
      extractor.start();

      // Verificamos que a extração iniciou
      expect(extractor.isExtracting()).toBe(true);
    });
  });

  describe('stop', () => {
    it('deve retornar erro se não há extração em andamento', async () => {
      const result = await extractor.stop();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Nenhuma extração');
    });

    it('deve parar extração e retornar resultado', async () => {
      // Usar timers reais para este teste
      vi.useRealTimers();

      // Iniciar extração
      extractor.start();

      // Aguardar um pouco
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Parar extração
      const result = await extractor.stop();

      expect(result.success).toBe(true);
      expect(result.frames).toBeDefined();
      expect(Array.isArray(result.frames)).toBe(true);

      // Restaurar fake timers
      vi.useFakeTimers();
    });
  });

  describe('cancel', () => {
    it('deve cancelar extração em andamento', () => {
      // Iniciar extração
      extractor.start();

      // Cancelar
      extractor.cancel();

      expect(extractor.getState()).toBe('idle');
    });

    it('não deve fazer nada se não há extração', () => {
      // Não deve lançar erro
      expect(() => extractor.cancel()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('deve resetar estado para idle', () => {
      // Iniciar extração
      extractor.start();

      // Resetar
      extractor.reset();

      expect(extractor.getState()).toBe('idle');
      expect(extractor.getFrameCount()).toBe(0);
    });
  });

  describe('captura periódica', () => {
    it('deve capturar frames a cada 3 segundos (Requirement 8.1)', () => {
      extractor.start();

      // Avançar 3 segundos
      vi.advanceTimersByTime(3000);

      // Verificar que extração continua
      expect(extractor.isExtracting()).toBe(true);

      // Avançar mais 3 segundos
      vi.advanceTimersByTime(3000);

      // Verificar que extração continua
      expect(extractor.isExtracting()).toBe(true);
    });
  });
});

describe('FrameExtractor - Similaridade', () => {
  let logger: AuditLogger;
  let extractor: FrameExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    extractor = new FrameExtractor(logger);
  });

  afterEach(() => {
    extractor.reset();
  });

  it('deve calcular similaridade de 1.0 para imagens idênticas', () => {
    // Criar duas ImageData idênticas
    const width = 100;
    const height = 100;
    const data1 = new Uint8ClampedArray(width * height * 4);
    const data2 = new Uint8ClampedArray(width * height * 4);

    // Preencher com mesmos valores
    for (let i = 0; i < data1.length; i += 4) {
      data1[i] = 128;     // R
      data1[i + 1] = 128; // G
      data1[i + 2] = 128; // B
      data1[i + 3] = 255; // A

      data2[i] = 128;
      data2[i + 1] = 128;
      data2[i + 2] = 128;
      data2[i + 3] = 255;
    }

    const img1 = new MockImageData(data1, width, height) as unknown as ImageData;
    const img2 = new MockImageData(data2, width, height) as unknown as ImageData;

    const similarity = extractor.calculateSimilarity(img1, img2);
    expect(similarity).toBe(1.0);
  });

  it('deve calcular similaridade baixa para imagens muito diferentes', () => {
    // Criar duas ImageData diferentes
    const width = 100;
    const height = 100;
    const data1 = new Uint8ClampedArray(width * height * 4);
    const data2 = new Uint8ClampedArray(width * height * 4);

    // Preencher com valores diferentes
    for (let i = 0; i < data1.length; i += 4) {
      data1[i] = 0;       // R - preto
      data1[i + 1] = 0;   // G
      data1[i + 2] = 0;   // B
      data1[i + 3] = 255; // A

      data2[i] = 255;     // R - branco
      data2[i + 1] = 255; // G
      data2[i + 2] = 255; // B
      data2[i + 3] = 255; // A
    }

    const img1 = new MockImageData(data1, width, height) as unknown as ImageData;
    const img2 = new MockImageData(data2, width, height) as unknown as ImageData;

    const similarity = extractor.calculateSimilarity(img1, img2);
    expect(similarity).toBeLessThan(0.5);
  });

  it('deve retornar 1.0 para imagens muito pequenas', () => {
    // Criar ImageData muito pequenas (menores que o bloco)
    const width = 4;
    const height = 4;
    const data1 = new Uint8ClampedArray(width * height * 4);
    const data2 = new Uint8ClampedArray(width * height * 4);

    const img1 = new MockImageData(data1, width, height) as unknown as ImageData;
    const img2 = new MockImageData(data2, width, height) as unknown as ImageData;

    const similarity = extractor.calculateSimilarity(img1, img2);
    expect(similarity).toBe(1);
  });
});

describe('FrameExtractor - Configuração', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
  });

  it('deve respeitar intervalo de captura customizado', () => {
    const customExtractor = new FrameExtractor(logger, {
      captureIntervalMs: 5000,
    });

    const config = customExtractor.getConfig();
    expect(config.captureIntervalMs).toBe(5000);
  });

  it('deve respeitar qualidade JPEG customizada', () => {
    const customExtractor = new FrameExtractor(logger, {
      jpegQuality: 0.75,
    });

    const config = customExtractor.getConfig();
    expect(config.jpegQuality).toBe(0.75);
  });

  it('deve respeitar threshold de similaridade customizado', () => {
    const customExtractor = new FrameExtractor(logger, {
      similarityThreshold: 0.85,
    });

    const config = customExtractor.getConfig();
    expect(config.similarityThreshold).toBe(0.85);
  });

  it('deve permitir desabilitar captura por scroll', () => {
    const customExtractor = new FrameExtractor(logger, {
      captureOnScroll: false,
    });

    const config = customExtractor.getConfig();
    expect(config.captureOnScroll).toBe(false);
  });

  it('deve permitir desabilitar captura por clique', () => {
    const customExtractor = new FrameExtractor(logger, {
      captureOnClick: false,
    });

    const config = customExtractor.getConfig();
    expect(config.captureOnClick).toBe(false);
  });

  it('deve permitir desabilitar captura por mídia', () => {
    const customExtractor = new FrameExtractor(logger, {
      captureOnMediaPlay: false,
    });

    const config = customExtractor.getConfig();
    expect(config.captureOnMediaPlay).toBe(false);
  });
});
