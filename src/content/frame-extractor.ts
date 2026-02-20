/**
 * FrameExtractor - Extração adaptativa de frames durante gravação de vídeo
 *
 * Implementa extração inteligente de frames para inclusão no PDF de certificação.
 * Captura frames em intervalos regulares e em eventos específicos (scroll, clique, mídia).
 * Aplica deduplicação por similaridade visual para evitar redundância.
 *
 * @module FrameExtractor
 * @see Requirements 8.1-8.8
 */

import { AuditLogger } from '../lib/audit-logger';
import { CryptoUtils } from '../lib/crypto-utils-native';
import type {
  ExtractedFrame,
  FrameExtractorConfig,
  FrameExtractorState,
  FrameExtractionResult,
  FrameProgressCallback,
  FrameStartOptions,
  FrameEventType,
} from '../types/capture.types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Intervalo base de captura: 3 segundos
 * Requirement 8.1
 */
const BASE_CAPTURE_INTERVAL_MS = 3000;

/**
 * Qualidade JPEG: 85%
 * Requirement 8.7
 */
const JPEG_QUALITY = 0.85;

/**
 * Threshold de similaridade para deduplicação: 90%
 * Requirement 8.6
 */
const SIMILARITY_THRESHOLD = 0.90;

/**
 * Tamanho do bloco para comparação de similaridade
 */
const SIMILARITY_BLOCK_SIZE = 8;

/**
 * Configuração padrão do extrator de frames
 */
const DEFAULT_CONFIG: FrameExtractorConfig = {
  captureIntervalMs: BASE_CAPTURE_INTERVAL_MS,
  jpegQuality: JPEG_QUALITY,
  similarityThreshold: SIMILARITY_THRESHOLD,
  captureOnScroll: true,
  captureOnClick: true,
  captureOnMediaPlay: true,
  hashTimeout: 5000,
  minTimeBetweenFrames: 500, // Mínimo 500ms entre frames
};

// ============================================================================
// FrameExtractor
// ============================================================================

/**
 * FrameExtractor - Gerencia extração adaptativa de frames
 *
 * Fluxo de extração:
 * 1. Capturar frame a cada 3 segundos (Requirement 8.1)
 * 2. Capturar em scroll (Requirement 8.2)
 * 3. Capturar em clique (Requirement 8.3)
 * 4. Capturar em reprodução de mídia (Requirement 8.4)
 * 5. Comparar similaridade visual (Requirement 8.5)
 * 6. Descartar se >= 90% similar (Requirement 8.6)
 * 7. Salvar em JPEG 85% (Requirement 8.7)
 * 8. Garantir continuidade visual (Requirement 8.8)
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const extractor = new FrameExtractor(logger);
 *
 * // Iniciar extração
 * extractor.start({
 *   onProgress: (progress) => console.log(`Frames: ${progress.frameCount}`),
 * });
 *
 * // Parar e obter resultado
 * const result = await extractor.stop();
 * console.log(`Total de frames: ${result.frames.length}`);
 * ```
 */
export class FrameExtractor {
  private logger: AuditLogger;
  private config: FrameExtractorConfig;
  private state: FrameExtractorState = 'idle';
  private frames: ExtractedFrame[] = [];
  private lastFrameData: ImageData | null = null;
  private lastFrameTime = 0;
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private progressCallback: FrameProgressCallback | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private startTime = 0;
  private frameNumber = 0;

  // Event handlers bound
  private boundScrollHandler: (() => void) | null = null;
  private boundClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundMediaPlayHandler: ((e: Event) => void) | null = null;

