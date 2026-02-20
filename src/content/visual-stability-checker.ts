/**
 * VisualStabilityChecker - Verifica estabilidade visual da página
 *
 * JUSTIFICATIVA FORENSE:
 * - Garante que spinners e placeholders não sejam capturados
 * - Documenta tempo de espera nos metadados
 * - Conformidade ISO/IEC 27037: processo reproduzível e auditável
 *
 * @module VisualStabilityChecker
 */

// ============================================================================
// Tipos e Interfaces
// ============================================================================

/**
 * Resultado da verificação de estabilidade visual
 */
export interface StabilityCheckResult {
  /** Se a página está estável */
  stable: boolean;
  /** Número de mutações detectadas durante a verificação */
  mutationCount: number;
  /** Número de spinners visíveis detectados */
  spinnersDetected: number;
  /** Tempo total de espera em ms */
  waitTimeMs: number;
  /** Seletores dos spinners detectados (para registro forense) */
  spinnerSelectors: string[];
}

/**
 * Opções para verificação de estabilidade
 */
export interface StabilityOptions {
  /** Tempo sem mutações para considerar estável (default: 500ms) */
  mutationSettleMs?: number;
  /** Timeout máximo de espera (default: 5000ms) */
  maxWaitMs?: number;
  /** Verificar spinners visíveis (default: true) */
  checkSpinners?: boolean;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Seletores conhecidos de spinners/loaders
 *
 * CONFORMIDADE FORENSE:
 * - Lista documentada de indicadores de carregamento
 * - Inclui frameworks populares e padrões genéricos
 * - Usado para garantir que conteúdo em carregamento não seja capturado
 */
const SPINNER_SELECTORS = [
  // Classes genéricas
  '.spinner', '.loading', '.loader', '.skeleton',
  '.spin', '.loading-indicator', '.progress-circular',
  '[class*="spinner"]', '[class*="loading"]', '[class*="skeleton"]',
  '[class*="loader"]', '[class*="progress"]',
  // Material UI
  '.MuiCircularProgress-root',
  '.MuiSkeleton-root',
  '.MuiLinearProgress-root',
  '.MuiBackdrop-root', // Backdrop com loading
  // Ant Design
  '.ant-spin', '.ant-skeleton',
  '.ant-spin-spinning', '.ant-spin-dot',
  '.ant-loading', '.ant-table-loading',
  // Element UI / Element Plus
  '.el-loading-spinner',
  '.el-skeleton',
  '.el-loading-mask',
  '.el-loading-parent--relative',
  // Vuetify
  '.v-progress-circular',
  '.v-skeleton-loader',
  '.v-progress-linear',
  // Chakra UI
  '.chakra-spinner',
  '.chakra-skeleton',
  '.chakra-progress',
  // Bootstrap
  '.spinner-border', '.spinner-grow',
  '.placeholder-glow', '.placeholder-wave',
  // Tailwind / DaisyUI
  '.loading-spinner', '.loading-dots', '.loading-ring',
  '.loading-ball', '.loading-bars', '.loading-infinity',
  '.animate-spin', '.animate-pulse', '.animate-bounce',
  // Semantic UI
  '.ui.loader', '.ui.active.loader',
  '.ui.loading', '.ui.dimmer',
  // Foundation
  '.preloader', '.progress',
  // Bulma
  '.is-loading', '.loader-wrapper',
  // Data attributes
  '[data-loading="true"]',
  '[data-skeleton]',
  '[aria-busy="true"]',
  '[data-testid*="loading"]',
  '[data-testid*="spinner"]',
  // Generic placeholders
  '.placeholder', '.shimmer', '.pulse',
  '[class*="placeholder"]', '[class*="shimmer"]',
  // Loaders específicos de frameworks
  '.nuxt-loading', '.nuxt-progress', // Nuxt
  '.nprogress', '#nprogress', // NProgress
  '.pace', '.pace-progress', // Pace.js
  // Indicadores de lazy loading
  '.lazy-load-indicator',
  '.image-loading',
  'img[loading="lazy"]:not([complete])',
  // Overlays de loading
  '.loading-overlay', '.loading-mask',
  '.overlay-loading', '.modal-loading',
] as const;

/**
 * Configuração padrão
 */
const DEFAULT_OPTIONS: Required<StabilityOptions> = {
  mutationSettleMs: 700, // Aumentado de 500 para 700 (alinhado com screenshot-capture.ts)
  maxWaitMs: 5000,
  checkSpinners: true,
};

// ============================================================================
// VisualStabilityChecker
// ============================================================================

/**
 * VisualStabilityChecker - Verifica se a página está visualmente estável
 *
 * Detecta:
 * - Mutações no DOM (SPAs, AJAX)
 * - Spinners/loaders visíveis
 * - Elementos com animações ativas
 *
 * @example
 * ```typescript
 * const checker = new VisualStabilityChecker();
 * const result = await checker.waitForStability({
 *   mutationSettleMs: 500,
 *   maxWaitMs: 5000,
 * });
 *
 * if (result.stable) {
 *   console.log('Página estável, pode capturar');
 * } else {
 *   console.log('Spinners detectados:', result.spinnerSelectors);
 * }
 * ```
 */
export class VisualStabilityChecker {
  /** Contador de mutações durante a verificação */
  private mutationCount = 0;
  /** Observer de mutações */
  private observer: MutationObserver | null = null;

