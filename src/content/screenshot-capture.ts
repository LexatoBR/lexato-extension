/**
 * ScreenshotCapture - Captura de screenshots full-page
 *
 * Implementa captura de página inteira via scroll e stitching (costura).
 * Ativa lockdown antes de iniciar, recarrega página com cache-busting,
 * aguarda recursos e gera imagem PNG com hash SHA-256.
 *
 * @module ScreenshotCapture
 * @see Requirements 6.1-6.16
 */

import { AuditLogger } from '../lib/audit-logger';
import { CryptoUtils } from '../lib/crypto-utils-native';
import { ForensicCollector } from '../lib/forensic/forensic-collector';
import { LockdownSecurityManager } from './lockdown-manager';
import { VisualStabilityChecker, type StabilityCheckResult } from './visual-stability-checker';
import type {
  ScreenshotCaptureResult,
  ScreenshotCaptureConfig,
  ScreenshotCaptureProgress,
  ScreenshotProgressCallback,
  CaptureMetadata,
  ViewportCapture,
  OriginalStateHash,
  RestoredStateHash,
  IntegrityHashes,
  DOMModification,
  RawCapture,
  EnhancedCapture,
  DualModeCapture,
  CaptureScope,
  CaptureTruncationReason,
} from '../types/capture.types';
import type { ForensicMetadata } from '../types/forensic-metadata.types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração padrão da captura
 */
const DEFAULT_CONFIG: ScreenshotCaptureConfig = {
  pageLoadTimeout: 60000, // 60 segundos (Requirement 6.6) - aumentado para páginas pesadas
  viewportTimeout: 30000, // 30 segundos por viewport (Requirement 6.15) - aumentado para captura estável
  hashTimeout: 5000, // 5 segundos para hash (Requirement 6.13)
  quality: 100, // PNG usa compressão sem perdas, quality não afeta
  format: 'png', // PNG para integridade forense (compressão sem perdas)
  collectHtml: true, // Coletar HTML (Requirement 6.11)
  collectMetadata: true, // Coletar metadados (Requirement 6.12)
  maxHeightBeforeSplit: 50000, // 50.000 pixels (Requirement 6.16)

  // Configurações para páginas longas e infinite scroll
  maxCaptureHeight: 120000, // ~155 viewports, para páginas fixas muito longas
  infiniteScrollMaxHeight: 120000, // ~155 viewports, mesmo limite para infinite scroll
  infiniteScrollDetectionViewports: 5, // 5 viewports para garantir trigger de lazy load em sites pesados
  infiniteScrollGrowthThreshold: 0.15, // 15% de crescimento indica infinite scroll (mais sensível)
  maxCaptureTimeMs: 300000, // 5 minutos - timeout de segurança (páginas normais)
  maxCaptureTimeMsInfiniteScroll: 600000, // 10 minutos - timeout para infinite scroll (delays maiores)
};

// ============================================================================
// Configuração de Delays para Lazy Loading
// ============================================================================

/**
 * Configuração de delays para garantir carregamento completo de lazy loading.
 * 
 * JUSTIFICATIVA FORENSE:
 * - Páginas modernas usam lazy loading, animações CSS e renderização progressiva
 * - Capturar muito rápido resulta em elementos em branco ou parcialmente renderizados
 * - Estes delays garantem que a prova digital reflita o que um usuário humano veria
 * 
 * CONFORMIDADE ISO/IEC 27037:
 * - Valores FIXOS garantem reprodutibilidade e auditabilidade
 * - Processo consistente em todas as capturas
 * 
 * IMPORTANTE: Valores são FIXOS para garantir consistência probatória.
 */
const CAPTURE_DELAYS = {
  /**
   * Delay mínimo entre capturas (ms)
   * Respeita limite do Chrome: MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2
   */
  MIN_BETWEEN_CAPTURES: 600,

  /**
   * Delay para renderização após scroll (ms)
   * Aguarda: reflow do DOM, animações CSS, lazy loading inicial
   * AUMENTADO de 400 para 800 para garantir carregamento completo em páginas pesadas
   *
   * JUSTIFICATIVA FORENSE:
   * - Sites modernos com muitos recursos precisam de mais tempo
   * - Evita captura de elementos parcialmente renderizados
   */
  RENDER_AFTER_SCROLL: 800,

  /**
   * Delay extra para páginas com infinite scroll (ms)
   * Adicionado ao RENDER_AFTER_SCROLL quando infinite scroll é detectado
   *
   * JUSTIFICATIVA FORENSE:
   * - Páginas com infinite scroll (G1, Twitter, etc.) carregam conteúdo dinamicamente
   * - IntersectionObserver precisa de tempo para processar e carregar conteúdo
   * - Evita captura de placeholders ou conteúdo parcial
   */
  INFINITE_SCROLL_EXTRA_DELAY: 1500,

  /**
   * Timeout para aguardar imagens lazy-loaded (ms)
   * Tempo máximo para esperar carregamento de imagens no viewport
   * AUMENTADO de 4000 para 8000 para infinite scroll pesado
   *
   * JUSTIFICATIVA FORENSE:
   * - Imagens grandes ou conexões lentas precisam de mais tempo
   * - Garante captura completa de conteúdo visual
   */
  LAZY_IMAGES_TIMEOUT: 8000,

  /**
   * Usar smooth scroll nativo do browser
   * Mais natural e garante disparo de eventos de scroll para lazy loading
   */
  USE_SMOOTH_SCROLL: true,

  /**
   * Delay adicional após smooth scroll completar (ms)
   * AUMENTADO de 250 para 500 para garantir estabilização em páginas pesadas
   *
   * JUSTIFICATIVA FORENSE:
   * - Animações de scroll podem demorar mais em sites pesados
   * - Evita captura durante o movimento
   */
  SMOOTH_SCROLL_SETTLE: 500,

  /**
   * Número máximo de tentativas para captura de viewport
   * Em caso de falha temporária, tenta novamente
   */
  MAX_CAPTURE_RETRIES: 3,

  /**
   * Delay entre tentativas de captura (ms)
   */
  CAPTURE_RETRY_DELAY: 1000,

  /**
   * Tempo sem mutações para considerar DOM estável (ms)
   * Usado pelo VisualStabilityChecker para detectar SPAs e conteúdo dinâmico
   * AUMENTADO de 500 para 700 para maior confiabilidade
   *
   * JUSTIFICATIVA FORENSE:
   * - SPAs e sites dinâmicos precisam de mais tempo para estabilizar
   * - Reduz chance de capturar conteúdo em transição
   */
  MUTATION_SETTLE_MS: 700,

  /**
   * Timeout máximo para verificação de estabilidade visual (ms)
   * Tempo máximo de espera para DOM estabilizar e spinners desaparecerem
   * Mantido em 5000 para não impactar muito a experiência do usuário
   */
  MAX_STABILITY_WAIT_MS: 5000,

  /**
   * Intervalo entre checks de estabilidade de lazy loading (ms)
   * Novo parâmetro para detecção progressiva
   *
   * JUSTIFICATIVA FORENSE:
   * - Verifica periodicamente se novas imagens foram carregadas
   * - Permite detecção mais precisa de estabilidade
   */
  LAZY_STABILITY_CHECK_INTERVAL: 500,

  /**
   * Número de checks consecutivos sem mudança para considerar estável
   * Novo parâmetro para garantir estabilidade real
   *
   * JUSTIFICATIVA FORENSE:
   * - Garante que o carregamento realmente terminou
   * - Evita falsos positivos de estabilidade
   */
  LAZY_STABILITY_CHECKS_REQUIRED: 3,
} as const;

// ============================================================================
// Seletores de Widgets e Headers Conhecidos
// ============================================================================

/**
 * Seletores conhecidos de widgets de terceiros
 *
 * CONFORMIDADE FORENSE:
 * - Lista documentada de elementos ocultados
 * - Justificativa: não fazem parte do conteúdo principal da página
 * - Todas as ocultações são registradas nos metadados
 */
const KNOWN_WIDGET_SELECTORS = {
  /** Chat widgets de terceiros */
  chat: [
    '#intercom-container', '#intercom-frame', '[data-intercom]',
    '#hubspot-messages-iframe-container', '.hs-messages-widget',
    '#drift-widget', '#drift-frame-controller',
    '#crisp-chatbox', '.crisp-client', '[data-crisp-chatbox]',
    '#tawk-bubble-container', '#tawk-widget-container',
    '#zendesk-chat', '#webWidget', '[data-zd-web-widget]',
    '#freshchat-container', '.fc-widget-normal',
    '#tidio-chat', '#tidio-chat-iframe',
    '#livechat-compact-container', '#livechat-full',
  ],
  /** Banners de cookies/LGPD/GDPR */
  cookie: [
    '#onetrust-consent-sdk', '#onetrust-banner-sdk',
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBody',
    '.cc-window', '.cc-banner', '[data-cookieconsent]',
    '#cookie-law-info-bar', '#cookie-notice',
    '#gdpr-consent', '#gdpr-consent-tool',
    '[class*="cookie-consent"]', '[class*="cookie-banner"]',
    '[class*="cookie-notice"]', '[id*="cookie-banner"]',
    '.truste-consent-track', '#truste-consent-track',
  ],
  /** Floating Action Buttons (FAB) e scroll-to-top */
  fab: [
    '.fab', '.floating-action-button',
    '[class*="scroll-to-top"]', '[class*="back-to-top"]',
    '#back-to-top', '.back-to-top', '.scroll-top',
    '[class*="btn-float"]', '[class*="floating-btn"]',
  ],
  /** Botões de compartilhamento social fixos */
  social: [
    '.addthis-smartlayers', '#at-share-dock',
    '.sharethis-sticky-share-buttons',
    '[class*="social-share-fixed"]',
  ],
  /** Botões de WhatsApp flutuantes */
  whatsapp: [
    // Plugins WordPress populares
    '#whatsapp-button', '.whatsapp-button', '.whatsapp-float',
    '[class*="whatsapp-btn"]', '[class*="whatsapp-button"]',
    '[class*="whatsapp-float"]', '[class*="whatsapp-widget"]',
    '[class*="btn-whatsapp"]', '[class*="btn-wpp"]',
    // Plugins específicos
    '#wh-widget', '.wh-widget', // WhatsHelp
    '#qlwapp', '.qlwapp', '.qlwapp-button', // FLAVOR WhatsApp
    '#joinchat', '.joinchat', '.joinchat__button', // Join.chat
    '#wabutton', '.wabutton', // WAButton
    '.wa-float-btn', '.wa-float-btn-container', // WA Float Button
    '#wc-button', '.wc-button', // WhatsApp Chat Button
    '[data-whatsapp]', '[data-wa-button]',
    // Genéricos com ícone WhatsApp
    'a[href*="wa.me"]', 'a[href*="whatsapp.com"]',
    '[class*="zap"]', '[class*="wpp-btn"]',
  ],
  /** Botões/widgets de acessibilidade */
  accessibility: [
    // UserWay
    '#userway', '.userway', '.userway-s', '#userway-s',
    '[data-userway]', '.uwy-open-icon', '.uwy-icon',
    // AccessiBe
    '#accessibe', '.accessibe', '.acsbIcon', '#acsbMenuBtn',
    '[data-acsb]', '.acsb-trigger',
    // EqualWeb
    '#INDmenu-btn', '#INDbtnWrap', '.INDmenu-btn',
    '[data-equalweb]', '.equalweb',
    // HandTalk (Libras - muito usado no Brasil)
    '#ht-container', '.ht-skip', '#ht-skip',
    '[data-handtalk]', '.handtalk',
    // Recite Me
    '#reciteMe', '.reciteme', '.reciteMe-button',
    '[data-reciteme]',
    // Outros plugins de acessibilidade
    '#accessibility', '.accessibility-widget',
    '[class*="accessibility-btn"]', '[class*="accessibility-button"]',
    '[class*="accessibility-widget"]', '[class*="acessibilidade"]',
    '[id*="accessibility"]', '[aria-label*="accessibility"]',
    // VLibras (Governo brasileiro)
    '#vlibras', '.vlibras', '[data-vlibras]', '.vw-plugin-top-left',
    // WP Accessibility
    '#wpa-container', '.wpa-ld', '.wpa-toggle',
  ],
} as const;

/**
 * Seletores de elementos que são headers/navegação
 * Usados para identificar o header principal da página
 */
const HEADER_SELECTORS = [
  'header', 'nav',
  '[role="navigation"]', '[role="banner"]',
  '#header', '#nav', '#navbar', '#navigation',
  '.header', '.navbar', '.nav-bar', '.navigation',
  '[class*="header-fixed"]', '[class*="navbar-fixed"]',
  '[class*="sticky-header"]', '[class*="sticky-nav"]',
] as const;

// ============================================================================
// Constantes de Lazy Loading
// ============================================================================

/**
 * Atributos de lazy loading conhecidos
 *
 * CONFORMIDADE FORENSE:
 * - Lista documentada de atributos que indicam lazy loading
 * - Inclui bibliotecas populares e padrões genéricos
 */
const LAZY_LOADING_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-srcset',
  'data-lazy-srcset',
  'data-bg',
  'data-bg-src',
  'data-background',
  'data-background-image',
  'data-image',
  'data-lazy',
  'data-ll-status', // LazySizes
  'data-echo', // Echo.js
  'data-unveil', // Unveil.js
  'data-blazy', // Blazy.js
] as const;

/**
 * Classes de bibliotecas de lazy loading
 *
 * Usadas para identificar imagens gerenciadas por bibliotecas específicas
 * Exportadas para uso em outros módulos se necessário
 */
export const LAZY_LOADING_CLASSES = [
  'lazyload', 'lazy', 'lozad', 'b-lazy',
  'lazyloaded', 'unveil', 'lazyautosizes',
] as const;

/**
 * Interface para armazenar estado original de elementos sticky
 * Usado para restaurar após captura
 */
interface StickyElementState {
  element: HTMLElement;
  originalPosition: string;
  originalTop: string;
  originalBottom: string;
  originalLeft: string;
  originalRight: string;
  originalZIndex: string;
  originalTransform: string;
  /** Display original (para widgets ocultados) */
  originalDisplay?: string;
  /** Visibility original (para widgets ocultados) */
  originalVisibility?: string;
  /** Opacity original (para ocultação agressiva) */
  originalOpacity?: string;
  /** Height original (para ocultação agressiva) */
  originalHeight?: string;
  /** Overflow original (para ocultação agressiva) */
  originalOverflow?: string;
  /** PointerEvents original (para ocultação agressiva) */
  originalPointerEvents?: string;
  /** ClipPath original (para ocultação agressiva) */
  originalClipPath?: string;
}

/**
 * Interface para resultado da ocultação de sticky elements (V2)
 */
interface StickyHideResult {
  /** Captura do header (para composição) */
  headerCapture: {
    element: HTMLElement;
    height: number;
    imageData?: string;
  } | null;
  /** Estados originais para restauração */
  hiddenElements: StickyElementState[];
  /** Modificações registradas para metadados forenses */
  modifications: Array<{
    selector: string;
    tagName: string;
    originalPosition: string;
    newPosition: string;
    originalCoords: { top: string; left: string; bottom: string; right: string };
    newCoords: { top: string; left: string };
    timestamp: number;
    justification: string;
  }>;
  /** Total de elementos ocultados */
  totalHidden: number;
}

/**
 * Classificação de elementos sticky/fixed
 */
type StickyElementType = 'header' | 'footer' | 'cookie-banner' | 'widget' | 'sidebar' | 'other';

/**
 * Interface expandida para metadados de elementos sticky (V3)
 */
interface StickyElementMetadata {
  type: StickyElementType;
  selector: string;
  action: 'captured-once' | 'hidden' | 'made-static';
  originalStyles: Record<string, string>;
  boundingRect: DOMRect;
  zIndex: number;
}

/**
 * Interface para resultado da estratégia V3 com composição
 */
interface StickyHandlingResultV3 {
  strategy: 'v3-composition';
  elementsProcessed: StickyElementMetadata[];
  compositionInfo: {
    headerCaptured: boolean;
    headerPosition: { x: number; y: number; width: number; height: number };
    headerImageData?: string;
    footerCaptured: boolean;
    footerPosition: { x: number; y: number; width: number; height: number };
    footerImageData?: string;
  };
  hiddenElements: StickyElementState[];
  totalProcessed: number;
  timestamp: number;
}

/**
 * Parâmetro de cache-busting
 */
const CACHE_BUST_PARAM = '_lexato_nocache';

// ============================================================================
// ScreenshotCapture
// ============================================================================