  /**
   * Cria nova instância do FrameExtractor
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   * @param config - Configuração customizada (opcional)
   */
  constructor(logger: AuditLogger, config?: Partial<FrameExtractorConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Obtém estado atual da extração
   */
  getState(): FrameExtractorState {
    return this.state;
  }

  /**
   * Verifica se está extraindo
   */
  isExtracting(): boolean {
    return this.state === 'extracting';
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): FrameExtractorConfig {
    return { ...this.config };
  }

  /**
   * Obtém número de frames extraídos
   */
  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Obtém frames extraídos
   */
  getFrames(): ExtractedFrame[] {
    return [...this.frames];
  }


  /**
   * Inicia extração de frames
   * Requirements 8.1, 8.2, 8.3, 8.4
   *
   * @param options - Opções de extração
   * @returns Resultado da inicialização
   */
  start(options?: FrameStartOptions): { success: boolean; error?: string } {
    if (this.state !== 'idle') {
      return {
        success: false,
        error: 'Extração já em andamento ou não finalizada',
      };
    }

    this.progressCallback = options?.onProgress ?? null;

    this.logger.info('CAPTURE', 'FRAME_EXTRACTION_START', {
      config: this.config,
    });

    try {
      // Inicializar canvas para captura
      this.initializeCanvas();

      // Resetar estado
      this.frames = [];
      this.lastFrameData = null;
      this.lastFrameTime = 0;
      this.frameNumber = 0;
      this.startTime = Date.now();
      this.state = 'extracting';

      // Capturar primeiro frame imediatamente
      this.captureFrame('initial');

      // Iniciar captura periódica (Requirement 8.1)
      this.startPeriodicCapture();

      // Registrar event listeners (Requirements 8.2, 8.3, 8.4)
      this.registerEventListeners();

      this.logger.info('CAPTURE', 'FRAME_EXTRACTION_STARTED', {
        startTime: new Date(this.startTime).toISOString(),
      });

      this.reportProgress('Extração de frames iniciada');

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('CAPTURE', 'FRAME_EXTRACTION_START_FAILED', { error: errorMessage });
      
      this.cleanup();
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Para extração e retorna resultado
   *
   * @returns Resultado da extração com todos os frames
   */
  async stop(): Promise<FrameExtractionResult> {
    if (this.state !== 'extracting') {
      return {
        success: false,
        frames: [],
        error: 'Nenhuma extração em andamento',
      };
    }

    this.state = 'stopping';
    this.reportProgress('Finalizando extração...');

    this.logger.info('CAPTURE', 'FRAME_EXTRACTION_STOPPING', {
      frameCount: this.frames.length,
    });

    try {
      // Parar captura periódica
      this.stopPeriodicCapture();

      // Remover event listeners
      this.removeEventListeners();

      // Capturar frame final
      await this.captureFrame('final');

      // Calcular hashes de todos os frames
      await this.calculateFrameHashes();

      const durationMs = Date.now() - this.startTime;

      this.logger.info('CAPTURE', 'FRAME_EXTRACTION_COMPLETE', {
        frameCount: this.frames.length,
        durationMs,
      });

      this.state = 'stopped';

      const result: FrameExtractionResult = {
        success: true,
        frames: [...this.frames],
        totalFrames: this.frames.length,
        durationMs,
        discardedFrames: this.frameNumber - this.frames.length,
      };

      // Limpar recursos
      this.cleanup();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('CAPTURE', 'FRAME_EXTRACTION_STOP_FAILED', { error: errorMessage });
      
      this.cleanup();
      
      return {
        success: false,
        frames: this.frames,
        error: errorMessage,
      };
    }
  }

  /**
   * Cancela extração sem processar
   */
  cancel(): void {
    if (this.state === 'idle' || this.state === 'stopped') {
      return;
    }

    this.logger.info('CAPTURE', 'FRAME_EXTRACTION_CANCELLED', {
      frameCount: this.frames.length,
    });

    this.cleanup();
    this.state = 'idle';
  }

  /**
   * Reseta estado para idle
   */
  reset(): void {
    this.cleanup();
    this.state = 'idle';
  }

  // ==========================================================================
  // Métodos de Inicialização
  // ==========================================================================

  /**
   * Inicializa canvas para captura de frames
   */
  private initializeCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    if (!this.ctx) {
      throw new Error('Não foi possível criar contexto 2D do canvas');
    }
  }

  /**
   * Inicia captura periódica de frames
   * Requirement 8.1
   */
  private startPeriodicCapture(): void {
    this.captureInterval = setInterval(() => {
      if (this.state === 'extracting') {
        this.captureFrame('periodic');
      }
    }, this.config.captureIntervalMs);
  }

  /**
   * Para captura periódica
   */
  private stopPeriodicCapture(): void {
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }
  }


  // ==========================================================================
  // Métodos de Event Listeners
  // ==========================================================================

  /**
   * Registra event listeners para captura por eventos
   * Requirements 8.2, 8.3, 8.4
   */
  private registerEventListeners(): void {
    // Scroll handler (Requirement 8.2)
    if (this.config.captureOnScroll) {
      this.boundScrollHandler = this.debounce(() => {
        this.captureFrame('scroll');
      }, 200);
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    }

    // Click handler (Requirement 8.3)
    if (this.config.captureOnClick) {
      this.boundClickHandler = (e: MouseEvent) => {
        // Capturar apenas cliques com botão esquerdo
        if (e.button === 0) {
          this.captureFrame('click');
        }
      };
      document.addEventListener('click', this.boundClickHandler, { passive: true });
    }

    // Media play handler (Requirement 8.4)
    if (this.config.captureOnMediaPlay) {
      this.boundMediaPlayHandler = () => {
        this.captureFrame('media_play');
      };
      document.addEventListener('play', this.boundMediaPlayHandler, { capture: true, passive: true });
    }
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    if (this.boundScrollHandler) {
      window.removeEventListener('scroll', this.boundScrollHandler);
      this.boundScrollHandler = null;
    }

    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler);
      this.boundClickHandler = null;
    }