  /**
   * Aguarda estabilidade visual da página
   *
   * ESTRATÉGIA:
   * 1. Inicia MutationObserver para detectar mudanças no DOM
   * 2. Aguarda período sem mutações (mutationSettleMs)
   * 3. Verifica se há spinners/loaders visíveis
   * 4. Repete até estabilizar ou timeout
   *
   * @param options - Opções de verificação
   * @returns Resultado da verificação
   */
  async waitForStability(options?: StabilityOptions): Promise<StabilityCheckResult> {
    const opts: Required<StabilityOptions> = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    this.mutationCount = 0;
    let lastMutationTime = Date.now();
    let spinnersDetected: HTMLElement[] = [];
    let spinnerSelectors: string[] = [];

    // Configurar MutationObserver
    this.observer = new MutationObserver((mutations) => {
      // Filtrar mutações significativas (ignorar changes de style em elementos pequenos)
      const significantMutations = mutations.filter(m => {
        // Considerar adições/remoções de nós
        if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
          return true;
        }
        // Considerar mudanças de atributos em elementos visíveis
        if (m.type === 'attributes' && m.target instanceof HTMLElement) {
          const rect = m.target.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        return false;
      });

      if (significantMutations.length > 0) {
        this.mutationCount += significantMutations.length;
        lastMutationTime = Date.now();
      }
    });

    // Observar todo o documento
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src', 'data-src', 'hidden', 'aria-hidden'],
    });

    // Loop de verificação
    let stable = false;
    while (Date.now() - startTime < opts.maxWaitMs) {
      // Aguardar um período
      await this.sleep(100);

      // Verificar se houve mutações recentes
      const timeSinceLastMutation = Date.now() - lastMutationTime;
      const domSettled = timeSinceLastMutation >= opts.mutationSettleMs;

      // Verificar spinners se configurado
      if (opts.checkSpinners) {
        spinnersDetected = this.detectVisibleSpinners();
        spinnerSelectors = spinnersDetected.map(el => this.generateSelector(el));
      }

      // Considerar estável se DOM estabilizou e não há spinners
      if (domSettled && spinnersDetected.length === 0) {
        stable = true;
        break;
      }

      // Log de progresso (a cada segundo)
      const elapsed = Date.now() - startTime;
      if (elapsed > 0 && elapsed % 1000 < 100) {
        // Progresso silencioso - não logar para não poluir
      }
    }

    // Cleanup
    this.observer.disconnect();
    this.observer = null;

    const waitTimeMs = Date.now() - startTime;