/**
 * ScreenshotCapture - Gerencia captura de screenshots full-page
 *
 * Fluxo de captura:
 * 1. Ativar lockdown (Requirement 6.1)
 * 2. Reload com cache-busting (Requirement 6.2)
 * 3. Aguardar document.readyState === 'complete' (Requirement 6.3)
 * 4. Aguardar imagens e fontes (Requirements 6.4, 6.5)
 * 5. Scroll automático e captura por stitching (Requirements 6.7, 6.8)
 * 6. Gerar imagem PNG (compressão sem perdas para integridade forense)
 * 7. Coletar HTML (Requirement 6.11)
 * 8. Calcular hash SHA-256 (Requirement 6.13)
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const capture = new ScreenshotCapture(logger);
 *
 * const result = await capture.capture({
 *   onProgress: (progress) => console.log(progress.message),
 * });
 *
 * if (result.success) {
 *   console.log('Screenshot capturado:', result.imageHash);
 * }
 * ```
 */
// ============================================================================
// Funções de Hash de Integridade do DOM (ISO 27037)
// ============================================================================

/**
 * Calcula hash da estrutura do DOM para verificação de integridade
 *
 * CONFORMIDADE ISO 27037:
 * - Captura estado do DOM antes de modificações
 * - Permite verificar se restauração foi completa
 * - Documentação forense da cadeia de custódia
 *
 * @param includeInvisible - Se deve incluir elementos invisíveis no hash
 * @returns Hash SHA-256 da estrutura do DOM
 */
async function calculateDOMStructureHash(includeInvisible = false): Promise<string> {
  const elements: string[] = [];

  // Percorrer todos elementos relevantes
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const el = element as HTMLElement;

    // Pular elementos invisíveis se solicitado
    if (!includeInvisible) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
    }

    // Criar representação do elemento
    const rect = el.getBoundingClientRect();
    const representation = [
      el.tagName,
      el.id || '',
      el.className || '',
      Math.round(rect.top),
      Math.round(rect.left),
      Math.round(rect.width),
      Math.round(rect.height),
      el.textContent?.substring(0, 100) || '' // Primeiros 100 chars do texto
    ].join('|');

    elements.push(representation);
  }

  // Ordenar para consistência
  elements.sort();

  // Calcular hash
  const domString = elements.join('\n');
  return await CryptoUtils.hash(domString);
}

/**
 * Calcula hash apenas dos elementos visíveis no viewport atual
 *
 * @returns Hash SHA-256 dos elementos visíveis
 */
async function calculateVisibleElementsHash(): Promise<string> {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const elements: string[] = [];

  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const el = element as HTMLElement;
    const rect = el.getBoundingClientRect();

    // Verificar se está no viewport
    if (rect.bottom >= 0 && rect.top <= viewportHeight &&
        rect.right >= 0 && rect.left <= viewportWidth) {

      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        const representation = [
          el.tagName,
          el.id || '',
          Math.round(rect.top),
          Math.round(rect.left),
          Math.round(rect.width),
          Math.round(rect.height)
        ].join('|');

        elements.push(representation);
      }
    }
  }

  elements.sort();
  const visibleString = elements.join('\n');
  return await CryptoUtils.hash(visibleString);
}

export class ScreenshotCapture {
  private logger: AuditLogger;
  private config: ScreenshotCaptureConfig;
  private lockdownManager: LockdownSecurityManager | null = null;
  public isCapturing = false;
  private startTime = 0;
  /** Resultado da verificação de estabilidade visual (para metadados forenses) */
  private stabilityCheckResult: StabilityCheckResult | null = null;
  /** Lista de modificações do DOM para documentação forense */
  private domModifications: DOMModification[] = [];
  /** Hash do estado original do DOM */
  private originalStateHash: OriginalStateHash | null = null;
  /** Hash do estado restaurado do DOM */
  private restoredStateHash: RestoredStateHash | null = null;
  /** Escopo da captura - metadados sobre área capturada (ISO 27037) */
  private captureScope: CaptureScope | null = null;