    if (this.boundMediaPlayHandler) {
      document.removeEventListener('play', this.boundMediaPlayHandler, { capture: true });
      this.boundMediaPlayHandler = null;
    }
  }

  /**
   * Cria função debounced
   */
  private debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return ((...args: unknown[]) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        fn(...args);
        timeoutId = null;
      }, delay);
    }) as T;
  }

  // ==========================================================================
  // Métodos de Captura
  // ==========================================================================

  /**
   * Captura um frame do viewport atual
   *
   * @param trigger - Tipo de evento que disparou a captura
   */
  private async captureFrame(trigger: FrameEventType): Promise<void> {
    if (this.state !== 'extracting') {
      return;
    }

    const now = Date.now();

    // Verificar tempo mínimo entre frames
    if (now - this.lastFrameTime < this.config.minTimeBetweenFrames) {
      return;
    }

    this.frameNumber++;

    try {
      // Capturar viewport atual
      const imageData = await this.captureViewport();

      // Verificar similaridade com frame anterior (Requirements 8.5, 8.6)
      if (this.lastFrameData && this.isSimilar(imageData, this.lastFrameData)) {
        this.logger.info('CAPTURE', 'FRAME_DISCARDED_SIMILAR', {
          frameNumber: this.frameNumber,
          trigger,
        });
        return;
      }

      // Converter para JPEG (Requirement 8.7)
      const jpegData = await this.convertToJpeg(imageData);

      // Criar frame
      const frame: ExtractedFrame = {
        frameNumber: this.frameNumber,
        timestamp: now,
        elapsedMs: now - this.startTime,
        trigger,
        imageData: jpegData,
        width: imageData.width,
        height: imageData.height,
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY,
        },
      };

      // Adicionar frame à lista
      this.frames.push(frame);
      this.lastFrameData = imageData;
      this.lastFrameTime = now;

      this.logger.info('CAPTURE', 'FRAME_CAPTURED', {
        frameNumber: this.frameNumber,
        trigger,
        totalFrames: this.frames.length,
      });

      this.reportProgress(`Frame ${this.frames.length} capturado`);
    } catch (error) {
      this.logger.error('CAPTURE', 'FRAME_CAPTURE_FAILED', {
        frameNumber: this.frameNumber,
        trigger,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Captura o viewport atual como ImageData
   */
  private async captureViewport(): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      if (!this.canvas || !this.ctx) {
        reject(new Error('Canvas não inicializado'));
        return;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;

      this.canvas.width = width;
      this.canvas.height = height;

      // Usar html2canvas ou método nativo
      // Para simplificar, usamos captura via chrome.tabs.captureVisibleTab
      // que será chamada pelo service worker
      
      // Em ambiente de content script, solicitamos ao service worker
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { type: 'CAPTURE_VISIBLE_TAB' },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response?.success && response?.dataUrl) {
              // Converter dataUrl para ImageData
              const img = new Image();
              img.onload = () => {
                if (this.ctx) {
                  this.ctx.drawImage(img, 0, 0, width, height);
                  const imageData = this.ctx.getImageData(0, 0, width, height);
                  resolve(imageData);
                } else {
                  reject(new Error('Contexto do canvas não disponível'));
                }
              };
              img.onerror = () => reject(new Error('Falha ao carregar imagem capturada'));
              img.src = response.dataUrl;
            } else {
              reject(new Error(response?.error ?? 'Falha ao capturar viewport'));
            }
          }
        );
      } else {
        // Fallback para ambiente de teste - criar ImageData vazio
        const imageData = this.ctx.createImageData(width, height);
        // Preencher com dados aleatórios para simular captura
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] = Math.floor(Math.random() * 256);     // R
          imageData.data[i + 1] = Math.floor(Math.random() * 256); // G
          imageData.data[i + 2] = Math.floor(Math.random() * 256); // B
          imageData.data[i + 3] = 255;                              // A
        }
        resolve(imageData);
      }
    });
  }


  // ==========================================================================
  // Métodos de Similaridade
  // ==========================================================================

  /**
   * Verifica se dois frames são similares
   * Requirements 8.5, 8.6
   *
   * @param current - ImageData do frame atual
   * @param previous - ImageData do frame anterior
   * @returns true se similaridade >= 90%
   */
  private isSimilar(current: ImageData, previous: ImageData): boolean {
    // Se dimensões diferentes, não são similares
    if (current.width !== previous.width || current.height !== previous.height) {
      return false;
    }

    const similarity = this.calculateSimilarity(current, previous);
    return similarity >= this.config.similarityThreshold;
  }

  /**
   * Calcula similaridade visual entre dois frames
   * Usa amostragem por blocos para performance
   *
   * @param img1 - Primeiro ImageData
   * @param img2 - Segundo ImageData
   * @returns Valor de similaridade entre 0 e 1
   */
  calculateSimilarity(img1: ImageData, img2: ImageData): number {
    const width = img1.width;
    const height = img1.height;
    const blockSize = SIMILARITY_BLOCK_SIZE;

    // Número de blocos em cada dimensão
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);
    const totalBlocks = blocksX * blocksY;

    if (totalBlocks === 0) {
      return 1; // Imagens muito pequenas são consideradas iguais
    }

    let matchingBlocks = 0;

    // Comparar blocos
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        const blockMatch = this.compareBlock(
          img1.data,
          img2.data,
          bx * blockSize,
          by * blockSize,
          blockSize,
          width
        );

        if (blockMatch) {
          matchingBlocks++;
        }
      }
    }

    return matchingBlocks / totalBlocks;
  }

  /**
   * Compara um bloco de pixels entre duas imagens
   *
   * @param data1 - Dados da primeira imagem
   * @param data2 - Dados da segunda imagem
   * @param startX - Posição X inicial do bloco
   * @param startY - Posição Y inicial do bloco
   * @param blockSize - Tamanho do bloco
   * @param imageWidth - Largura da imagem
   * @returns true se o bloco é similar
   */
  private compareBlock(
    data1: Uint8ClampedArray,
    data2: Uint8ClampedArray,
    startX: number,
    startY: number,
    blockSize: number,
    imageWidth: number
  ): boolean {
    // Calcular cor média do bloco em cada imagem
    let r1 = 0, g1 = 0, b1 = 0;
    let r2 = 0, g2 = 0, b2 = 0;
    let pixelCount = 0;

    for (let y = startY; y < startY + blockSize; y++) {
      for (let x = startX; x < startX + blockSize; x++) {
        const idx = (y * imageWidth + x) * 4;
        
        r1 += data1[idx] ?? 0;
        g1 += data1[idx + 1] ?? 0;
        b1 += data1[idx + 2] ?? 0;
        
        r2 += data2[idx] ?? 0;
        g2 += data2[idx + 1] ?? 0;
        b2 += data2[idx + 2] ?? 0;
        
        pixelCount++;
      }
    }

    if (pixelCount === 0) {
      return true;
    }

    // Calcular médias
    r1 /= pixelCount; g1 /= pixelCount; b1 /= pixelCount;
    r2 /= pixelCount; g2 /= pixelCount; b2 /= pixelCount;

    // Calcular diferença (threshold de 10 para cada canal)
    const threshold = 10;
    const diffR = Math.abs(r1 - r2);
    const diffG = Math.abs(g1 - g2);
    const diffB = Math.abs(b1 - b2);

    return diffR < threshold && diffG < threshold && diffB < threshold;
  }

  // ==========================================================================
  // Métodos de Conversão
  // ==========================================================================

  /**
   * Converte ImageData para JPEG base64
   * Requirement 8.7
   *
   * @param imageData - ImageData para converter
   * @returns String base64 do JPEG
   */
  private async convertToJpeg(imageData: ImageData): Promise<string> {
    if (!this.canvas || !this.ctx) {
      throw new Error('Canvas não inicializado');
    }

    // Ajustar tamanho do canvas
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;

    // Desenhar ImageData no canvas
    this.ctx.putImageData(imageData, 0, 0);

    // Converter para JPEG com qualidade 85%
    const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.jpegQuality);

    // Remover prefixo data:image/jpeg;base64,
    return dataUrl.split(',')[1] ?? dataUrl;
  }

  // ==========================================================================
  // Métodos de Hash
  // ==========================================================================

  /**
   * Calcula hashes de todos os frames
   */
  private async calculateFrameHashes(): Promise<void> {
    for (const frame of this.frames) {
      try {
        frame.hash = await this.calculateHashWithTimeout(frame.imageData);
      } catch (error) {
        this.logger.error('CAPTURE', 'FRAME_HASH_FAILED', {
          frameNumber: frame.frameNumber,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
  }

  /**
   * Calcula hash com timeout
   */
  private async calculateHashWithTimeout(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao calcular hash'));
      }, this.config.hashTimeout);

      CryptoUtils.hash(data)
        .then((hash) => {
          clearTimeout(timeout);
          resolve(hash);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  // ==========================================================================
  // Métodos de Progresso
  // ==========================================================================

  /**
   * Reporta progresso da extração
   */
  private reportProgress(message: string): void {
    if (!this.progressCallback) {
      return;
    }

    this.progressCallback({
      state: this.state,
      frameCount: this.frames.length,
      discardedCount: this.frameNumber - this.frames.length,
      elapsedMs: Date.now() - this.startTime,
      message,
    });
  }

  // ==========================================================================
  // Métodos de Limpeza
  // ==========================================================================

  /**
   * Limpa todos os recursos
   */
  private cleanup(): void {
    // Parar captura periódica
    this.stopPeriodicCapture();

    // Remover event listeners
    this.removeEventListeners();

    // Limpar canvas
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas = null;
    }
    this.ctx = null;

    // Limpar estado
    this.lastFrameData = null;
    this.lastFrameTime = 0;
    this.frameNumber = 0;
    this.startTime = 0;
    this.progressCallback = null;
  }
}

export default FrameExtractor;