    return {
      stable,
      mutationCount: this.mutationCount,
      spinnersDetected: spinnersDetected.length,
      waitTimeMs,
      spinnerSelectors,
    };
  }

  /**
   * Detecta spinners visíveis na página
   *
   * @returns Array de elementos spinner visíveis
   */
  detectVisibleSpinners(): HTMLElement[] {
    const spinners: HTMLElement[] = [];

    for (const selector of SPINNER_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el instanceof HTMLElement && this.isElementVisible(el)) {
            // Verificar se tem animação ativa
            if (this.isElementAnimating(el) || this.hasSpinnerIndicators(el)) {
              spinners.push(el);
            }
          }
        }
      } catch {
        // Ignorar seletores inválidos
      }
    }

    // Remover duplicatas (elemento pode corresponder a múltiplos seletores)
    const uniqueSpinners = [...new Set(spinners)];

    return uniqueSpinners;
  }

  /**
   * Verifica se elemento está visível
   *
   * @param element - Elemento a verificar
   * @returns true se elemento está visível
   */
  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none') {
      return false;
    }
    if (style.visibility === 'hidden') {
      return false;
    }
    if (style.opacity === '0') {
      return false;
    }

    return true;
  }

  /**
   * Verifica se elemento tem animação ativa
   *
   * @param element - Elemento a verificar
   * @returns true se elemento tem animação
   */
  private isElementAnimating(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);

    // Verificar animation
    const animation = style.animation || style.getPropertyValue('animation');
    if (animation && animation !== 'none' && animation !== '') {
      return true;
    }

    // Verificar animationName
    const animationName = style.animationName || style.getPropertyValue('animation-name');
    if (animationName && animationName !== 'none' && animationName !== '') {
      return true;
    }

    // Verificar se elemento tem @keyframes aplicado via Web Animations API
    try {
      const animations = element.getAnimations();
      if (animations.length > 0) {
        return true;
      }
    } catch {
      // API não suportada em alguns browsers
    }

    return false;
  }

  /**
   * Verifica indicadores de spinner além de animação
   *
   * @param element - Elemento a verificar
   * @returns true se tem indicadores de spinner
   */
  private hasSpinnerIndicators(element: HTMLElement): boolean {
    // Verificar atributos
    if (element.getAttribute('aria-busy') === 'true') {
      return true;
    }
    if (element.getAttribute('data-loading') === 'true') {
      return true;
    }

    // Verificar se é skeleton (geralmente tem dimensões mas sem conteúdo)
    const isSkeleton = element.className.includes('skeleton') ||
                       element.className.includes('shimmer') ||
                       element.className.includes('placeholder');
    if (isSkeleton) {
      return true;
    }

    // Verificar role de progressbar ou status
    const role = element.getAttribute('role');
    if (role === 'progressbar' || role === 'status') {
      // Verificar se está carregando (aria-valuenow indefinido ou parcial)
      const valueNow = element.getAttribute('aria-valuenow');
      const valueMax = element.getAttribute('aria-valuemax');
      if (valueNow !== null && valueMax !== null) {
        const progress = parseFloat(valueNow) / parseFloat(valueMax);
        if (progress < 1) {
          return true;
        }
      } else if (role === 'progressbar' && valueNow === null) {
        // Indeterminate progress bar
        return true;
      }
    }

    return false;
  }

  /**
   * Gera seletor CSS único para um elemento
   *
   * @param el - Elemento
   * @returns Seletor CSS
   */
  private generateSelector(el: HTMLElement): string {
    if (el.id) {
      return `#${el.id}`;
    }
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(' ').filter(c => c.trim()).slice(0, 3);
      if (classes.length > 0) {
        return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    return el.tagName.toLowerCase();
  }

  /**
   * Helper para aguardar um período
   *
   * @param ms - Milissegundos
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Verifica se há requisições de rede ativas (fetch/XHR)
   *
   * CONFORMIDADE FORENSE:
   * - Detecta carregamento assíncrono de conteúdo
   * - Ajuda a identificar quando a página está realmente pronta
   *
   * @returns true se há requisições ativas
   */
  detectActiveNetworkRequests(): boolean {
    // Verificar Performance API para requisições recentes
    try {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const now = performance.now();

      // Verificar requisições iniciadas nos últimos 500ms
      const recentRequests = entries.filter(entry => {
        const age = now - entry.startTime;
        return age < 500 && entry.responseEnd === 0; // Ainda não terminou
      });

      if (recentRequests.length > 0) {
        return true;
      }
    } catch {
      // Performance API não disponível
    }

    // Verificar se document está carregando
    if (document.readyState !== 'complete') {
      return true;
    }

    return false;
  }

  /**
   * Detecta se há vídeos ou iframes carregando
   *
   * CONFORMIDADE FORENSE:
   * - Identifica mídia em carregamento
   * - Evita captura de conteúdo incompleto
   *
   * @returns true se há mídia carregando
   */
  detectLoadingMedia(): boolean {
    // Verificar vídeos
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (video instanceof HTMLVideoElement) {
        if (video.readyState < 2) { // HAVE_CURRENT_DATA
          return true;
        }
        if (video.networkState === 2) { // NETWORK_LOADING
          return true;
        }
      }
    }

    // Verificar iframes
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      if (iframe instanceof HTMLIFrameElement) {
        try {
          if (iframe.contentDocument?.readyState !== 'complete') {
            return true;
          }
        } catch {
          // Cross-origin iframe, assumir carregado
        }
      }
    }

    return false;
  }

  /**
   * Verifica estabilidade completa da página
   *
   * CONFORMIDADE FORENSE:
   * - Verificação abrangente de todos os indicadores de carregamento
   * - Garante captura apenas quando página está realmente estável
   *
   * @param options - Opções de verificação
   * @returns Resultado detalhado da verificação
   */
  async checkCompleteStability(options?: StabilityOptions): Promise<StabilityCheckResult & {
    hasActiveRequests: boolean;
    hasLoadingMedia: boolean;
    incompleteImagesCount: number;
  }> {
    const baseResult = await this.waitForStability(options);

    // Verificações adicionais
    const hasActiveRequests = this.detectActiveNetworkRequests();
    const hasLoadingMedia = this.detectLoadingMedia();

    // Contar imagens incompletas
    const images = document.querySelectorAll('img');
    let incompleteImagesCount = 0;
    for (const img of images) {
      if (img instanceof HTMLImageElement) {
        if (!img.complete || img.naturalHeight === 0) {
          incompleteImagesCount++;
        }
      }
    }

    return {
      ...baseResult,
      hasActiveRequests,
      hasLoadingMedia,
      incompleteImagesCount,
      stable: baseResult.stable && !hasActiveRequests && !hasLoadingMedia && incompleteImagesCount === 0,
    };
  }
}

export default VisualStabilityChecker;