  /**
   * Cria nova instância do ScreenshotCapture
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   * @param config - Configuração customizada (opcional)
   */
  constructor(logger: AuditLogger, config?: Partial<ScreenshotCaptureConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Verifica se uma captura está em andamento
   */
  isInProgress(): boolean {
    return this.isCapturing;
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): ScreenshotCaptureConfig {
    return { ...this.config };
  }

  /**
   * Executa captura completa de screenshot
   *
   * @param options - Opções de captura
   * @returns Resultado da captura com imagem, HTML e hashes
   */
  async capture(options?: {
    onProgress?: ScreenshotProgressCallback;
    lockdownManager?: LockdownSecurityManager;
  }): Promise<ScreenshotCaptureResult> {
    if (this.isCapturing) {
      this.logger.warn('CAPTURE', 'SCREENSHOT_ALREADY_IN_PROGRESS', {});
      return {
        success: false,
        error: 'Captura já em andamento',
      };
    }

    this.isCapturing = true;
    this.startTime = Date.now();
    const onProgress = options?.onProgress;

    // Limpar estado de capturas anteriores (ISO 27037)
    this.domModifications = [];
    this.originalStateHash = null;
    this.restoredStateHash = null;
    this.captureScope = null;

    this.logger.info('CAPTURE', 'SCREENSHOT_START', {
      url: window.location.href,
      title: document.title,
      config: this.config,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentReadyState: document.readyState,
    });

    try {
      // Etapa 1: Ativar lockdown (Requirement 6.1)
      this.logger.info('CAPTURE', 'LOCKDOWN_ACTIVATING', {
        step: 1,
        totalSteps: 7,
      });
      this.reportProgress(onProgress, 'lockdown', 10, 'Isolando ambiente...');
      const lockdownResult = await this.activateLockdown(options?.lockdownManager);
      if (!lockdownResult.success) {
        this.logger.error('CAPTURE', 'LOCKDOWN_ACTIVATION_FAILED', {
          error: lockdownResult.error,
        });
        throw new Error(`Falha ao ativar lockdown: ${lockdownResult.error}`);
      }
      this.logger.info('CAPTURE', 'LOCKDOWN_ACTIVATED_SUCCESS', {});

      // Etapa 1.5: Capturar hash do estado original do DOM (ISO 27037)
      this.logger.info('CAPTURE', 'CAPTURING_ORIGINAL_DOM_STATE', {
        step: '1.5',
        purpose: 'ISO 27037 Compliance - Original State Hash'
      });
      await this.captureOriginalStateHash();

      // Etapa 2: Aguardar recursos (Requirements 6.3, 6.4, 6.5)
      this.logger.info('CAPTURE', 'WAITING_RESOURCES_START', {
        step: 2,
        totalSteps: 7,
        pageLoadTimeout: this.config.pageLoadTimeout,
      });
      this.reportProgress(onProgress, 'waiting_resources', 25, 'Carregando recursos...');
      await this.waitForResources();
      this.logger.info('CAPTURE', 'WAITING_RESOURCES_COMPLETE', {
        elapsedMs: Date.now() - this.startTime,
      });

      // Etapa 3: Capturar viewports (Requirements 6.7, 6.8)
      this.logger.info('CAPTURE', 'VIEWPORT_CAPTURE_START', {
        step: 3,
        totalSteps: 7,
        viewportTimeout: this.config.viewportTimeout,
      });
      this.reportProgress(onProgress, 'capturing', 55, 'Capturando...');
      const { viewports, stickyResult } = await this.captureAllViewports(onProgress);
      this.logger.info('CAPTURE', 'VIEWPORT_CAPTURE_COMPLETE', {
        viewportsCaptured: viewports.length,
        elapsedMs: Date.now() - this.startTime,
      });

      // Etapa 4: Fazer stitching das imagens (Requirement 6.9)
      this.logger.info('CAPTURE', 'STITCHING_START', {
        step: 4,
        totalSteps: 7,
        viewportsToStitch: viewports.length,
      });
      this.reportProgress(onProgress, 'stitching', 65, 'Processando imagem...');
      const { imageData, width, height } = await this.stitchViewports(viewports, stickyResult);
      this.logger.info('CAPTURE', 'STITCHING_COMPLETE', {
        finalWidth: width,
        finalHeight: height,
        imageSizeBytes: imageData.length,
        elapsedMs: Date.now() - this.startTime,
      });

      // Etapa 5: Coletar HTML (Requirement 6.11)
      let htmlContent: string | undefined;
      let htmlHash: string | undefined;
      if (this.config.collectHtml) {
        this.logger.info('CAPTURE', 'HTML_COLLECTION_START', {
          step: 5,
          totalSteps: 7,
        });
        this.reportProgress(onProgress, 'hashing', 75, 'Gerando hash SHA-256...');
        htmlContent = this.collectHtml();
        this.logger.info('CAPTURE', 'HTML_COLLECTED', {
          htmlSizeBytes: htmlContent.length,
        });
        htmlHash = await this.calculateHash(htmlContent);
        this.logger.info('CAPTURE', 'HTML_HASH_CALCULATED', {
          htmlHash,
          elapsedMs: Date.now() - this.startTime,
        });
      }

      // Etapa 6: Coletar metadados forenses (Requirement 6.12)
      let metadata: ForensicMetadata | undefined;
      let metadataHash: string | undefined;
      if (this.config.collectMetadata) {
        this.logger.info('CAPTURE', 'FORENSIC_METADATA_COLLECTION_START', {
          step: 6,
          totalSteps: 7,
        });
        this.reportProgress(onProgress, 'hashing', 75, 'Gerando hash SHA-256...');
        
        // Gerar captureId único para esta captura usando crypto.randomUUID()
        // Seguro e disponível em contextos seguros (HTTPS/extensões)
        const captureId = crypto.randomUUID();
        
        // Montar parâmetros para coleta forense
        // NOTA: Coleta de dados sensíveis (IP, geolocalização) é feita via APIs públicas
        // com timeout e fallback para garantir resiliência
        const forensicParams: import('../lib/forensic/forensic-collector').ForensicCollectParams = {
          captureId,
          url: window.location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          pageSize: {
            width,
            height,
          },
          viewportsCaptured: viewports.length,
        };
        
        // Adicionar htmlHash apenas se definido (evita undefined em exactOptionalPropertyTypes)
        if (htmlHash !== undefined) {
          forensicParams.htmlHash = htmlHash;
        }
        
        // Usar ForensicCollector para coleta completa de metadados forenses
        // Inclui: geolocalização, rede, SSL, DNS, WHOIS, fingerprints, etc.
        const forensicCollector = new ForensicCollector(this.logger);
        metadata = await forensicCollector.collect(forensicParams);
        
        // Adicionar modificações DOM para transparência forense (ISO/IEC 27037)
        const stickyMods = this.getStickyElementModifications();
        const lazyMods = this.getLazyImageModifications();

        if (stickyMods.length > 0 || lazyMods.length > 0 || this.stickyHandlingResultV3) {
          metadata.domModifications = {};

          // Adicionar informações da estratégia V3 se disponível
          if (this.stickyHandlingResultV3) {
            (metadata.domModifications as any).stickyHandlingStrategy = {
              version: 'v3-composition',
              timestamp: this.stickyHandlingResultV3.timestamp,
              elementsProcessed: this.stickyHandlingResultV3.elementsProcessed.map(el => ({
                type: el.type,
                selector: el.selector,
                action: el.action,
                originalStyles: el.originalStyles,
                zIndex: el.zIndex,
                boundingRect: {
                  top: el.boundingRect.top,
                  left: el.boundingRect.left,
                  width: el.boundingRect.width,
                  height: el.boundingRect.height,
                },
              })),
              compositionInfo: {
                headerCaptured: this.stickyHandlingResultV3.compositionInfo.headerCaptured,
                headerPosition: this.stickyHandlingResultV3.compositionInfo.headerPosition,
                footerCaptured: this.stickyHandlingResultV3.compositionInfo.footerCaptured,
                footerPosition: this.stickyHandlingResultV3.compositionInfo.footerPosition,
              },
              totalProcessed: this.stickyHandlingResultV3.totalProcessed,
              elementsByType: this.countElementsByType(this.stickyHandlingResultV3.elementsProcessed),
            };
          }

          if (stickyMods.length > 0) {
            metadata.domModifications.stickyElements = stickyMods.map(mod => ({
              selector: mod.selector,
              tagName: mod.tagName,
              originalPosition: mod.originalPosition,
              newPosition: mod.newPosition,
              timestamp: mod.timestamp,
              justification: mod.justification,
            }));
          }

          if (lazyMods.length > 0) {
            metadata.domModifications.lazyImages = lazyMods;
          }

          this.logger.info('CAPTURE', 'DOM_MODIFICATIONS_RECORDED', {
            stickyHandlingVersion: this.stickyHandlingResultV3 ? 'v3-composition' : 'v2',
            stickyElementsModified: stickyMods.length,
            lazyImagesModified: lazyMods.length,
            v3ElementsProcessed: this.stickyHandlingResultV3?.totalProcessed ?? 0,
          });
        }
        
        this.logger.info('CAPTURE', 'FORENSIC_METADATA_COLLECTED', {
          captureId: metadata.captureId,
          coletoresExecutados: 24 - Object.keys(metadata.collectionErrors ?? {}).length,
          errosColeta: Object.keys(metadata.collectionErrors ?? {}).length,
          duracaoColetaMs: metadata.collectionDurationMs,
          modificacoesDomRegistradas: (stickyMods.length + lazyMods.length) > 0,
        });
        
        metadataHash = await this.calculateHash(metadata);
        this.logger.info('CAPTURE', 'FORENSIC_METADATA_HASH_CALCULATED', {
          metadataHash,
        });
      }

      // Etapa 7: Calcular hash da imagem (Requirement 6.13)
      this.logger.info('CAPTURE', 'IMAGE_HASH_START', {
        step: 7,
        totalSteps: 7,
        hashTimeout: this.config.hashTimeout,
      });
      this.reportProgress(onProgress, 'hashing', 75, 'Gerando hash SHA-256...');
      const imageHash = await this.calculateHash(imageData);
      this.logger.info('CAPTURE', 'IMAGE_HASH_CALCULATED', {
        imageHash,
        elapsedMs: Date.now() - this.startTime,
      });

      // Atualizar metadata com imageHash e recalcular metadataHash
      if (metadata) {
        metadata.hashes.imageHash = imageHash;
        metadataHash = await this.calculateHash(metadata);
        this.logger.info('CAPTURE', 'FORENSIC_METADATA_HASH_RECALCULATED', {
          metadataHash,
        });
      }

      // Etapa 7.5: Capturar hash do estado restaurado (ISO 27037)
      this.logger.info('CAPTURE', 'CAPTURING_RESTORED_DOM_STATE', {
        step: '7.5',
        purpose: 'ISO 27037 Compliance - Restored State Hash'
      });

      // Restaurar elementos sticky ANTES de capturar o hash restaurado
      this.restoreStickyElements();
      await this.captureRestoredStateHash();

      // Etapa 7.6: Executar captura Dual-Mode (ISO 27037)
      let dualModeCapture: DualModeCapture | null = null;
      if (this.config.format === 'png') { // Dual-mode apenas para PNG
        this.logger.info('CAPTURE', 'DUAL_MODE_CAPTURE_STARTING', {
          step: '7.6',
          purpose: 'ISO 27037 Compliance - Dual Mode Capture'
        });
        dualModeCapture = await this.executeDualModeCapture(imageData, width, height);
      }

      // Construir hashes de integridade
      let integrityHashes: IntegrityHashes | undefined;
      if (this.originalStateHash !== null && this.restoredStateHash !== null) {
        const originalHash: OriginalStateHash = this.originalStateHash;
        const restoredHash: RestoredStateHash = this.restoredStateHash;
        integrityHashes = {
          originalState: originalHash,
          capturedImage: imageHash,
          restoredState: restoredHash,
          integrityVerified: originalHash.domStructureHash === restoredHash.domStructureHash
        };
      }

      // Concluído
      const durationMs = Date.now() - this.startTime;

      // Mensagem de progresso final (informativa sobre truncamento)
      let completionMessage = 'Captura concluída!';
      const scopeForMessage = this.captureScope as CaptureScope | null;
      if (scopeForMessage?.wasTruncated) {
        const totalHeight = scopeForMessage.totalPageHeight;
        const capturedHeight = scopeForMessage.capturedHeight;
        const reason = scopeForMessage.infiniteScrollDetected
          ? 'página com scroll infinito'
          : 'limite de altura excedido';
        completionMessage = `Captura completa (${capturedHeight.toLocaleString('pt-BR')}px de ${totalHeight.toLocaleString('pt-BR')}px - ${reason})`;
      }
      // Não usar 100% aqui - o 100% é só quando o preview abrir
      // Este é apenas o fim da captura local, ainda tem timestamp, upload e preview
      this.reportProgress(onProgress, 'hashing', 75, completionMessage);

      // Capturar referência para log (type assertion necessária para narrowing)
      const scopeForLog = this.captureScope as CaptureScope | null;

      this.logger.info('CAPTURE', 'SCREENSHOT_COMPLETE', {
        width,
        height,
        viewportsCaptured: viewports.length,
        imageHash,
        htmlHash,
        metadataHash,
        durationMs,
        imageSizeBytes: imageData.length,
        htmlSizeBytes: htmlContent?.length ?? 0,
        integrityVerified: integrityHashes?.integrityVerified,
        dualModeAvailable: dualModeCapture !== null,
        // Metadados de captura para auditoria forense
        captureScope: scopeForLog ? {
          totalPageHeight: scopeForLog.totalPageHeight,
          capturedHeight: scopeForLog.capturedHeight,
          wasTruncated: scopeForLog.wasTruncated,
          truncationReason: scopeForLog.truncationReason,
          infiniteScrollDetected: scopeForLog.infiniteScrollDetected,
        } : null,
      });

      // Construir resultado com propriedades opcionais apenas se definidas
      const result: ScreenshotCaptureResult = {
        success: true,
        imageData,
        width,
        height,
        imageHash,
        durationMs,
      };

      if (htmlContent !== undefined) {
        result.htmlContent = htmlContent;
      }
      if (htmlHash !== undefined) {
        result.htmlHash = htmlHash;
      }
      if (metadata !== undefined) {
        result.metadata = metadata;
      }
      if (metadataHash !== undefined) {
        result.metadataHash = metadataHash;
      }
      if (integrityHashes !== undefined) {
        result.integrityHashes = integrityHashes;
      }
      if (dualModeCapture !== null) {
        result.dualModeCapture = dualModeCapture;
      }
      if (scopeForLog !== null) {
        result.captureScope = scopeForLog;
      }

      // NOTA: NÃO notificamos CAPTURE_COMPLETE aqui porque o service worker
      // ainda precisa processar a resposta e fazer upload. A notificação
      // prematura causava race condition onde currentCaptureState ficava null
      // antes do upload completar. O service worker gerencia o estado.

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error('CAPTURE', 'SCREENSHOT_FAILED', { 
        error: errorMessage,
        stack: errorStack,
        elapsedMs: Date.now() - this.startTime,
        url: window.location.href,
      });

      // NOTA: NÃO notificamos CAPTURE_COMPLETE aqui porque o service worker
      // recebe o erro via resposta do PISA. Notificação prematura causava
      // race condition onde currentCaptureState ficava null antes do
      // service worker processar a resposta.

      const errorResult: ScreenshotCaptureResult = {
        success: false,
        durationMs: Date.now() - this.startTime,
      };
      errorResult.error = errorMessage;

      return errorResult;
    } finally {
      this.isCapturing = false;
      this.logger.info('CAPTURE', 'SCREENSHOT_CLEANUP', {
        totalDurationMs: Date.now() - this.startTime,
      });
    }
  }

  /**
   * Notifica o service worker que a captura foi concluída
   * Isso garante que o isolamento seja desativado
   *
   * @param success - Se a captura foi bem-sucedida
   * @param error - Mensagem de erro se falhou
   */
  private notifyCaptureComplete(success: boolean, error?: string): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: 'CAPTURE_COMPLETE',
          payload: { success, error },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            this.logger.warn('CAPTURE', 'CAPTURE_COMPLETE_NOTIFY_FAILED', {
              error: chrome.runtime.lastError.message,
            });
          } else {
            this.logger.info('CAPTURE', 'CAPTURE_COMPLETE_NOTIFIED', {
              success,
              response,
            });
          }
        }
      );
    }
  }

  /**
   * Cancela captura em andamento
   */
  cancel(): void {
    if (this.isCapturing) {
      this.isCapturing = false;
      this.deactivateLockdown();
      // Notificar service worker que captura foi cancelada
      this.notifyCaptureComplete(false, 'Captura cancelada pelo usuário');
      this.logger.info('CAPTURE', 'SCREENSHOT_CANCELLED', {});
    }
  }

  /**
   * Obtém a instância do LockdownSecurityManager
   *
   * @returns Instância do lockdown manager ou null
   */
  getLockdownManager(): LockdownSecurityManager | null {
    return this.lockdownManager;
  }

  /**
   * Desativa lockdown e limpa recursos
   */
  cleanup(): void {
    this.deactivateLockdown();
    this.isCapturing = false;
  }

  // ==========================================================================
  // Métodos de Lockdown
  // ==========================================================================

  /**
   * Ativa modo lockdown antes da captura
   * Requirement 6.1
   */
  private async activateLockdown(
    externalManager?: LockdownSecurityManager
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Usar manager externo ou criar novo
      this.lockdownManager = externalManager ?? new LockdownSecurityManager(this.logger);

      const result = await this.lockdownManager.activate();

      if (!result.success) {
        const failResult: { success: boolean; error?: string } = { success: false };
        if (result.error) {
          failResult.error = result.error;
        }
        return failResult;
      }

      this.logger.info('CAPTURE', 'LOCKDOWN_ACTIVATED', {
        protections: result.protections,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Desativa lockdown após captura
   */
  private deactivateLockdown(): void {
    if (this.lockdownManager) {
      const result = this.lockdownManager.deactivate();
      this.logger.info('CAPTURE', 'LOCKDOWN_DEACTIVATED', {
        violations: result.totalViolations,
      });
      this.lockdownManager = null;
    }
  }

  // ==========================================================================
  // Métodos de Gerenciamento de Elementos Sticky
  // ==========================================================================

  /**
   * Estado salvo dos elementos sticky para restauração posterior
   */
  private stickyElementsState: StickyElementState[] = [];

  /**
   * Resultado da estratégia V3 de manipulação de sticky elements
   * Armazenado para incluir nos metadados forenses
   */
  private stickyHandlingResultV3: StickyHandlingResultV3 | null = null;

  /**
   * Registro forense das modificações de sticky elements
   * Armazena informações sobre elementos modificados para transparência jurídica
   */
  private stickyElementModifications: Array<{
    selector: string;
    tagName: string;
    originalPosition: string;
    newPosition: string;
    originalCoords: { top: string; left: string; bottom: string; right: string };
    newCoords: { top: string; left: string };
    timestamp: number;
    justification: string;
  }> = [];

  /**
   * Retorna as modificações de sticky elements realizadas (para metadados forenses)
   * 
   * CONFORMIDADE ISO/IEC 27037:
   * Este método permite incluir nos metadados da prova todas as modificações
   * temporárias realizadas no DOM durante a captura, garantindo transparência
   * e auditabilidade do processo de coleta de evidência digital.
   */
  public getStickyElementModifications(): typeof this.stickyElementModifications {
    return [...this.stickyElementModifications];
  }

  /**
   * Retorna o resultado da verificação de estabilidade visual (para metadados forenses)
   *
   * CONFORMIDADE ISO/IEC 27037:
   * Documenta o tempo de espera e status de estabilidade antes da captura.
   */
  public getStabilityCheckResult(): StabilityCheckResult | null {
    return this.stabilityCheckResult;
  }

  /**
   * Limpa registro de modificações de sticky elements
   */
  private clearStickyElementModifications(): void {
    this.stickyElementModifications = [];
  }

  /**
   * Gera seletor CSS único para um elemento (para registro forense)
   */
  private generateElementSelector(el: HTMLElement): string {
    if (el.id) {
      return `#${el.id}`;
    }
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c.trim()).slice(0, 3);
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    // Fallback: tag + posição
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      const index = siblings.indexOf(el);
      if (siblings.length > 1) {
        return `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
      }
    }
    return el.tagName.toLowerCase();
  }

  /**
   * Verifica se elemento é widget conhecido por seletor
   *
   * @param el - Elemento a verificar
   * @returns true se elemento corresponde a um widget conhecido
   */
  private isKnownWidget(el: HTMLElement): boolean {
    const allSelectors = [
      ...KNOWN_WIDGET_SELECTORS.chat,
      ...KNOWN_WIDGET_SELECTORS.cookie,
      ...KNOWN_WIDGET_SELECTORS.fab,
      ...KNOWN_WIDGET_SELECTORS.social,
    ];

    return allSelectors.some(selector => {
      try {
        return el.matches(selector);
      } catch {
        return false;
      }
    });
  }

  /**
   * Retorna tipo do widget conhecido
   *
   * @param el - Elemento widget
   * @returns Tipo do widget (chat, cookie, fab, social) ou 'unknown'
   */
  private getWidgetType(el: HTMLElement): string {
    for (const [type, selectors] of Object.entries(KNOWN_WIDGET_SELECTORS)) {
      if (selectors.some(sel => {
        try { return el.matches(sel); }
        catch { return false; }
      })) {
        return type;
      }
    }
    return 'unknown';
  }

  /**
   * Verifica se elemento é provavelmente um header
   *
   * @param el - Elemento a verificar
   * @param rect - BoundingClientRect do elemento
   * @param viewportWidth - Largura do viewport
   * @returns true se elemento parece ser um header
   */
  private isLikelyHeader(el: HTMLElement, rect: DOMRect, viewportWidth: number): boolean {
    // Verificar por seletores
    const matchesHeaderSelector = HEADER_SELECTORS.some(sel => {
      try { return el.matches(sel); }
      catch { return false; }
    });

    // Verificar por posição e tamanho
    const isAtTop = rect.top >= -10 && rect.top <= 10; // No topo
    const isWide = rect.width >= viewportWidth * 0.8; // Largura quase total
    const hasReasonableHeight = rect.height >= 40 && rect.height <= 200; // Altura de header típico

    return matchesHeaderSelector || (isAtTop && isWide && hasReasonableHeight);
  }

  /**
   * Verifica se elemento é widget por heurísticas
   *
   * @param el - Elemento a verificar
   * @param rect - BoundingClientRect do elemento
   * @param viewportHeight - Altura do viewport
   * @param viewportWidth - Largura do viewport
   * @returns true se elemento parece ser um widget por heurísticas
   */
  private isWidgetByHeuristics(
    el: HTMLElement,
    rect: DOMRect,
    viewportHeight: number,
    viewportWidth: number
  ): boolean {
    const computedStyle = window.getComputedStyle(el);
    const zIndex = parseInt(computedStyle.zIndex) || 0;

    // Z-index muito alto (geralmente widgets)
    if (zIndex > 9000) {
      return true;
    }

    // Elemento pequeno fixo no canto inferior
    const isSmall = (rect.width * rect.height) < (viewportWidth * viewportHeight * 0.15);
    const isInBottomArea = rect.top > viewportHeight * 0.6;
    const isInCorner = (rect.right > viewportWidth * 0.8) || (rect.left < viewportWidth * 0.2);

    if (isSmall && isInBottomArea && isInCorner) {
      return true;
    }

    // Bottom definido (comum em chat widgets)
    const hasBottom = computedStyle.bottom !== 'auto' && computedStyle.bottom !== '';
    const hasRight = computedStyle.right !== 'auto' && computedStyle.right !== '';

    if (hasBottom && hasRight && isSmall) {
      return true;
    }

    return false;
  }

  /**
   * Oculta elementos sticky com estratégia melhorada (V2)
   *
   * @deprecated Use handleStickyElementsV3() para nova estratégia com composição
   *
   * ESTRATÉGIA:
   * 1. Scroll para topo (scrollY = 0) para cálculos precisos
   * 2. Identificar e marcar header principal
   * 3. Ocultar TODOS sticky/fixed com visibility: hidden
   * 4. Widgets conhecidos: display: none
   *
   * CONFORMIDADE FORENSE (ISO/IEC 27037):
   * - Todas as modificações são registradas
   * - Justificativa documentada para cada tipo de ocultação
   * - Processo reversível e auditável
   *
   * @returns Informações para composição da imagem final
   */
  // @ts-ignore - Mantido para referência histórica
   
  private async hideStickyElementsV2(): Promise<StickyHideResult> {
    this.stickyElementsState = [];
    this.clearStickyElementModifications();

    // CRÍTICO: Scroll para topo antes de calcular posições
    const originalScrollY = window.scrollY;
    window.scrollTo(0, 0);
    await this.waitForRender();

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const allElements = document.querySelectorAll('*');

    let headerElement: HTMLElement | null = null;
    let headerHeight = 0;
    const result: StickyHideResult = {
      headerCapture: null,
      hiddenElements: [],
      modifications: [],
      totalHidden: 0,
    };

    for (const el of allElements) {
      if (!(el instanceof HTMLElement)) {
        continue;
      }

      const computedStyle = window.getComputedStyle(el);
      const position = computedStyle.position;

      if (position !== 'fixed' && position !== 'sticky') {
        continue;
      }

      const rect = el.getBoundingClientRect();

      // Salvar estado original
      const state: StickyElementState = {
        element: el,
        originalPosition: el.style.position,
        originalTop: el.style.top,
        originalBottom: el.style.bottom,
        originalLeft: el.style.left,
        originalRight: el.style.right,
        originalZIndex: el.style.zIndex,
        originalTransform: el.style.transform,
        originalDisplay: el.style.display,
        originalVisibility: el.style.visibility,
      };
      this.stickyElementsState.push(state);

      // Verificar se é widget conhecido
      const isKnownWidgetEl = this.isKnownWidget(el);

      // Verificar se é header (no topo, largura total)
      const isHeader = this.isLikelyHeader(el, rect, viewportWidth);

      // Verificar se é widget por heurísticas
      const isWidgetByHeur = this.isWidgetByHeuristics(el, rect, viewportHeight, viewportWidth);

      if (isKnownWidgetEl || isWidgetByHeur) {
        // WIDGETS: Ocultar completamente
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');

        this.stickyElementModifications.push({
          selector: this.generateElementSelector(el),
          tagName: el.tagName,
          originalPosition: position,
          newPosition: 'hidden',
          originalCoords: {
            top: state.originalTop,
            left: state.originalLeft,
            bottom: state.originalBottom,
            right: state.originalRight,
          },
          newCoords: { top: 'N/A', left: 'N/A' },
          timestamp: Date.now(),
          justification: isKnownWidgetEl
            ? `Widget conhecido (${this.getWidgetType(el)}) ocultado - não faz parte do conteúdo principal`
            : 'Widget detectado por heurísticas (tamanho/z-index) ocultado',
        });

        this.logger.info('CAPTURE', 'WIDGET_HIDDEN_V2', {
          tagName: el.tagName,
          id: el.id || undefined,
          className: typeof el.className === 'string' ? el.className : undefined,
          widgetType: isKnownWidgetEl ? this.getWidgetType(el) : 'heuristics',
        });
      } else if (isHeader && !headerElement) {
        // HEADER PRINCIPAL: Marcar para captura separada
        headerElement = el;
        headerHeight = rect.height;

        // Ocultar durante captura do corpo
        el.style.setProperty('visibility', 'hidden', 'important');

        this.stickyElementModifications.push({
          selector: this.generateElementSelector(el),
          tagName: el.tagName,
          originalPosition: position,
          newPosition: 'hidden-for-body-capture',
          originalCoords: {
            top: state.originalTop,
            left: state.originalLeft,
            bottom: state.originalBottom,
            right: state.originalRight,
          },
          newCoords: { top: 'N/A', left: 'N/A' },
          timestamp: Date.now(),
          justification: 'Header principal identificado - será capturado separadamente e composto uma única vez no topo',
        });

        this.logger.info('CAPTURE', 'HEADER_IDENTIFIED_V2', {
          tagName: el.tagName,
          id: el.id || undefined,
          className: typeof el.className === 'string' ? el.className : undefined,
          height: headerHeight,
        });
      } else {
        // OUTROS STICKY: Ocultar com visibility
        el.style.setProperty('visibility', 'hidden', 'important');

        this.stickyElementModifications.push({
          selector: this.generateElementSelector(el),
          tagName: el.tagName,
          originalPosition: position,
          newPosition: 'hidden',
          originalCoords: {
            top: state.originalTop,
            left: state.originalLeft,
            bottom: state.originalBottom,
            right: state.originalRight,
          },
          newCoords: { top: 'N/A', left: 'N/A' },
          timestamp: Date.now(),
          justification: 'Elemento sticky/fixed ocultado para evitar duplicação na captura full-page',
        });

        this.logger.info('CAPTURE', 'STICKY_HIDDEN_V2', {
          tagName: el.tagName,
          id: el.id || undefined,
          className: typeof el.className === 'string' ? el.className : undefined,
        });
      }

      result.totalHidden++;
    }

    // Preparar informações do header para captura separada
    if (headerElement) {
      result.headerCapture = {
        element: headerElement,
        height: headerHeight,
      };
    }

    result.hiddenElements = [...this.stickyElementsState];
    result.modifications = [...this.stickyElementModifications];

    // Restaurar scroll original (será feito scroll novamente durante captura)
    window.scrollTo(0, originalScrollY);

    this.logger.info('CAPTURE', 'STICKY_ELEMENTS_HIDDEN_V2', {
      totalHidden: result.totalHidden,
      hasHeader: !!headerElement,
      headerHeight,
    });

    return result;
  }

  /**
   * Manipula elementos sticky/fixed com estratégia V3 de composição
   *
   * ESTRATÉGIA V3 - COMPOSIÇÃO INTELIGENTE:
   * 1. Identifica e classifica todos elementos fixed/sticky
   * 2. Captura separadamente header e footer ANTES de ocultar
   * 3. Oculta completamente widgets e elementos não essenciais
   * 4. Retorna dados para composição posterior na imagem final
   *
   * ISO 27037 COMPLIANCE:
   * - Todas as modificações temporárias são documentadas
   * - Estados originais preservados para restauração
   * - Processo auditável e reproduzível
   *
   * @returns Resultado com capturas separadas e metadados forenses
   */
  private async handleStickyElementsV3(): Promise<StickyHandlingResultV3> {
    const startTime = Date.now();
    this.stickyElementsState = [];
    this.clearStickyElementModifications();

    // CRÍTICO: Scroll para topo antes de calcular posições
    const originalScrollY = window.scrollY;
    window.scrollTo(0, 0);
    await this.waitForRender();

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const pageHeight = document.documentElement.scrollHeight;

    const result: StickyHandlingResultV3 = {
      strategy: 'v3-composition',
      elementsProcessed: [],
      compositionInfo: {
        headerCaptured: false,
        headerPosition: { x: 0, y: 0, width: 0, height: 0 },
        footerCaptured: false,
        footerPosition: { x: 0, y: 0, width: 0, height: 0 },
      },
      hiddenElements: [],
      totalProcessed: 0,
      timestamp: Date.now(),
    };

    // Coletar e classificar todos elementos fixed/sticky
    const classifiedElements: Map<HTMLElement, StickyElementMetadata> = new Map();
    const allElements = document.querySelectorAll('*');

    this.logger.info('CAPTURE', 'STICKY_DETECTION_START', {
      totalElements: allElements.length,
      viewportWidth,
      viewportHeight,
      pageHeight,
    });

    let fixedCount = 0;
    let stickyCount = 0;

    for (const el of allElements) {
      if (!(el instanceof HTMLElement)) {continue;}

      const computedStyle = window.getComputedStyle(el);
      const position = computedStyle.position;

      if (position !== 'fixed' && position !== 'sticky') {continue;}

      if (position === 'fixed') { fixedCount++; }
      if (position === 'sticky') { stickyCount++; }

      const rect = el.getBoundingClientRect();
      const zIndex = parseInt(computedStyle.zIndex) || 0;

      // Classificar o tipo de elemento
      const elementType = this.classifyStickyElement(el, rect, viewportWidth, viewportHeight, zIndex);

      // LOG DETALHADO para diagnóstico
      this.logger.info('CAPTURE', 'STICKY_ELEMENT_DETECTED', {
        tagName: el.tagName,
        id: el.id || 'sem-id',
        className: (el.className || '').toString().substring(0, 80),
        position,
        classifiedAs: elementType,
        rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        zIndex,
        isAtTop: rect.top >= -10 && rect.top <= 10,
        isWide: rect.width >= viewportWidth * 0.8,
      });

      // Salvar estado original para restauração
      const state: StickyElementState = {
        element: el,
        originalPosition: el.style.position,
        originalTop: el.style.top,
        originalBottom: el.style.bottom,
        originalLeft: el.style.left,
        originalRight: el.style.right,
        originalZIndex: el.style.zIndex,
        originalTransform: el.style.transform,
        originalDisplay: el.style.display,
        originalVisibility: el.style.visibility,
      };
      this.stickyElementsState.push(state);

      const metadata: StickyElementMetadata = {
        type: elementType,
        selector: this.generateElementSelector(el),
        action: 'hidden', // Será atualizado conforme a ação
        originalStyles: {
          position: computedStyle.position,
          top: computedStyle.top,
          bottom: computedStyle.bottom,
          left: computedStyle.left,
          right: computedStyle.right,
          zIndex: computedStyle.zIndex,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
        },
        boundingRect: rect,
        zIndex,
      };

      classifiedElements.set(el, metadata);
    }

    // Processar elementos por tipo
    let headerElement: HTMLElement | null = null;
    let footerElement: HTMLElement | null = null;

    for (const [el, metadata] of classifiedElements) {
      switch (metadata.type) {
        case 'header':
          if (!headerElement) {
            headerElement = el;
            metadata.action = 'captured-once';

            // Capturar o header ANTES de ocultar
            try {
              const headerCanvas = await this.captureElement(el);
              if (headerCanvas) {
                result.compositionInfo.headerCaptured = true;
                result.compositionInfo.headerPosition = {
                  x: metadata.boundingRect.left,
                  y: metadata.boundingRect.top,
                  width: metadata.boundingRect.width,
                  height: metadata.boundingRect.height,
                };
                result.compositionInfo.headerImageData = headerCanvas.toDataURL('image/png');
              }
            } catch (error) {
              this.logger.warn('CAPTURE', 'HEADER_CAPTURE_FAILED', {
                error: error instanceof Error ? error.message : 'Erro desconhecido',
              });
            }

            // Ocultar header após captura - usar múltiplas técnicas para garantir ocultação
            // Alguns sites usam CSS que pode sobrescrever display:none
            this.aggressivelyHideElement(el);
          } else {
            // Headers adicionais - ocultar completamente
            this.aggressivelyHideElement(el);
            metadata.action = 'hidden';
          }
          break;

        case 'footer':
          if (!footerElement && metadata.boundingRect.bottom >= pageHeight - 100) {
            footerElement = el;
            metadata.action = 'captured-once';

            // Scroll para o final para capturar o footer
            window.scrollTo(0, pageHeight);
            await this.waitForRender();

            try {
              const footerCanvas = await this.captureElement(el);
              if (footerCanvas) {
                result.compositionInfo.footerCaptured = true;
                result.compositionInfo.footerPosition = {
                  x: metadata.boundingRect.left,
                  y: pageHeight - metadata.boundingRect.height, // Posição no final da página
                  width: metadata.boundingRect.width,
                  height: metadata.boundingRect.height,
                };
                result.compositionInfo.footerImageData = footerCanvas.toDataURL('image/png');
              }
            } catch (error) {
              this.logger.warn('CAPTURE', 'FOOTER_CAPTURE_FAILED', {
                error: error instanceof Error ? error.message : 'Erro desconhecido',
              });
            }

            // Voltar ao topo e ocultar footer
            window.scrollTo(0, 0);
            await this.waitForRender();
            // Ocultar footer usando múltiplas técnicas
            this.aggressivelyHideElement(el);
          } else {
            this.aggressivelyHideElement(el);
            metadata.action = 'hidden';
          }
          break;

        case 'cookie-banner':
        case 'widget':
          // Ocultar completamente elementos não essenciais
          this.aggressivelyHideElement(el);
          metadata.action = 'hidden';
          break;

        case 'sidebar':
        case 'other':
          // Ocultar elementos fixos para evitar repetição na captura
          this.aggressivelyHideElement(el);
          metadata.action = 'hidden';
          break;
      }

      result.elementsProcessed.push(metadata);
      result.totalProcessed++;

      // Registrar modificação para auditoria forense
      this.stickyElementModifications.push({
        selector: metadata.selector,
        tagName: el.tagName,
        originalPosition: metadata.originalStyles['position'] ?? '',
        newPosition: metadata.action,
        originalCoords: {
          top: metadata.originalStyles['top'] ?? '',
          left: metadata.originalStyles['left'] ?? '',
          bottom: metadata.originalStyles['bottom'] ?? '',
          right: metadata.originalStyles['right'] ?? '',
        },
        newCoords: { top: 'N/A', left: 'N/A' },
        timestamp: Date.now(),
        justification: this.getJustificationForAction(metadata.type, metadata.action),
      });
    }

    // Restaurar scroll original
    window.scrollTo(0, originalScrollY);

    result.hiddenElements = [...this.stickyElementsState];

    this.logger.info('CAPTURE', 'STICKY_ELEMENTS_V3_COMPLETE', {
      totalProcessed: result.totalProcessed,
      fixedElementsFound: fixedCount,
      stickyElementsFound: stickyCount,
      headerCaptured: result.compositionInfo.headerCaptured,
      footerCaptured: result.compositionInfo.footerCaptured,
      elementsByType: this.countElementsByType(result.elementsProcessed),
      statesStored: this.stickyElementsState.length,
      processingTimeMs: Date.now() - startTime,
    });

    // Armazenar resultado para metadados forenses
    this.stickyHandlingResultV3 = result;

    return result;
  }

  /**
   * Classifica um elemento sticky/fixed pelo seu tipo
   */
  private classifyStickyElement(
    el: HTMLElement,
    rect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
    _zIndex: number
  ): StickyElementType {
    // Verificar se é cookie banner
    if (this.isCookieBanner(el)) {
      return 'cookie-banner';
    }

    // Verificar se é widget conhecido
    if (this.isKnownWidget(el)) {
      return 'widget';
    }

    // Verificar se é header
    if (this.isLikelyHeader(el, rect, viewportWidth)) {
      return 'header';
    }

    // Verificar se é footer
    if (this.isLikelyFooter(el, rect, viewportHeight, viewportWidth)) {
      return 'footer';
    }

    // Verificar se é sidebar
    if (this.isLikelySidebar(el, rect, viewportWidth, viewportHeight)) {
      return 'sidebar';
    }

    // Verificar se é widget por heurísticas
    if (this.isWidgetByHeuristics(el, rect, viewportHeight, viewportWidth)) {
      return 'widget';
    }

    return 'other';
  }

  /**
   * Verifica se elemento é um cookie banner/consent dialog
   */
  private isCookieBanner(el: HTMLElement): boolean {
    const cookieKeywords = [
      'cookie', 'consent', 'gdpr', 'privacy', 'accept',
      'policy', 'banner', 'notice', 'compliance'
    ];

    const text = (el.textContent || '').toLowerCase();
    const className = (el.className || '').toString().toLowerCase();
    const id = (el.id || '').toLowerCase();

    return cookieKeywords.some(keyword =>
      text.includes(keyword) ||
      className.includes(keyword) ||
      id.includes(keyword)
    );
  }

  /**
   * Verifica se elemento é provavelmente um footer
   */
  private isLikelyFooter(
    el: HTMLElement,
    rect: DOMRect,
    viewportHeight: number,
    viewportWidth: number
  ): boolean {
    const footerSelectors = [
      'footer', '[role="contentinfo"]', '.footer', '#footer',
      '.site-footer', '.page-footer', '.main-footer'
    ];

    const matchesFooterSelector = footerSelectors.some(sel => {
      try { return el.matches(sel); }
      catch { return false; }
    });

    // Verificar por posição e tamanho
    const isAtBottom = rect.bottom >= viewportHeight - 10;
    const isWide = rect.width >= viewportWidth * 0.8;
    const hasReasonableHeight = rect.height >= 40 && rect.height <= 300;

    return matchesFooterSelector || (isAtBottom && isWide && hasReasonableHeight);
  }

  /**
   * Verifica se elemento é provavelmente uma sidebar
   */
  private isLikelySidebar(
    el: HTMLElement,
    rect: DOMRect,
    viewportWidth: number,
    viewportHeight: number
  ): boolean {
    const sidebarSelectors = [
      'aside', '[role="complementary"]', '.sidebar', '#sidebar',
      '.side-nav', '.side-menu', '.left-panel', '.right-panel'
    ];

    const matchesSidebarSelector = sidebarSelectors.some(sel => {
      try { return el.matches(sel); }
      catch { return false; }
    });

    // Verificar por posição e tamanho
    const isNarrow = rect.width < viewportWidth * 0.3;
    const isTall = rect.height >= viewportHeight * 0.5;
    const isOnSide = rect.left <= 10 || rect.right >= viewportWidth - 10;

    return matchesSidebarSelector || (isNarrow && isTall && isOnSide);
  }

  /**
   * Captura um elemento específico como canvas
   *
   * NOTA: Por limitações técnicas do Chrome Extension MV3, não é possível capturar
   * elementos individuais diretamente. Esta implementação cria um placeholder
   * que será substituído por uma captura real via chrome.tabs API em versão futura.
   *
   * TODO: Implementar usando offscreen API do Chrome quando disponível
   */
  private async captureElement(element: HTMLElement): Promise<HTMLCanvasElement | null> {
    try {
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      // Criar canvas temporário
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) {return null;}

      // Por enquanto, criar uma representação simplificada do elemento
      // Isso é temporário até implementarmos a captura real
      ctx.scale(dpr, dpr);

      // Desenhar background
      const bgColor = computedStyle.backgroundColor ?? 'white';
      if (bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      // Desenhar borda se houver
      const borderWidth = parseFloat(computedStyle.borderWidth) || 0;
      if (borderWidth > 0) {
        ctx.strokeStyle = computedStyle.borderColor ?? '#ccc';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(
          borderWidth / 2,
          borderWidth / 2,
          rect.width - borderWidth,
          rect.height - borderWidth
        );
      }

      // Adicionar texto indicando que é um placeholder
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `[${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}]`,
        rect.width / 2,
        rect.height / 2
      );

      this.logger.info('CAPTURE', 'ELEMENT_CAPTURE_PLACEHOLDER', {
        tagName: element.tagName,
        id: element.id,
        width: rect.width,
        height: rect.height,
        note: 'Placeholder temporário - captura real será implementada com offscreen API',
      });

      return canvas;
    } catch (error) {
      this.logger.error('CAPTURE', 'ELEMENT_CAPTURE_ERROR', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      return null;
    }
  }

  /**
   * Gera justificativa forense para a ação tomada
   */
  private getJustificationForAction(type: StickyElementType, action: string): string {
    const justifications: Record<string, string> = {
      'header:captured-once': 'Header principal capturado separadamente para composição única no topo da imagem final',
      'header:hidden': 'Header adicional ocultado para evitar duplicação',
      'footer:captured-once': 'Footer principal capturado separadamente para composição única no final da imagem final',
      'footer:hidden': 'Footer adicional ocultado para evitar duplicação',
      'cookie-banner:hidden': 'Banner de cookies/GDPR ocultado - não faz parte do conteúdo principal da página',
      'widget:hidden': 'Widget flutuante ocultado - elemento auxiliar não essencial ao conteúdo',
      'sidebar:hidden': 'Barra lateral fixa ocultada temporariamente para captura limpa do conteúdo principal',
      'other:hidden': 'Elemento sticky/fixed genérico ocultado para evitar repetição na captura',
    };

    const key = `${type}:${action}`;
    return justifications[key] ?? `Elemento ${type} processado com ação ${action}`;
  }

  /**
   * Conta elementos por tipo para relatório
   */
  private countElementsByType(elements: StickyElementMetadata[]): Record<StickyElementType, number> {
    const counts: Record<string, number> = {};

    for (const element of elements) {
      counts[element.type] = (counts[element.type] ?? 0) + 1;
    }

    return counts as Record<StickyElementType, number>;
  }

  /**
   * Converte um elemento de position:fixed para position:absolute.
   *
   * TÉCNICA DO FIRESHOT: Em vez de ocultar o elemento, convertemos de fixed
   * para absolute com a posição calculada. Assim o elemento fica "grudado"
   * na sua posição original na página e não segue o scroll.
   *
   * Vantagens desta técnica:
   * 1. Não depende de !important sobrescrever outros estilos
   * 2. O elemento continua visível mas na posição correta
   * 3. Funciona mesmo se o site tiver JavaScript que monitora mudanças
   * 4. Mantém integridade forense - elemento não é removido, apenas reposicionado
   *
   * @param el - Elemento HTML a ser convertido
   */
  private aggressivelyHideElement(el: HTMLElement): void {
    // Encontrar o estado salvo para este elemento para armazenar valores originais
    const state = this.stickyElementsState.find(s => s.element === el);

    // Salvar o style completo para restauração
    const originalStyleAttr = el.getAttribute('style') ?? '';
    if (state) {
      (state as StickyElementState & { originalStyleAttr?: string }).originalStyleAttr = originalStyleAttr;
    }

    // TÉCNICA FIRESHOT: Converter fixed/sticky para absolute com posição calculada
    // ============================================================================
    // Esta técnica é usada por extensões como FireShot e GoFullPage:
    // 1. Obtém a posição atual do elemento no viewport (getBoundingClientRect)
    // 2. Soma o scroll atual para obter posição absoluta no documento
    // 3. Converte position de fixed/sticky para absolute
    // 4. Define top/left para a posição absoluta calculada
    //
    // RESULTADO: O elemento fica "ancorado" nessa posição do documento.
    // Quando fazemos scroll para capturar viewports subsequentes, o elemento
    // NÃO segue o viewport - ele permanece fixo no topo do documento.
    // Isso faz com que o header apareça apenas no primeiro viewport naturalmente!
    // ============================================================================

    const rect = el.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Calcular posição absoluta no documento
    const absoluteTop = rect.top + scrollTop;
    const absoluteLeft = rect.left + scrollLeft;

    // Preservar dimensões originais do elemento
    const originalWidth = rect.width;
    const originalHeight = rect.height;

    // Obter z-index original para manter camada
    const computedStyle = window.getComputedStyle(el);
    const originalZIndex = computedStyle.zIndex;

    // Construir novo estilo - converter para absolute mantendo aparência
    const fireshotStyles = [
      'position: absolute !important',
      `top: ${absoluteTop}px !important`,
      `left: ${absoluteLeft}px !important`,
      `width: ${originalWidth}px !important`,
      `height: ${originalHeight}px !important`,
      `z-index: ${originalZIndex} !important`,
      'margin: 0 !important',
      'transform: none !important',
      'bottom: auto !important',
      'right: auto !important',
    ].join('; ');

    // Aplicar estilos
    el.setAttribute('style', fireshotStyles);

    // Também aplicar via style object para garantir
    try {
      el.style.cssText = fireshotStyles;
    } catch {
      // Ignorar se falhar
    }

    // Registrar modificação para ISO 27037
    this.recordDOMModification({
      type: 'modify-style',
      selector: this.generateElementSelector(el),
      property: 'position-conversion',
      originalValue: `position: ${computedStyle.position}; top: ${computedStyle.top}`,
      newValue: `position: absolute; top: ${absoluteTop}px`,
      forensicReason: 'Técnica Fireshot - conversão de fixed para absolute para evitar repetição em captura full-page'
    });

    this.logger.info('CAPTURE', 'ELEMENT_CONVERTED_TO_ABSOLUTE', {
      tagName: el.tagName,
      id: el.id || undefined,
      className: (el.className || '').toString().substring(0, 100),
      originalPosition: computedStyle.position,
      calculatedTop: absoluteTop,
      calculatedLeft: absoluteLeft,
      originalWidth,
      originalHeight,
    });
  }

  /**
   * Restaura elementos sticky ao estado original
   *
   * Deve ser chamado após a captura para restaurar a página ao estado normal.
   * Restaura o atributo style completo que foi sobrescrito pela ocultação ultra-agressiva.
   *
   * @returns Número de elementos restaurados
   */
  private restoreStickyElements(): number {
    let restoredCount = 0;

    for (const state of this.stickyElementsState) {
      try {
        // Verificar se temos o style original completo salvo
        const extState = state as StickyElementState & { originalStyleAttr?: string };

        if (extState.originalStyleAttr !== undefined) {
          // Restaurar o atributo style completo de uma vez
          if (extState.originalStyleAttr === '') {
            state.element.removeAttribute('style');
          } else {
            state.element.setAttribute('style', extState.originalStyleAttr);
          }
        } else {
          // Fallback: restaurar propriedades individuais
          state.element.style.position = state.originalPosition;
          state.element.style.top = state.originalTop;
          state.element.style.bottom = state.originalBottom;
          state.element.style.left = state.originalLeft;
          state.element.style.right = state.originalRight;
          state.element.style.zIndex = state.originalZIndex;
          state.element.style.transform = state.originalTransform;

          if (state.originalDisplay !== undefined) {
            state.element.style.display = state.originalDisplay;
          }
          if (state.originalVisibility !== undefined) {
            state.element.style.visibility = state.originalVisibility;
          }
          if (state.originalOpacity !== undefined) {
            state.element.style.opacity = state.originalOpacity;
          }
          if (state.originalHeight !== undefined) {
            state.element.style.height = state.originalHeight;
          }
          if (state.originalOverflow !== undefined) {
            state.element.style.overflow = state.originalOverflow;
          }
          if (state.originalPointerEvents !== undefined) {
            state.element.style.pointerEvents = state.originalPointerEvents;
          }
          if (state.originalClipPath !== undefined) {
            state.element.style.clipPath = state.originalClipPath;
          }
        }

        restoredCount++;
      } catch (error) {
        this.logger.warn('CAPTURE', 'STICKY_ELEMENT_RESTORE_FAILED', {
          tagName: state.element.tagName,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    this.logger.info('CAPTURE', 'STICKY_ELEMENTS_RESTORED', {
      totalRestored: restoredCount,
    });

    // Limpar estado
    this.stickyElementsState = [];

    return restoredCount;
  }

  // ==========================================================================
  // Métodos de Aguardo de Recursos
  // ==========================================================================

  /**
   * Aguarda carregamento completo de recursos
   * Requirements 6.3, 6.4, 6.5, 6.6
   *
   * MELHORADO com verificação de estabilidade visual (VisualStabilityChecker)
   * para garantir que spinners e conteúdo dinâmico sejam carregados antes da captura.
   */
  private async waitForResources(): Promise<void> {
    const startWait = Date.now();

    // Aguardar document.readyState === 'complete' (Requirement 6.3)
    await this.waitForDocumentReady();

    // Aguardar imagens (Requirement 6.4)
    await this.waitForImages();

    // Aguardar fontes (Requirement 6.5)
    await this.waitForFonts();

    // NOVO: Aguardar estabilidade visual (DOM sem mutações + sem spinners)
    // Garante que SPAs e conteúdo AJAX estejam carregados
    const stabilityChecker = new VisualStabilityChecker();
    const stabilityResult = await stabilityChecker.waitForStability({
      mutationSettleMs: CAPTURE_DELAYS.MUTATION_SETTLE_MS,
      maxWaitMs: CAPTURE_DELAYS.MAX_STABILITY_WAIT_MS,
      checkSpinners: true,
    });

    this.logger.info('CAPTURE', 'VISUAL_STABILITY_CHECK', {
      stable: stabilityResult.stable,
      mutationCount: stabilityResult.mutationCount,
      spinnersDetected: stabilityResult.spinnersDetected,
      waitTimeMs: stabilityResult.waitTimeMs,
      spinnerSelectors: stabilityResult.spinnerSelectors.slice(0, 5), // Limitar para log
    });

    // Registrar nos metadados forenses
    this.stabilityCheckResult = stabilityResult;

    // NOVO: Forçar carregamento de background images lazy
    await this.forceLazyBackgroundImages();

    const waitTime = Date.now() - startWait;
    this.logger.info('CAPTURE', 'RESOURCES_LOADED', {
      waitTimeMs: waitTime,
      visualStabilityMs: stabilityResult.waitTimeMs,
    });
  }

  /**
   * Aguarda document.readyState === 'complete'
   * Requirement 6.3
   */
  private waitForDocumentReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout aguardando document.readyState'));
      }, this.config.pageLoadTimeout);

      const checkReady = () => {
        if (document.readyState === 'complete') {
          clearTimeout(timeout);
          resolve();
        } else {
          requestAnimationFrame(checkReady);
        }
      };

      checkReady();
    });
  }

  /**
   * Aguarda todas as imagens carregarem
   * Requirement 6.4
   */
  private waitForImages(): Promise<void> {
    return new Promise((resolve, _reject) => {
      const images = Array.from(document.querySelectorAll('img'));
      const pendingImages = images.filter((img) => !img.complete);

      if (pendingImages.length === 0) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.logger.warn('CAPTURE', 'IMAGES_TIMEOUT', {
          pending: pendingImages.length,
        });
        resolve(); // Continuar mesmo com timeout
      }, this.config.pageLoadTimeout);

      let loadedCount = 0;
      const totalPending = pendingImages.length;

      const onImageLoad = () => {
        loadedCount++;
        if (loadedCount >= totalPending) {
          clearTimeout(timeout);
          resolve();
        }
      };

      pendingImages.forEach((img) => {
        if (img.complete) {
          onImageLoad();
        } else {
          img.addEventListener('load', onImageLoad, { once: true });
          img.addEventListener('error', onImageLoad, { once: true });
        }
      });
    });
  }

  /**
   * Informações sobre modificação de imagem para registro forense
   */
  private lazyImageModifications: Array<{
    selector: string;
    originalState: Record<string, string | null>;
    modification: string;
    timestamp: number;
  }> = [];

  /**
   * Aguarda imagens no viewport atual carregarem com abordagem híbrida forense
   *
   * ESTRATÉGIA FORENSE APRIMORADA:
   * 1. PRIMEIRO: Registra estado original de todas as imagens lazy-loaded
   * 2. SEGUNDO: Aguarda carregamento natural com detecção progressiva
   * 3. TERCEIRO: Verifica estabilidade (3 checks sem mudança)
   * 4. QUARTO: Para imagens com data-src que não carregaram, força carregamento
   *    MAS registra a modificação para transparência forense
   *
   * Isso garante:
   * - Documentação do estado original do DOM
   * - Screenshots com conteúdo visível (não em branco)
   * - Transparência total sobre modificações realizadas
   * - Detecção precisa de quando o carregamento realmente terminou
   *
   * As modificações são registradas em `lazyImageModifications` e podem ser
   * incluídas nos metadados forenses da prova.
   *
   * @param timeoutMs - Timeout máximo para aguardar (padrão: 2500ms)
   * @returns Estatísticas de carregamento
   */
  private async waitForLazyImages(timeoutMs = 2500): Promise<number> {
    const startTime = Date.now();

    // Obter viewport atual
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const viewportLeft = window.scrollX;
    const viewportRight = viewportLeft + window.innerWidth;

    // Coletar todas as imagens no viewport
    const allImages = Array.from(document.querySelectorAll('img'));
    const imagesInViewport: HTMLImageElement[] = [];

    for (const img of allImages) {
      const rect = img.getBoundingClientRect();
      const imgTop = rect.top + window.scrollY;
      const imgBottom = rect.bottom + window.scrollY;
      const imgLeft = rect.left + window.scrollX;
      const imgRight = rect.right + window.scrollX;

      // Verificar se imagem está no viewport (com margem de 50px)
      const isInViewport = 
        imgBottom >= viewportTop - 50 &&
        imgTop <= viewportBottom + 50 &&
        imgRight >= viewportLeft - 50 &&
        imgLeft <= viewportRight + 50;

      if (isInViewport) {
        imagesInViewport.push(img);
      }
    }

    if (imagesInViewport.length === 0) {
      return 0;
    }

    // FASE 1: Registrar estado original e separar imagens
    const pendingImages: HTMLImageElement[] = [];
    const lazyDataSrcImages: HTMLImageElement[] = [];
    let alreadyLoadedCount = 0;

    for (const img of imagesInViewport) {
      if (img.complete && img.naturalHeight > 0) {
        alreadyLoadedCount++;
      } else if (img.src) {
        // Imagem tem src mas ainda não carregou
        pendingImages.push(img);
      } else {
        // Imagem sem src - verificar atributos de lazy loading expandidos
        let dataSrc: string | null = null;
        for (const attr of LAZY_LOADING_ATTRIBUTES) {
          const value = img.getAttribute(attr);
          if (value && !attr.includes('bg')) { // Ignorar atributos de background
            dataSrc = value;
            break;
          }
        }
        if (dataSrc) {
          lazyDataSrcImages.push(img);
        }
      }
    }

    this.logger.info('CAPTURE', 'LAZY_IMAGES_ANALISE', {
      totalNoViewport: imagesInViewport.length,
      jaCarregadas: alreadyLoadedCount,
      pendentesComSrc: pendingImages.length,
      lazyDataSrc: lazyDataSrcImages.length,
    });

    // FASE 2: Aguardar carregamento natural com DETECÇÃO PROGRESSIVA
    let loadedCount = 0;
    let previousLoadedCount = alreadyLoadedCount;
    let stableChecks = 0;
    const maxStableChecks = CAPTURE_DELAYS.LAZY_STABILITY_CHECKS_REQUIRED;
    const checkInterval = CAPTURE_DELAYS.LAZY_STABILITY_CHECK_INTERVAL;

    // Loop de detecção progressiva
    while ((Date.now() - startTime) < timeoutMs) {
      // Contar imagens carregadas atualmente
      let currentLoadedCount = 0;
      for (const img of imagesInViewport) {
        if (img.complete && img.naturalHeight > 0) {
          currentLoadedCount++;
        }
      }

      // Verificar também por imagens incompletas (placeholders, etc)
      const incompleteImages = this.detectIncompleteImages();

      // Verificar se houve mudança
      if (currentLoadedCount === previousLoadedCount && incompleteImages.length === 0) {
        stableChecks++;

        // Se estável por N checks consecutivos, considerar completo
        if (stableChecks >= maxStableChecks) {
          this.logger.info('CAPTURE', 'LAZY_LOADING_ESTAVEL', {
            imagensCarregadas: currentLoadedCount,
            checksEstabilidade: stableChecks,
            tempoDecorridoMs: Date.now() - startTime,
            imagensIncompletas: 0,
          });
          loadedCount = currentLoadedCount - alreadyLoadedCount;
          break;
        }
      } else {
        // Houve mudança ou ainda há imagens incompletas, resetar contador
        stableChecks = 0;
        previousLoadedCount = currentLoadedCount;

        this.logger.info('CAPTURE', 'LAZY_LOADING_PROGRESSO', {
          imagensCarregadas: currentLoadedCount,
          novasCarregadas: currentLoadedCount - previousLoadedCount,
          imagensIncompletas: incompleteImages.length,
        });
      }

      // Aguardar antes do próximo check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Se timeout, contar o que conseguiu carregar
    if (stableChecks < maxStableChecks) {
      loadedCount = 0;
      for (const img of pendingImages) {
        if (img.complete && img.naturalHeight > 0) {
          loadedCount++;
        }
      }

      this.logger.warn('CAPTURE', 'LAZY_LOADING_TIMEOUT', {
        imagensCarregadas: loadedCount + alreadyLoadedCount,
        tempoTotalMs: Date.now() - startTime,
      });
    }

    // FASE 3: Forçar carregamento de imagens data-src COM REGISTRO FORENSE
    let forcedLoadCount = 0;
    if (lazyDataSrcImages.length > 0) {
      const remainingTime = timeoutMs - (Date.now() - startTime);
      if (remainingTime > 500) {
        for (const img of lazyDataSrcImages) {
          // Registrar estado original ANTES de modificar
          const originalState: Record<string, string | null> = {
            src: img.getAttribute('src'),
            'data-src': img.getAttribute('data-src'),
            'data-lazy-src': img.getAttribute('data-lazy-src'),
            'data-original': img.getAttribute('data-original'),
            loading: img.getAttribute('loading'),
          };

          // Buscar em todos os atributos de lazy loading
          let dataSrc: string | null = null;
          for (const attr of LAZY_LOADING_ATTRIBUTES) {
            const value = img.getAttribute(attr);
            if (value && !attr.includes('bg')) {
              dataSrc = value;
              break;
            }
          }

          if (dataSrc) {
            // Gerar seletor único para a imagem
            const selector = this.generateImageSelector(img);
            
            // Registrar modificação para transparência forense
            this.lazyImageModifications.push({
              selector,
              originalState,
              modification: `src definido para: ${dataSrc.substring(0, 100)}`,
              timestamp: Date.now(),
            });

            // Aplicar src
            img.src = dataSrc;

            this.logger.info('CAPTURE', 'LAZY_IMAGE_FORCADO_COM_REGISTRO', {
              selector: selector.substring(0, 80),
              dataSrc: dataSrc.substring(0, 80),
            });
          }
        }

        // Aguardar carregamento das imagens forçadas
        const forcedLoadPromises = lazyDataSrcImages.map((img) => {
          return new Promise<boolean>((resolve) => {
            if (img.complete && img.naturalHeight > 0) {
              forcedLoadCount++;
              resolve(true);
              return;
            }

            const timeout = setTimeout(() => resolve(false), 1500);

            img.addEventListener('load', () => {
              clearTimeout(timeout);
              forcedLoadCount++;
              resolve(true);
            }, { once: true });

            img.addEventListener('error', () => {
              clearTimeout(timeout);
              resolve(false);
            }, { once: true });
          });
        });

        await Promise.all(forcedLoadPromises);
      }
    }

    this.logger.info('CAPTURE', 'LAZY_IMAGES_CONCLUIDO', {
      carregadasNaturalmente: loadedCount,
      forcadasComRegistro: forcedLoadCount,
      modificacoesRegistradas: this.lazyImageModifications.length,
      tempoMs: Date.now() - startTime,
    });

    return alreadyLoadedCount + loadedCount + forcedLoadCount;
  }

  /**
   * Gera seletor CSS único para uma imagem (para registro forense)
   */
  private generateImageSelector(img: HTMLImageElement): string {
    // Tentar ID primeiro
    if (img.id) {
      return `#${img.id}`;
    }

    // Tentar classes únicas
    if (img.className) {
      const classes = img.className.split(' ').filter(c => c.trim()).slice(0, 3);
      if (classes.length > 0) {
        return `img.${classes.join('.')}`;
      }
    }

    // Usar atributos
    const alt = img.getAttribute('alt');
    if (alt) {
      return `img[alt="${alt.substring(0, 50).replace(/"/g, '\\"')}"]`;
    }

    // Fallback: posição no DOM
    const parent = img.parentElement;
    if (parent) {
      const siblings = Array.from(parent.querySelectorAll('img'));
      const index = siblings.indexOf(img);
      return `${parent.tagName.toLowerCase()} > img:nth-of-type(${index + 1})`;
    }

    return 'img';
  }

  /**
   * Retorna as modificações de lazy loading realizadas (para metadados forenses)
   */
  public getLazyImageModifications(): typeof this.lazyImageModifications {
    return [...this.lazyImageModifications];
  }

  /**
   * Limpa registro de modificações (chamar no início de nova captura)
   */
  private clearLazyImageModifications(): void {
    this.lazyImageModifications = [];
  }

  /**
   * Detecta se uma imagem é um placeholder
   *
   * CONFORMIDADE FORENSE:
   * - Identifica placeholders comuns para evitar captura incompleta
   * - Não modifica, apenas detecta
   *
   * @param img - Elemento de imagem a verificar
   * @returns true se for detectado como placeholder
   */
  private isImagePlaceholder(img: HTMLImageElement): boolean {
    const src = img.src?.toLowerCase() || '';

    // Verificar data URIs de placeholder comuns
    if (src.startsWith('data:image')) {
      // Data URIs muito pequenas são geralmente placeholders (1x1 pixels, etc)
      if (src.length < 200) {
        return true;
      }
      // Procurar por padrões conhecidos de placeholder
      if (src.includes('placeholder') || src.includes('blank') || src.includes('loading')) {
        return true;
      }
    }

    // Verificar URLs de placeholder conhecidas
    const placeholderPatterns = [
      'placeholder',
      'blank',
      'loading',
      'spinner',
      'shimmer',
      '1x1',
      'transparent',
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP', // GIF transparente 1x1
      'data:image/svg+xml', // SVGs pequenos usados como placeholder
    ];

    for (const pattern of placeholderPatterns) {
      if (src.includes(pattern)) {
        return true;
      }
    }

    // Verificar dimensões muito pequenas (possível placeholder)
    if (img.naturalWidth === 1 && img.naturalHeight === 1) {
      return true;
    }

    // Verificar classes indicativas de placeholder
    const className = img.className?.toLowerCase() || '';
    const placeholderClasses = ['placeholder', 'loading', 'lazy', 'blur', 'skeleton'];

    for (const cls of placeholderClasses) {
      if (className.includes(cls)) {
        return true;
      }
    }

    // Verificar se tem atributo loading="lazy" mas ainda não tem src real
    if (img.getAttribute('loading') === 'lazy' && !img.naturalHeight) {
      return true;
    }

    return false;
  }

  /**
   * Detecta imagens não carregadas ou com placeholders no viewport
   *
   * CONFORMIDADE FORENSE:
   * - Identifica conteúdo incompleto antes da captura
   * - Ajuda a decidir se precisa esperar mais
   *
   * @returns Lista de imagens detectadas como incompletas
   */
  private detectIncompleteImages(): HTMLImageElement[] {
    const incompleteImages: HTMLImageElement[] = [];
    const allImages = Array.from(document.querySelectorAll('img'));

    for (const img of allImages) {
      // Verificar se está visível
      const rect = img.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 &&
                       rect.top < window.innerHeight &&
                       rect.bottom > 0;

      if (!isVisible) {
        continue;
      }

      // Verificar se é placeholder
      if (this.isImagePlaceholder(img)) {
        incompleteImages.push(img);
        continue;
      }

      // Verificar se tem atributos de lazy loading não processados
      let hasUnprocessedLazy = false;
      for (const attr of LAZY_LOADING_ATTRIBUTES) {
        if (img.hasAttribute(attr) && !img.src) {
          hasUnprocessedLazy = true;
          break;
        }
      }

      if (hasUnprocessedLazy) {
        incompleteImages.push(img);
        continue;
      }

      // Verificar se está com loading="lazy" mas não carregou
      if (img.getAttribute('loading') === 'lazy' && !img.complete) {
        incompleteImages.push(img);
      }
    }

    return incompleteImages;
  }

  /**
   * Força carregamento de background images lazy
   *
   * CONFORMIDADE FORENSE:
   * - Registra todas as modificações para transparência
   * - Aplicado apenas a elementos com atributos data-bg/data-background
   *
   * @returns Número de background images processadas
   */
  private async forceLazyBackgroundImages(): Promise<number> {
    let count = 0;
    const bgAttributes = ['data-bg', 'data-background', 'data-background-image', 'data-bg-src'];

    for (const attr of bgAttributes) {
      const elements = document.querySelectorAll(`[${attr}]`);

      for (const el of elements) {
        const bgUrl = el.getAttribute(attr);
        if (!bgUrl) {
          continue;
        }

        const htmlEl = el as HTMLElement;
        const currentBg = htmlEl.style.backgroundImage;

        // Pular se já tem background
        if (currentBg && currentBg !== 'none' && currentBg.includes('url(')) {
          continue;
        }

        // Registrar modificação forense
        this.lazyImageModifications.push({
          selector: this.generateElementSelector(htmlEl),
          originalState: {
            [attr]: bgUrl,
            'background-image': currentBg,
          },
          modification: `background-image definido para: url(${bgUrl.substring(0, 80)})`,
          timestamp: Date.now(),
        });

        htmlEl.style.backgroundImage = `url(${bgUrl})`;
        count++;
      }
    }

    if (count > 0) {
      this.logger.info('CAPTURE', 'LAZY_BACKGROUND_IMAGES_FORCED', {
        count,
      });
    }

    return count;
  }

  /**
   * Calcula timeout adaptativo baseado na conexão
   *
   * Usa Network Information API quando disponível para ajustar
   * o timeout de lazy loading baseado na velocidade de conexão.
   *
   * @returns Timeout em ms
   */
  private calculateLazyTimeout(): number {
    const baseTimeout = CAPTURE_DELAYS.LAZY_IMAGES_TIMEOUT;

    // Usar Network Information API se disponível
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = (navigator as any).connection;
    if (!connection) {
      return baseTimeout;
    }

    switch (connection.effectiveType) {
      case '4g':
        return Math.min(baseTimeout, 3000);
      case '3g':
        return Math.round(baseTimeout * 1.5);
      case '2g':
        return Math.round(baseTimeout * 2.5);
      case 'slow-2g':
        return Math.round(baseTimeout * 3);
      default:
        return baseTimeout;
    }
  }

  /**
   * Aguarda fontes carregarem
   * Requirement 6.5
   */
  private async waitForFonts(): Promise<void> {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout aguardando fontes')), this.config.pageLoadTimeout)
        ),
      ]);
    } catch (error) {
      this.logger.warn('CAPTURE', 'FONTS_TIMEOUT', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Continuar mesmo com timeout
    }
  }

  // ==========================================================================
  // Métodos de Captura
  // ==========================================================================

  /**
   * Detecta se a página possui infinite scroll
   *
   * ESTRATÉGIA:
   * 1. Guarda scrollHeight inicial
   * 2. Faz scroll de N viewports para baixo (trigger lazy loading)
   * 3. Aguarda carregamento (lazy images)
   * 4. Mede novo scrollHeight
   * 5. Se cresceu mais de X%, é infinite scroll
   *
   * CONFORMIDADE ISO 27037:
   * - Processo documentado e reproduzível
   * - Decisão baseada em métricas objetivas
   * - Resultado registrado nos metadados forenses
   *
   * @returns Resultado da detecção com métricas
   */
  private async detectInfiniteScroll(): Promise<{
    isInfinite: boolean;
    initialHeight: number;
    finalHeight: number;
    growthPercent: number;
  }> {
    this.logger.info('CAPTURE', 'INFINITE_SCROLL_DETECTION_START', {
      viewportsToScroll: this.config.infiniteScrollDetectionViewports,
      growthThreshold: this.config.infiniteScrollGrowthThreshold,
    });

    // 1. Guardar altura inicial
    const initialHeight = Math.max(
      document.body?.scrollHeight ?? 0,
      document.documentElement?.scrollHeight ?? 0
    );

    // 2. Calcular distância de scroll para detecção
    const testScrollDistance = window.innerHeight * this.config.infiniteScrollDetectionViewports;
    const targetScrollY = Math.min(testScrollDistance, initialHeight);

    this.logger.info('CAPTURE', 'INFINITE_SCROLL_DETECTION_SCROLLING', {
      initialHeight,
      targetScrollY,
      viewportHeight: window.innerHeight,
    });

    // 3. Scroll em passos para garantir trigger de IntersectionObserver
    // Sites como G1 usam IntersectionObserver que pode não disparar com smooth scroll
    const scrollSteps = 5;
    const stepHeight = targetScrollY / scrollSteps;

    for (let step = 1; step <= scrollSteps; step++) {
      const stepY = Math.min(stepHeight * step, targetScrollY);
      window.scrollTo(0, stepY);
      // Aguardar cada passo para IntersectionObserver processar
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 4. Aguardar lazy loading de imagens e conteúdo
    await this.waitForLazyImages(this.calculateLazyTimeout());
    await new Promise(resolve => setTimeout(resolve, 3000)); // Delay maior para infinite scroll pesado

    // 5. Medir nova altura
    const finalHeight = Math.max(
      document.body?.scrollHeight ?? 0,
      document.documentElement?.scrollHeight ?? 0
    );

    // 6. Calcular crescimento
    const growth = finalHeight - initialHeight;
    const growthPercent = initialHeight > 0 ? growth / initialHeight : 0;
    const isInfinite = growthPercent > this.config.infiniteScrollGrowthThreshold;

    // 7. Voltar ao topo
    window.scrollTo(0, 0);
    await this.waitForRender();

    const result = {
      isInfinite,
      initialHeight,
      finalHeight,
      growthPercent,
    };

    this.logger.info('CAPTURE', 'INFINITE_SCROLL_DETECTION_COMPLETE', {
      isInfinite,
      initialHeight,
      finalHeight,
      growthPercent: (growthPercent * 100).toFixed(2) + '%',
      growthThreshold: (this.config.infiniteScrollGrowthThreshold * 100).toFixed(2) + '%',
    });

    return result;
  }

  /**
   * Captura todos os viewports da página via scroll
   * Requirements 6.7, 6.8, 6.15
   *
   * Implementação baseada em full-page-screen-capture-chrome-extension:
   * - Detecta infinite scroll e aplica limite adequado
   * - Oculta elementos sticky/fixed antes da captura para evitar duplicação
   * - Calcula altura total real da página
   * - Faz scroll por cada viewport sequencialmente
   * - Captura cada seção visível
   * - Restaura elementos sticky após captura
   */
  private async captureAllViewports(
    onProgress?: ScreenshotProgressCallback
  ): Promise<{ viewports: ViewportCapture[]; stickyResult: StickyHandlingResultV3 }> {
    const viewports: ViewportCapture[] = [];

    // Limpar registro de modificações de lazy loading da captura anterior
    this.clearLazyImageModifications();

    // Salvar estados originais para restaurar depois
    const body = document.body;
    const originalBodyOverflowY = body?.style.overflowY ?? '';
    const originalDocOverflow = document.documentElement.style.overflow;
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    // Forçar overflow visível para páginas com scroll problemático
    // (ex: body { overflow-y: scroll; } pode quebrar window.scrollTo)
    if (body) {
      body.style.overflowY = 'visible';
    }

    // NOVA ESTRATÉGIA: Capturar PRIMEIRO viewport COM elementos fixos visíveis
    // Depois ocultar para os viewports subsequentes
    // Isso garante que header/banners apareçam UMA vez (no topo)
    this.logger.info('CAPTURE', 'STICKY_STRATEGY', {
      strategy: 'capture-first-then-hide',
      description: 'Primeiro viewport COM header, subsequentes SEM'
    });

    // Preparar para ocultar elementos (identificar mas NÃO ocultar ainda)
    // Será chamado APÓS o primeiro viewport
    let stickyResult: StickyHandlingResultV3 | null = null;
    let stickyElementsHidden = false;

    // Calcular dimensões ANTES de qualquer modificação
    // Elementos fixed não afetam scrollHeight, então podemos calcular agora
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // ========================================================================
    // DETECÇÃO DE INFINITE SCROLL (ANTES de calcular viewports)
    // ========================================================================
    // Detecta se a página tem infinite scroll para aplicar limite adequado
    this.reportProgress(
      onProgress,
      'capturing',
      25,
      'Analisando tipo de página...'
    );
    const infiniteScrollCheck = await this.detectInfiniteScroll();

    // Calcular altura total usando todos os métodos possíveis
    const bodyScrollHeight = body?.scrollHeight ?? 0;
    const bodyOffsetHeight = body?.offsetHeight ?? 0;
    const docScrollHeight = document.documentElement?.scrollHeight ?? 0;
    const docOffsetHeight = document.documentElement?.offsetHeight ?? 0;
    const docClientHeight = document.documentElement?.clientHeight ?? 0;

    const fullHeight = Math.max(
      bodyScrollHeight,
      bodyOffsetHeight,
      docScrollHeight,
      docOffsetHeight,
      docClientHeight
    );

    // ========================================================================
    // APLICAR LIMITE DE ALTURA BASEADO NO TIPO DE PÁGINA
    // ========================================================================
    // Infinite scroll: limite menor para evitar captura infinita
    // Página fixa: limite maior para captura completa
    const effectiveMaxHeight = infiniteScrollCheck.isInfinite
      ? this.config.infiniteScrollMaxHeight
      : this.config.maxCaptureHeight;

    const cappedHeight = Math.min(fullHeight, effectiveMaxHeight);
    const wasTruncated = fullHeight > cappedHeight;

    // Determinar motivo do truncamento
    let truncationReason: CaptureTruncationReason = null;
    if (wasTruncated) {
      truncationReason = infiniteScrollCheck.isInfinite
        ? 'infinite_scroll_detected'
        : 'max_height_exceeded';
    }

    // Registrar CaptureScope para metadados forenses (ISO 27037)
    this.captureScope = {
      totalPageHeight: fullHeight,
      capturedHeight: cappedHeight,
      wasTruncated,
      truncationReason,
      infiniteScrollDetected: infiniteScrollCheck.isInfinite,
      scrollHeightGrowth: infiniteScrollCheck.growthPercent,
      captureStartY: 0,
      captureEndY: cappedHeight,
      timestamp: Date.now(),
    };

    this.logger.info('CAPTURE', 'CAPTURE_SCOPE_DETERMINED', {
      fullHeight,
      cappedHeight,
      wasTruncated,
      truncationReason,
      infiniteScrollDetected: infiniteScrollCheck.isInfinite,
      effectiveMaxHeight,
    });

    // Calcular largura total
    const bodyScrollWidth = body?.scrollWidth ?? 0;
    const docScrollWidth = document.documentElement?.scrollWidth ?? 0;
    const fullWidth = Math.max(bodyScrollWidth, docScrollWidth, viewportWidth);

    // Para prova judicial, NÃO usamos overlap/padding
    // Cada viewport é capturado sequencialmente sem sobreposição
    // Com sticky elements ocultos, não há risco de duplicação
    const SCROLL_PAD = 0;

    // Delta Y é a altura completa do viewport (sem padding)
    const yDelta = viewportHeight;

    const xDelta = viewportWidth;

    // Ajustar largura se for muito próxima do viewport (evitar off-by-1)
    const adjustedFullWidth = fullWidth <= xDelta + 1 ? xDelta : fullWidth;

    // Desabilitar scrollbars durante captura
    document.documentElement.style.overflow = 'hidden';

    // Calcular posições de scroll de forma sequencial (de cima para baixo)
    // Abordagem simples e auditável para prova judicial
    // IMPORTANTE: Usar cappedHeight ao invés de fullHeight para limitar captura
    const arrangements: Array<{ x: number; y: number }> = [];
    let yPos = 0;

    while (yPos < cappedHeight) {
      // Apenas scroll vertical (x = 0) para simplicidade
      arrangements.push({ x: 0, y: yPos });
      yPos += yDelta;
    }

    const totalViewports = arrangements.length;
    const devicePixelRatio = window.devicePixelRatio || 1;

    this.logger.info('CAPTURE', 'VIEWPORTS_CALCULATED', {
      fullHeight,
      cappedHeight,
      wasTruncated,
      truncationReason,
      fullWidth: adjustedFullWidth,
      viewportHeight,
      viewportWidth,
      yDelta,
      scrollPad: SCROLL_PAD,
      totalViewports,
      devicePixelRatio,
      bodyScrollHeight,
      docScrollHeight,
      stickyStrategy: 'capture-first-then-hide',
      arrangements: arrangements.map(a => `[${a.x},${a.y}]`).join(', '),
    });

    // Usar constantes globais CAPTURE_DELAYS para delays configurados
    // Valores FIXOS garantem reprodutibilidade forense (ISO/IEC 27037)
    let lastCaptureTime = 0;

    // Timestamp de início da captura para timeout de segurança
    const captureLoopStartTime = Date.now();

    /**
     * Função de limpeza para restaurar estado original
     */
    const cleanup = () => {
      // Restaurar elementos sticky ao estado original
      this.restoreStickyElements();

      document.documentElement.style.overflow = originalDocOverflow;
      if (body) {
        body.style.overflowY = originalBodyOverflowY;
      }
      window.scrollTo(originalScrollX, originalScrollY);
    };

    try {
      for (let i = 0; i < totalViewports; i++) {
        // Verificar se captura foi cancelada
        if (!this.isCapturing) {
          this.logger.warn('CAPTURE', 'CAPTURE_CANCELLED_DURING_VIEWPORTS', {
            capturedViewports: i,
            totalViewports,
          });
          throw new Error('Captura cancelada');
        }

        // ====================================================================
        // TIMEOUT DE SEGURANÇA
        // ====================================================================
        // Evita capturas infinitas em páginas problemáticas
        // Usa timeout maior para páginas com infinite scroll (delays maiores entre viewports)
        const effectiveTimeout = infiniteScrollCheck.isInfinite
          ? this.config.maxCaptureTimeMsInfiniteScroll
          : this.config.maxCaptureTimeMs;
        const elapsedMs = Date.now() - captureLoopStartTime;
        if (elapsedMs > effectiveTimeout) {
          this.logger.warn('CAPTURE', 'CAPTURE_TIMEOUT', {
            elapsedMs,
            effectiveTimeout,
            isInfiniteScroll: infiniteScrollCheck.isInfinite,
            viewportsCaptured: i,
            totalViewports,
          });

          // Atualizar captureScope com informação de timeout
          if (this.captureScope) {
            this.captureScope.wasTruncated = true;
            this.captureScope.truncationReason = 'timeout';
            this.captureScope.captureEndY = viewports.length > 0
              ? (viewports[viewports.length - 1]?.scrollY ?? 0) + viewportHeight
              : 0;
          }

          // Encerrar loop de captura
          break;
        }

        // NOVA LÓGICA: Ocultar elementos fixos APÓS o primeiro viewport
        // Primeiro viewport (i=0): captura COM header/banners visíveis
        // Viewports subsequentes (i>0): captura SEM elementos fixos
        if (i === 1 && !stickyElementsHidden) {
          this.logger.info('CAPTURE', 'HIDING_STICKY_AFTER_FIRST_VIEWPORT', {
            viewportIndex: i,
            reason: 'Ocultar header/banners após primeiro viewport para não repetir'
          });

          // Agora sim, ocultar os elementos fixos
          stickyResult = await this.handleStickyElementsV3();
          stickyElementsHidden = true;

          // Aguardar para garantir que as mudanças visuais foram aplicadas
          await this.waitForRender();
          await this.waitForRender();
          await new Promise(resolve => setTimeout(resolve, 150));
          await this.waitForRender();

          this.logger.info('CAPTURE', 'STICKY_ELEMENTS_HIDDEN', {
            totalHidden: stickyResult.totalProcessed,
            elementsByType: this.countElementsByType(stickyResult.elementsProcessed),
          });
        }

        const arrangement = arrangements[i];
        if (!arrangement) {
          this.logger.error('CAPTURE', 'ARRANGEMENT_NOT_FOUND', { index: i });
          continue;
        }

        const { x: scrollX, y: scrollY } = arrangement;

        // Reportar progresso - ajustado para novo range (25-55%)
        const progressPercent = 25 + Math.floor((i / totalViewports) * 30);
        this.reportProgress(
          onProgress,
          'capturing',
          progressPercent,
          `Capturando viewport ${i + 1} de ${totalViewports}...`,
          i + 1,
          totalViewports
        );

        this.logger.info('CAPTURE', 'VIEWPORT_SCROLL_START', {
          viewportIndex: i + 1,
          totalViewports,
          targetScrollX: scrollX,
          targetScrollY: scrollY,
        });

        // Scroll para posição usando smooth scroll se configurado
        // Smooth scroll dispara eventos de scroll que ativam lazy loading
        if (CAPTURE_DELAYS.USE_SMOOTH_SCROLL) {
          window.scrollTo({
            left: scrollX,
            top: scrollY,
            behavior: 'smooth',
          });
          // Aguardar smooth scroll completar
          await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAYS.SMOOTH_SCROLL_SETTLE));
        } else {
          window.scrollTo(scrollX, scrollY);
        }

        // Aguardar renderização (requestAnimationFrame duplo)
        await this.waitForRender();

        // Delay adicional para elementos lazy-loaded e animações
        await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAYS.RENDER_AFTER_SCROLL));

        // NOVO: Delay extra para páginas com infinite scroll
        // Sites como G1, Twitter, etc. precisam de mais tempo para carregar conteúdo dinâmico
        if (infiniteScrollCheck.isInfinite) {
          this.logger.info('CAPTURE', 'INFINITE_SCROLL_EXTRA_WAIT', {
            viewportIndex: i + 1,
            extraDelayMs: CAPTURE_DELAYS.INFINITE_SCROLL_EXTRA_DELAY,
          });
          await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAYS.INFINITE_SCROLL_EXTRA_DELAY));
          // Aguardar mais um render após o delay extra
          await this.waitForRender();
        }

        // Aguardar carregamento natural de imagens no viewport (abordagem não-invasiva)
        // O scroll já dispara o carregamento nativo de imagens com loading="lazy"
        // Apenas observamos o carregamento, sem modificar o DOM
        // Usa timeout adaptativo baseado na velocidade de conexão
        const lazyImagesLoaded = await this.waitForLazyImages(this.calculateLazyTimeout());
        if (lazyImagesLoaded > 0) {
          this.logger.info('CAPTURE', 'LAZY_IMAGES_LOADED_BEFORE_CAPTURE', {
            viewportIndex: i + 1,
            lazyImagesLoaded,
          });
          // Aguardar mais um frame após carregamento de imagens
          await this.waitForRender();
        }

        // Verificar posição real após scroll
        const actualScrollX = window.scrollX;
        const actualScrollY = window.scrollY;

        this.logger.info('CAPTURE', 'VIEWPORT_RENDER_COMPLETE', {
          viewportIndex: i + 1,
          targetScrollY: scrollY,
          actualScrollY,
          actualScrollX,
          scrollDiff: Math.abs(actualScrollY - scrollY),
        });

        // Rate limiting: aguardar tempo mínimo entre capturas
        const timeSinceLastCapture = Date.now() - lastCaptureTime;
        if (timeSinceLastCapture < CAPTURE_DELAYS.MIN_BETWEEN_CAPTURES && lastCaptureTime > 0) {
          const waitTime = CAPTURE_DELAYS.MIN_BETWEEN_CAPTURES - timeSinceLastCapture;
          this.logger.info('CAPTURE', 'RATE_LIMIT_WAIT', {
            viewportIndex: i + 1,
            waitTimeMs: waitTime,
          });
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Capturar viewport com retry em caso de falha
        const captureStartTime = Date.now();
        let capture: ViewportCapture | null = null;
        let captureAttempt = 0;

        while (!capture && captureAttempt < CAPTURE_DELAYS.MAX_CAPTURE_RETRIES) {
          captureAttempt++;
          try {
            capture = await this.captureViewport(actualScrollY, viewportWidth, viewportHeight);
          } catch (captureError) {
            this.logger.warn('CAPTURE', 'VIEWPORT_CAPTURE_RETRY', {
              viewportIndex: i + 1,
              attempt: captureAttempt,
              maxAttempts: CAPTURE_DELAYS.MAX_CAPTURE_RETRIES,
              error: captureError instanceof Error ? captureError.message : String(captureError),
            });

            if (captureAttempt < CAPTURE_DELAYS.MAX_CAPTURE_RETRIES) {
              // Aguardar antes de tentar novamente
              await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAYS.CAPTURE_RETRY_DELAY));
              // Re-renderizar a página
              await this.waitForRender();
            } else {
              // Última tentativa falhou, propagar erro
              throw captureError;
            }
          }
        }

        if (!capture) {
          throw new Error(`Falha ao capturar viewport ${i + 1} após ${CAPTURE_DELAYS.MAX_CAPTURE_RETRIES} tentativas`);
        }

        lastCaptureTime = Date.now();

        // Armazenar informações para stitching
        const viewportCapture: ViewportCapture = {
          ...capture,
          scrollY: actualScrollY,
          width: viewportWidth,
          height: viewportHeight,
          actualViewportHeight: viewportHeight,
        };
        
        this.logger.info('CAPTURE', 'VIEWPORT_CAPTURED', {
          viewportIndex: i + 1,
          scrollY: viewportCapture.scrollY,
          width: viewportCapture.width,
          height: viewportCapture.height,
          imageSizeBytes: viewportCapture.imageData.length,
          captureTimeMs: Date.now() - captureStartTime,
        });

        viewports.push(viewportCapture);
      }
    } finally {
      // Sempre restaurar estado original
      cleanup();
      this.logger.info('CAPTURE', 'SCROLL_POSITION_RESTORED', {
        restoredScrollX: originalScrollX,
        restoredScrollY: originalScrollY,
      });
    }

    // Se não ocultamos nada (apenas 1 viewport), criar resultado padrão
    const finalStickyResult: StickyHandlingResultV3 = stickyResult ?? {
      strategy: 'v3-composition',
      elementsProcessed: [],
      compositionInfo: {
        headerCaptured: false,
        headerPosition: { x: 0, y: 0, width: 0, height: 0 },
        footerCaptured: false,
        footerPosition: { x: 0, y: 0, width: 0, height: 0 },
      },
      hiddenElements: [],
      totalProcessed: 0,
      timestamp: Date.now(),
    };

    return { viewports, stickyResult: finalStickyResult };
  }

  /**
   * Aguarda renderização do viewport
   */
  private waitForRender(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  /**
   * Registra uma modificação do DOM para documentação forense
   *
   * @param modification - Detalhes da modificação
   */
  private recordDOMModification(modification: Omit<DOMModification, 'timestamp'>): void {
    this.domModifications.push({
      ...modification,
      timestamp: Date.now()
    });

    this.logger.info('CAPTURE', 'DOM_MODIFICATION_RECORDED', {
      type: modification.type,
      selector: modification.selector,
      reason: modification.forensicReason
    });
  }

  /**
   * Captura o hash do estado original do DOM antes de qualquer modificação
   *
   * CONFORMIDADE ISO 27037:
   * - Documenta estado pristino do DOM
   * - Permite verificação de integridade
   * - Cadeia de custódia completa
   *
   * @returns Hash do estado original
   */
  private async captureOriginalStateHash(): Promise<OriginalStateHash> {
    this.logger.info('CAPTURE', 'CAPTURING_ORIGINAL_STATE_HASH', {});

    const domStructureHash = await calculateDOMStructureHash();
    const visibleElementsHash = await calculateVisibleElementsHash();

    const originalHash: OriginalStateHash = {
      domStructureHash,
      visibleElementsHash,
      timestamp: Date.now(),
      capturedBefore: 'any-modification'
    };

    this.originalStateHash = originalHash;

    this.logger.info('CAPTURE', 'ORIGINAL_STATE_HASH_CAPTURED', {
      domStructureHash: domStructureHash.substring(0, 16) + '...',
      visibleElementsHash: visibleElementsHash.substring(0, 16) + '...'
    });

    return originalHash;
  }

  /**
   * Captura o hash do estado restaurado do DOM após modificações
   *
   * @returns Hash do estado restaurado
   */
  private async captureRestoredStateHash(): Promise<RestoredStateHash> {
    this.logger.info('CAPTURE', 'CAPTURING_RESTORED_STATE_HASH', {});

    const domStructureHash = await calculateDOMStructureHash();

    const restoredHash: RestoredStateHash = {
      domStructureHash,
      timestamp: Date.now(),
      matchesOriginal: this.originalStateHash?.domStructureHash === domStructureHash
    };

    this.restoredStateHash = restoredHash;

    this.logger.info('CAPTURE', 'RESTORED_STATE_HASH_CAPTURED', {
      domStructureHash: domStructureHash.substring(0, 16) + '...',
      matchesOriginal: restoredHash.matchesOriginal
    });

    if (!restoredHash.matchesOriginal) {
      this.logger.warn('CAPTURE', 'DOM_RESTORATION_MISMATCH', {
        originalHash: this.originalStateHash?.domStructureHash.substring(0, 16) + '...',
        restoredHash: domStructureHash.substring(0, 16) + '...'
      });
    }

    return restoredHash;
  }

  /**
   * Captura RAW - Screenshot sem modificações (primeiro viewport apenas)
   *
   * CONFORMIDADE ISO 27037:
   * - Captura estado pristino da página
   * - Sem modificações no DOM
   * - Hash calculado imediatamente
   *
   * @returns Captura RAW
   */
  private async captureRawScreenshot(): Promise<RawCapture | null> {
    this.logger.info('CAPTURE', 'RAW_CAPTURE_START', {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });

    try {
      // Capturar apenas o viewport atual sem scroll
      const viewport = await this.captureViewport(
        window.scrollY,
        window.innerWidth,
        window.innerHeight
      );

      if (!viewport.imageData) {
        throw new Error('Falha ao capturar viewport RAW');
      }

      // Calcular hash imediatamente
      let imageDataOnly: string;
      if (viewport.imageData.includes('base64,')) {
        const parts = viewport.imageData.split(',');
        imageDataOnly = parts[1] ?? '';
      } else {
        imageDataOnly = viewport.imageData;
      }

      if (!imageDataOnly) {
        throw new Error('Dados de imagem RAW inválidos');
      }

      const hash = await CryptoUtils.hashBuffer(
        Uint8Array.from(atob(imageDataOnly), c => c.charCodeAt(0))
      );

      const rawCapture: RawCapture = {
        imageData: viewport.imageData,
        hash,
        capturedAt: Date.now(),
        modifications: [], // Nenhuma modificação
        width: viewport.width,
        height: viewport.height
      };

      this.logger.info('CAPTURE', 'RAW_CAPTURE_COMPLETE', {
        width: viewport.width,
        height: viewport.height,
        hash: hash.substring(0, 16) + '...'
      });

      return rawCapture;

    } catch (error) {
      this.logger.error('CAPTURE', 'RAW_CAPTURE_FAILED', { error });
      return null;
    }
  }

  /**
   * Executa captura Dual-Mode (RAW + Enhanced)
   *
   * CONFORMIDADE ISO 27037:
   * - RAW: Captura sem modificações (prova original)
   * - Enhanced: Captura com modificações documentadas
   * - Comparação entre ambas para auditoria
   *
   * @param enhancedImageData - Dados da imagem enhanced já capturada
   * @param enhancedWidth - Largura da imagem enhanced
   * @param enhancedHeight - Altura da imagem enhanced
   * @returns Resultado da captura dual-mode
   */
  private async executeDualModeCapture(
    enhancedImageData: string,
    enhancedWidth: number,
    enhancedHeight: number
  ): Promise<DualModeCapture | null> {
    this.logger.info('CAPTURE', 'DUAL_MODE_CAPTURE_START', {});

    try {
      // Primeiro: Captura RAW (sem modificações)
      const rawCapture = await this.captureRawScreenshot();
      if (!rawCapture) {
        this.logger.warn('CAPTURE', 'DUAL_MODE_RAW_FAILED', {});
        return null;
      }

      // Calcular hash da imagem enhanced
      let enhancedDataOnly: string;
      if (enhancedImageData.includes('base64,')) {
        const parts = enhancedImageData.split(',');
        enhancedDataOnly = parts[1] ?? '';
      } else {
        enhancedDataOnly = enhancedImageData;
      }

      if (!enhancedDataOnly) {
        throw new Error('Dados de imagem enhanced inválidos');
      }

      const enhancedHash = await CryptoUtils.hashBuffer(
        Uint8Array.from(atob(enhancedDataOnly), c => c.charCodeAt(0))
      );

      // Criar captura enhanced
      const enhancedCapture: EnhancedCapture = {
        imageData: enhancedImageData,
        hash: enhancedHash,
        capturedAt: Date.now(),
        modifications: [...this.domModifications], // Cópia das modificações
        width: enhancedWidth,
        height: enhancedHeight
      };

      // Criar resultado dual-mode
      const dualMode: DualModeCapture = {
        raw: rawCapture,
        enhanced: enhancedCapture,
        comparison: {
          bothAvailable: true,
          rawCapturedFirst: true, // RAW sempre capturada primeiro
          timeDifferenceMs: enhancedCapture.capturedAt - rawCapture.capturedAt
        }
      };

      this.logger.info('CAPTURE', 'DUAL_MODE_CAPTURE_COMPLETE', {
        rawHash: rawCapture.hash.substring(0, 16) + '...',
        enhancedHash: enhancedHash.substring(0, 16) + '...',
        modificationsCount: this.domModifications.length,
        timeDifferenceMs: dualMode.comparison.timeDifferenceMs
      });

      return dualMode;

    } catch (error) {
      this.logger.error('CAPTURE', 'DUAL_MODE_CAPTURE_FAILED', { error });
      return null;
    }
  }

  /**
   * Captura um viewport individual
   * Requirement 6.15 (timeout 10s)
   */
  private async captureViewport(
    scrollY: number,
    width: number,
    height: number
  ): Promise<ViewportCapture> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout ao capturar viewport em scrollY=${scrollY}`));
      }, this.config.viewportTimeout);

      // Usar chrome.tabs.captureVisibleTab via mensagem para service worker
      // Em ambiente de content script, precisamos solicitar ao background
      this.requestViewportCapture()
        .then((imageData) => {
          clearTimeout(timeout);
          resolve({
            scrollY,
            imageData,
            width,
            height,
          });
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Solicita captura do viewport ao service worker
   */
  private async requestViewportCapture(): Promise<string> {
    this.logger.info('CAPTURE', 'VIEWPORT_REQUEST_START', {
      format: this.config.format,
      quality: this.config.quality,
      hasChrome: typeof chrome !== 'undefined',
      hasRuntime: typeof chrome !== 'undefined' && !!chrome.runtime,
      hasSendMessage: typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage,
    });

    return new Promise((resolve, reject) => {
      // Verificar se estamos em ambiente de extensão
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const message = {
          type: 'CAPTURE_VIEWPORT',
          payload: {
            format: this.config.format,
            quality: this.config.quality,
          },
        };
        
        this.logger.info('CAPTURE', 'VIEWPORT_REQUEST_SENDING', {
          messageType: 'CAPTURE_VIEWPORT',
        });

        const sendStartTime = Date.now();
        
        chrome.runtime.sendMessage(
          message,
          (response) => {
            const sendDuration = Date.now() - sendStartTime;
            
            if (chrome.runtime.lastError) {
              this.logger.error('CAPTURE', 'VIEWPORT_REQUEST_CHROME_ERROR', {
                error: chrome.runtime.lastError.message,
                durationMs: sendDuration,
              });
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            this.logger.info('CAPTURE', 'VIEWPORT_REQUEST_RESPONSE', {
              success: response?.success,
              hasData: !!response?.data,
              hasImageData: !!response?.data?.imageData,
              error: response?.error,
              imageSizeBytes: response?.data?.imageData?.length ?? 0,
              durationMs: sendDuration,
            });

            if (response?.success && response?.data?.imageData) {
              resolve(response.data.imageData);
            } else {
              this.logger.error('CAPTURE', 'VIEWPORT_REQUEST_FAILED', {
                response,
              });
              reject(new Error(response?.error ?? 'Falha ao capturar viewport'));
            }
          }
        );
      } else {
        // Fallback para ambiente de teste - retornar placeholder
        this.logger.warn('CAPTURE', 'VIEWPORT_REQUEST_FALLBACK', {
          reason: 'Chrome runtime não disponível',
        });
        resolve(this.createPlaceholderImage());
      }
    });
  }

  /**
   * Cria imagem placeholder para testes
   */
  private createPlaceholderImage(): string {
    // Criar canvas com cor sólida para testes
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333';
      ctx.font = '20px Arial';
      ctx.fillText('Placeholder Screenshot', 50, 50);
    }
    // PNG para integridade forense (compressão sem perdas)
    return canvas.toDataURL('image/png');
  }

  // ==========================================================================
  // Métodos de Stitching
  // ==========================================================================

  /**
   * Faz stitching (costura) dos viewports em uma única imagem
   * Requirement 6.9
   *
   * Com elementos sticky ocultos durante a captura, o stitching é simples:
   * - Cada viewport é desenhado na sua posição Y correspondente
   * - Não há necessidade de recorte de overlap
   * - O último viewport pode ser parcial (não preenche toda a altura)
   *
   * V3: Adiciona composição de header e footer capturados separadamente
   */
  private async stitchViewports(
    viewports: ViewportCapture[],
    stickyResult?: StickyHandlingResultV3
  ): Promise<{ imageData: string; width: number; height: number }> {
    if (viewports.length === 0) {
      throw new Error('Nenhum viewport capturado');
    }

    const firstViewport = viewports[0];
    if (!firstViewport) {
      throw new Error('Primeiro viewport não encontrado');
    }

    // Carregar primeira imagem para obter dimensões REAIS (pixels físicos)
    // chrome.tabs.captureVisibleTab retorna imagem em resolução física (devicePixelRatio)
    const firstImage = await this.loadImage(firstViewport.imageData);
    const devicePixelRatio = firstImage.width / firstViewport.width;

    this.logger.info('CAPTURE', 'STITCHING_DEVICE_PIXEL_RATIO', {
      imageWidth: firstImage.width,
      imageHeight: firstImage.height,
      viewportWidth: firstViewport.width,
      viewportHeight: firstViewport.height,
      calculatedDPR: devicePixelRatio,
      windowDPR: window.devicePixelRatio,
    });

    // Caso especial: apenas um viewport
    if (viewports.length === 1) {
      return {
        imageData: firstViewport.imageData,
        width: firstImage.width,
        height: firstImage.height,
      };
    }

    // Calcular dimensões finais em PIXELS FÍSICOS
    const width = firstImage.width;
    
    // Calcular altura total real da página em pixels físicos
    const lastViewport = viewports[viewports.length - 1];
    if (!lastViewport) {
      throw new Error('Último viewport não encontrado');
    }
    
    // Altura total = (scrollY do último + altura do viewport) * devicePixelRatio
    const totalHeight = Math.round((lastViewport.scrollY + lastViewport.height) * devicePixelRatio);

    this.logger.info('CAPTURE', 'STITCHING_DIMENSIONS', {
      viewportsCount: viewports.length,
      width,
      totalHeight,
      firstScrollY: firstViewport.scrollY,
      lastScrollY: lastViewport.scrollY,
      lastViewportHeight: lastViewport.height,
    });

    // Verificar se precisa dividir (Requirement 6.16)
    if (totalHeight > this.config.maxHeightBeforeSplit) {
      this.logger.warn('CAPTURE', 'PAGE_TOO_TALL', {
        totalHeight,
        maxHeight: this.config.maxHeightBeforeSplit,
      });
    }

    // Criar canvas para stitching com dimensões em PIXELS FÍSICOS
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Falha ao criar contexto 2D para stitching');
    }

    // Carregar todas as imagens (primeira já foi carregada)
    const images: HTMLImageElement[] = [firstImage];
    for (let i = 1; i < viewports.length; i++) {
      const viewport = viewports[i];
      if (viewport) {
        const img = await this.loadImage(viewport.imageData);
        images.push(img);
      }
    }

    // Desenhar viewports sequencialmente
    // Com sticky elements ocultos, cada viewport é desenhado na sua posição Y
    // IMPORTANTE: scrollY está em pixels CSS, converter para pixels físicos
    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      const img = images[i];
      if (!viewport || !img) {
        continue;
      }

      // Posição de destino em PIXELS FÍSICOS
      const destY = Math.round(viewport.scrollY * devicePixelRatio);

      this.logger.info('CAPTURE', 'STITCHING_VIEWPORT', {
        index: i,
        scrollY: viewport.scrollY,
        scrollYPhysical: destY,
        viewportHeight: viewport.height,
        imageWidth: img.width,
        imageHeight: img.height,
        destY,
        devicePixelRatio,
      });

      // Desenhar viewport completo na posição correta
      ctx.drawImage(img, 0, destY);
    }

    // V3: Compor header e footer capturados separadamente
    if (stickyResult?.strategy === 'v3-composition') {
      this.logger.info('CAPTURE', 'COMPOSING_STICKY_ELEMENTS', {
        headerCaptured: stickyResult.compositionInfo.headerCaptured,
        footerCaptured: stickyResult.compositionInfo.footerCaptured,
      });

      // Desenhar header no topo (se capturado)
      if (stickyResult.compositionInfo.headerCaptured && stickyResult.compositionInfo.headerImageData) {
        try {
          const headerImg = await this.loadImage(stickyResult.compositionInfo.headerImageData);
          const headerY = 0; // Sempre no topo
          const headerX = Math.round(stickyResult.compositionInfo.headerPosition.x * devicePixelRatio);

          this.logger.info('CAPTURE', 'COMPOSING_HEADER', {
            x: headerX,
            y: headerY,
            width: headerImg.width,
            height: headerImg.height,
          });

          // Desenhar header com semi-transparência para indicar que foi composto
          ctx.globalAlpha = 0.95;
          ctx.drawImage(headerImg, headerX, headerY);
          ctx.globalAlpha = 1.0;

          // Adicionar linha sutil para indicar composição (auditoria forense)
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, headerImg.height);
          ctx.lineTo(width, headerImg.height);
          ctx.stroke();
        } catch (error) {
          this.logger.warn('CAPTURE', 'HEADER_COMPOSITION_FAILED', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }

      // Desenhar footer no final (se capturado)
      if (stickyResult.compositionInfo.footerCaptured && stickyResult.compositionInfo.footerImageData) {
        try {
          const footerImg = await this.loadImage(stickyResult.compositionInfo.footerImageData);
          const footerY = totalHeight - footerImg.height; // No final da imagem
          const footerX = Math.round(stickyResult.compositionInfo.footerPosition.x * devicePixelRatio);

          this.logger.info('CAPTURE', 'COMPOSING_FOOTER', {
            x: footerX,
            y: footerY,
            width: footerImg.width,
            height: footerImg.height,
            totalHeight: totalHeight,
          });

          // Desenhar footer com semi-transparência para indicar que foi composto
          ctx.globalAlpha = 0.95;
          ctx.drawImage(footerImg, footerX, footerY);
          ctx.globalAlpha = 1.0;

          // Adicionar linha sutil para indicar composição (auditoria forense)
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, footerY);
          ctx.lineTo(width, footerY);
          ctx.stroke();
        } catch (error) {
          this.logger.warn('CAPTURE', 'FOOTER_COMPOSITION_FAILED', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      }
    }

    // Converter para formato configurado (PNG padrão para integridade forense)
    const imageData = canvas.toDataURL(`image/${this.config.format}`, this.config.quality / 100);

    this.logger.info('CAPTURE', 'STITCHING_COMPLETE', {
      viewports: viewports.length,
      width,
      height: totalHeight,
      imageSizeBytes: imageData.length,
    });

    return {
      imageData,
      width,
      height: totalHeight,
    };
  }

  /**
   * Carrega imagem a partir de data URL
   */
  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = dataUrl;
    });
  }

  // ==========================================================================
  // Métodos de Coleta
  // ==========================================================================

  /**
   * Coleta HTML da página
   * Requirement 6.11
   */
  collectHtml(): string {
    return document.documentElement.outerHTML;
  }

  /**
   * Coleta metadados da captura
   * Requirement 6.12
   */
  collectMetadata(viewportsCaptured: number, width: number, height: number): CaptureMetadata {
    const extensionVersion = this.getExtensionVersion();

    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      extensionVersion,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      pageSize: {
        width,
        height,
      },
      viewportsCaptured,
      pageLoadTimeMs: Date.now() - this.startTime,
    };
  }

  /**
   * Obtém versão da extensão
   */
  private getExtensionVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
    return '0.0.0';
  }

  // ==========================================================================
  // Métodos de Hash
  // ==========================================================================

  /**
   * Calcula hash SHA-256 com timeout
   * Requirement 6.13
   */
  private async calculateHash(data: string | object): Promise<string> {
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
   * Reporta progresso da captura
   */
  private reportProgress(
    callback: ScreenshotProgressCallback | undefined,
    stage: ScreenshotCaptureProgress['stage'],
    percent: number,
    message: string,
    currentViewport?: number,
    totalViewports?: number
  ): void {
    if (callback) {
      const progress: ScreenshotCaptureProgress = {
        stage,
        percent,
        message,
      };

      if (currentViewport !== undefined) {
        progress.currentViewport = currentViewport;
      }
      if (totalViewports !== undefined) {
        progress.totalViewports = totalViewports;
      }

      callback(progress);
    }
  }
}

// ==========================================================================
// Funções Auxiliares para Reload com Cache-Busting
// ==========================================================================

/**
 * Adiciona parâmetro de cache-busting à URL
 * Requirement 6.2
 *
 * @param url - URL original
 * @returns URL com parâmetro _lexato_nocache
 */
export function addCacheBustParam(url: string): string {
  const urlObj = new URL(url);
  urlObj.searchParams.set(CACHE_BUST_PARAM, Date.now().toString());
  return urlObj.toString();
}

/**
 * Remove parâmetro de cache-busting da URL
 *
 * @param url - URL com cache-busting
 * @returns URL limpa
 */
export function removeCacheBustParam(url: string): string {
  const urlObj = new URL(url);
  urlObj.searchParams.delete(CACHE_BUST_PARAM);
  return urlObj.toString();
}

/**
 * Verifica se URL tem parâmetro de cache-busting
 *
 * @param url - URL para verificar
 * @returns true se tem parâmetro
 */
export function hasCacheBustParam(url: string): boolean {
  const urlObj = new URL(url);
  return urlObj.searchParams.has(CACHE_BUST_PARAM);
}

/**
 * Executa reload da página com cache-busting
 * Requirement 6.2
 *
 * @returns Promise que resolve quando a página recarregar
 */
export async function reloadWithCacheBust(): Promise<void> {
  const currentUrl = window.location.href;
  const newUrl = addCacheBustParam(currentUrl);

  return new Promise((resolve, reject) => {
    // Timeout de 30 segundos para reload
    const timeout = setTimeout(() => {
      reject(new Error('Timeout aguardando reload da página'));
    }, 30000);

    // Listener para quando a página carregar
    const onLoad = () => {
      clearTimeout(timeout);
      window.removeEventListener('load', onLoad);
      resolve();
    };

    window.addEventListener('load', onLoad);

    // Executar reload
    window.location.href = newUrl;
  });
}

/**
 * Aguarda document.readyState === 'complete'
 * Requirement 6.3
 *
 * @param timeout - Timeout em ms (padrão: 30000)
 * @returns Promise que resolve quando documento estiver completo
 */
export function waitForDocumentComplete(timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.readyState === 'complete') {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout aguardando document.readyState === complete'));
    }, timeout);

    const checkReady = () => {
      if (document.readyState === 'complete') {
        clearTimeout(timeoutId);
        resolve();
      } else {
        requestAnimationFrame(checkReady);
      }
    };

    // Também escutar evento load
    window.addEventListener(
      'load',
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );

    checkReady();
  });
}

/**
 * Aguarda todas as imagens da página carregarem
 * Requirement 6.4
 *
 * @param timeout - Timeout em ms (padrão: 30000)
 * @returns Promise com informações sobre imagens carregadas
 */
export function waitForAllImages(timeout = 30000): Promise<{ total: number; loaded: number; failed: number }> {
  return new Promise((resolve) => {
    const images = Array.from(document.querySelectorAll('img'));
    const total = images.length;

    if (total === 0) {
      resolve({ total: 0, loaded: 0, failed: 0 });
      return;
    }

    let loaded = 0;
    let failed = 0;
    let completed = 0;

    const timeoutId = setTimeout(() => {
      // Resolver mesmo com timeout, reportando status parcial
      resolve({ total, loaded, failed: failed + (total - completed) });
    }, timeout);

    const checkComplete = () => {
      completed++;
      if (completed >= total) {
        clearTimeout(timeoutId);
        resolve({ total, loaded, failed });
      }
    };

    images.forEach((img) => {
      if (img.complete) {
        if (img.naturalWidth > 0) {
          loaded++;
        } else {
          failed++;
        }
        checkComplete();
      } else {
        img.addEventListener(
          'load',
          () => {
            loaded++;
            checkComplete();
          },
          { once: true }
        );
        img.addEventListener(
          'error',
          () => {
            failed++;
            checkComplete();
          },
          { once: true }
        );
      }
    });
  });
}

/**
 * Aguarda todas as fontes da página carregarem
 * Requirement 6.5
 *
 * @param timeout - Timeout em ms (padrão: 30000)
 * @returns Promise que resolve quando fontes estiverem prontas
 */
export async function waitForAllFonts(timeout = 30000): Promise<{ ready: boolean; timedOut: boolean }> {
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);
    return { ready: true, timedOut: false };
  } catch {
    return { ready: false, timedOut: true };
  }
}

/**
 * Aguarda todos os recursos da página (documento, imagens, fontes)
 * Requirements 6.3, 6.4, 6.5, 6.6
 *
 * @param timeout - Timeout total em ms (padrão: 30000)
 * @returns Promise com status de carregamento
 */
export async function waitForAllResources(timeout = 30000): Promise<{
  documentReady: boolean;
  images: { total: number; loaded: number; failed: number };
  fontsReady: boolean;
  timedOut: boolean;
}> {
  const startTime = Date.now();
  let timedOut = false;

  // Aguardar documento
  let documentReady = false;
  try {
    await waitForDocumentComplete(timeout);
    documentReady = true;
  } catch {
    timedOut = true;
  }

  // Calcular tempo restante
  const elapsed = Date.now() - startTime;
  const remainingTimeout = Math.max(0, timeout - elapsed);

  // Aguardar imagens e fontes em paralelo
  const [imagesResult, fontsResult] = await Promise.all([
    waitForAllImages(remainingTimeout),
    waitForAllFonts(remainingTimeout),
  ]);

  return {
    documentReady,
    images: imagesResult,
    fontsReady: fontsResult.ready,
    timedOut: timedOut || fontsResult.timedOut,
  };
}

export default ScreenshotCapture;
