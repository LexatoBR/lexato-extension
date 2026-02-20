/**
 * Interceptador de Navegação
 *
 * Intercepta e controla navegações durante a gravação de vídeo:
 * - Permite links normais (sem target) navegarem na mesma aba
 * - Converte target="_blank" para navegação na mesma aba
 * - Bloqueia window.open() e exibe notificação
 * - Permite navegação back/forward do histórico
 *
 * Os eventos de navegação são enviados para o Service Worker
 * para atualização do índice de navegação no Side Panel.
 *
 * @module navigation-interceptor
 * @requirements 4.1, 4.2, 4.3, 4.4, 4.6

 */

// ============================================================================
// Tipos
// ============================================================================

/**
 * Tipos de navegação detectados
 */
export type NavigationType =
  | 'link-click'
  | 'form-submit'
  | 'history-back'
  | 'history-forward'
  | 'redirect';

/**
 * Evento de navegação capturado
 */
export interface NavigationEvent {
  /** URL de origem */
  fromUrl: string;
  /** URL de destino */
  toUrl: string;
  /** Tipo de navegação */
  type: NavigationType;
  /** Timestamp do evento */
  timestamp: number;
  /** Conteúdo HTML da página antes da navegação */
  htmlContent: string;
}

/**
 * Configuração do interceptador de navegação
 */
export interface NavigationInterceptorConfig {
  /** Permitir links normais (sem target) */
  allowNormalNavigation: boolean;
  /** Converter target="_blank" para mesma aba */
  interceptBlankTarget: boolean;
  /** Bloquear window.open() */
  blockWindowOpen: boolean;
  /** Permitir back/forward do histórico */
  allowHistoryNavigation: boolean;
  /** Callback quando navegação ocorre */
  onNavigate?: (event: NavigationEvent) => void;
  /** Callback quando window.open é bloqueado */
  onWindowOpenBlocked?: (url: string) => void;
}

/**
 * Opções para criar o NavigationInterceptor
 */
export interface NavigationInterceptorOptions {
  /** Configuração customizada */
  config?: Partial<NavigationInterceptorConfig>;
  /** Se deve enviar eventos para o Service Worker (padrão: true) */
  sendToServiceWorker?: boolean;
}

// ============================================================================
// Constantes
// ============================================================================

/** Tipo de mensagem para evento de navegação */
const MESSAGE_TYPE_NAVIGATION_EVENT = 'NAVIGATION_EVENT';

/** Tipo de mensagem para window.open bloqueado */
const MESSAGE_TYPE_WINDOW_OPEN_BLOCKED = 'WINDOW_OPEN_BLOCKED';

/** Configuração padrão */
const DEFAULT_CONFIG: NavigationInterceptorConfig = {
  allowNormalNavigation: true,
  interceptBlankTarget: true,
  blockWindowOpen: true,
  allowHistoryNavigation: true,
};

// ============================================================================
// Classe NavigationInterceptor
// ============================================================================

/**
 * Intercepta e controla navegações durante gravação de vídeo
 *
 * @example
 * ```typescript
 * const interceptor = new NavigationInterceptor({
 *   config: {
 *     onNavigate: (event) => console.log('Navegação:', event),
 *     onWindowOpenBlocked: (url) => console.log('Bloqueado:', url),
 *   },
 *   sendToServiceWorker: true
 * });
 *
 * interceptor.activate();
 * // ... usuário navega na página ...
 * interceptor.deactivate();
 * ```
 */
export class NavigationInterceptor {
  /** Configuração atual */
  private config: NavigationInterceptorConfig;

  /** Se o interceptador está ativo */
  private active: boolean;

  /** Se deve enviar para Service Worker */
  private sendToServiceWorker: boolean;

  /** Referência original do window.open */
  private originalWindowOpen: typeof window.open | null;

  /** Último índice do histórico conhecido */
  private lastHistoryLength: number;

  /** Referências dos handlers para remoção posterior */
  private handlers: {
    click: (e: MouseEvent) => void;
    submit: (e: SubmitEvent) => void;
    popstate: (e: PopStateEvent) => void;
    beforeunload: (e: BeforeUnloadEvent) => void;
  } | null;

  /**
   * Cria uma nova instância do NavigationInterceptor
   *
   * @param options - Opções de configuração
   */
  constructor(options: NavigationInterceptorOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.active = false;
    this.sendToServiceWorker = options.sendToServiceWorker ?? true;
    this.originalWindowOpen = null;
    this.lastHistoryLength = 0;
    this.handlers = null;
  }

  /**
   * Ativa a interceptação de navegação
   *
   * Adiciona listeners para cliques em links, submissão de formulários,
   * navegação do histórico e sobrescreve window.open.
   */
  activate(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.lastHistoryLength = window.history.length;

    // Cria handlers com bind para manter contexto
    this.handlers = {
      click: this.handleClick.bind(this),
      submit: this.handleSubmit.bind(this),
      popstate: this.handlePopState.bind(this),
      beforeunload: this.handleBeforeUnload.bind(this),
    };

    // Adiciona listeners
    document.addEventListener('click', this.handlers.click, { capture: true });
    document.addEventListener('submit', this.handlers.submit, { capture: true });
    window.addEventListener('popstate', this.handlers.popstate);
    window.addEventListener('beforeunload', this.handlers.beforeunload);

    // Sobrescreve window.open se configurado para bloquear
    if (this.config.blockWindowOpen) {
      this.overrideWindowOpen();
    }
  }

  /**
   * Desativa a interceptação de navegação
   *
   * Remove todos os listeners e restaura window.open original.
   */
  deactivate(): void {
    if (!this.active || !this.handlers) {
      return;
    }

    this.active = false;

    // Remove listeners
    document.removeEventListener('click', this.handlers.click, { capture: true });
    document.removeEventListener('submit', this.handlers.submit, { capture: true });
    window.removeEventListener('popstate', this.handlers.popstate);
    window.removeEventListener('beforeunload', this.handlers.beforeunload);

    // Restaura window.open original
    this.restoreWindowOpen();

    this.handlers = null;
  }

  /**
   * Verifica se o interceptador está ativo
   *
   * @returns true se estiver ativo
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Obtém a configuração atual
   *
   * @returns Cópia da configuração atual
   */
  getConfig(): NavigationInterceptorConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Handlers de Eventos
  // ============================================================================

  /**
   * Handler para cliques em links
   * Requisitos 4.1, 4.2
   */
  private handleClick(event: MouseEvent): void {
    if (!this.active) {
      return;
    }

    // Encontra o elemento <a> mais próximo
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute('href');
    const targetAttr = anchor.getAttribute('target');

    // Ignora links sem href ou com javascript:
    if (!href || href.startsWith('javascript:') || href === '#') {
      return;
    }

    // Resolve URL relativa para absoluta
    const toUrl = this.resolveUrl(href);

    // Verifica se é target="_blank" (Requisito 4.2)
    if (this.config.interceptBlankTarget && targetAttr === '_blank') {
      // Previne comportamento padrão (abrir nova aba)
      event.preventDefault();
      event.stopPropagation();

      // Captura HTML antes de navegar (Requisito 4.6)
      const htmlContent = this.captureHtml();

      // Emite evento de navegação
      this.emitNavigationEvent({
        fromUrl: window.location.href,
        toUrl,
        type: 'link-click',
        timestamp: Date.now(),
        htmlContent,
      });

      // Navega na mesma aba
      window.location.href = toUrl;
      return;
    }

    // Links normais (sem target) - permite navegação (Requisito 4.1)
    if (this.config.allowNormalNavigation && (!targetAttr || targetAttr === '_self')) {
      // Captura HTML antes de navegar (Requisito 4.6)
      const htmlContent = this.captureHtml();

      // Emite evento de navegação
      this.emitNavigationEvent({
        fromUrl: window.location.href,
        toUrl,
        type: 'link-click',
        timestamp: Date.now(),
        htmlContent,
      });

      // Permite navegação normal (não previne o evento)
      return;
    }

    // Outros targets (_parent, _top, etc.) - trata como _blank
    if (targetAttr && targetAttr !== '_self') {
      event.preventDefault();
      event.stopPropagation();

      const htmlContent = this.captureHtml();

      this.emitNavigationEvent({
        fromUrl: window.location.href,
        toUrl,
        type: 'link-click',
        timestamp: Date.now(),
        htmlContent,
      });

      window.location.href = toUrl;
    }
  }

  /**
   * Handler para submissão de formulários
   */
  private handleSubmit(event: SubmitEvent): void {
    if (!this.active) {
      return;
    }

    const form = event.target as HTMLFormElement;
    const action = form.action || window.location.href;
    const targetAttr = form.getAttribute('target');

    // Captura HTML antes de navegar (Requisito 4.6)
    const htmlContent = this.captureHtml();

    // Verifica se é target="_blank"
    if (this.config.interceptBlankTarget && targetAttr === '_blank') {
      event.preventDefault();
      event.stopPropagation();

      this.emitNavigationEvent({
        fromUrl: window.location.href,
        toUrl: action,
        type: 'form-submit',
        timestamp: Date.now(),
        htmlContent,
      });

      // Remove target e submete novamente
      form.removeAttribute('target');
      form.submit();
      return;
    }

    // Formulários normais - emite evento e permite navegação
    this.emitNavigationEvent({
      fromUrl: window.location.href,
      toUrl: action,
      type: 'form-submit',
      timestamp: Date.now(),
      htmlContent,
    });
  }

  /**
   * Handler para navegação do histórico (back/forward)
   * Requisito 4.4
   */
  private handlePopState(_event: PopStateEvent): void {
    if (!this.active || !this.config.allowHistoryNavigation) {
      return;
    }

    // Determina se foi back ou forward baseado no tamanho do histórico
    const currentLength = window.history.length;
    const type: NavigationType =
      currentLength < this.lastHistoryLength ? 'history-back' : 'history-forward';

    this.lastHistoryLength = currentLength;

    // Captura HTML da nova página (após navegação)
    // Nota: popstate dispara após a navegação, então capturamos o HTML atual
    const htmlContent = this.captureHtml();

    this.emitNavigationEvent({
      fromUrl: document.referrer || 'unknown',
      toUrl: window.location.href,
      type,
      timestamp: Date.now(),
      htmlContent,
    });
  }

  /**
   * Handler para beforeunload - captura HTML antes de sair
   * Requisito 4.6
   */
  private handleBeforeUnload(_event: BeforeUnloadEvent): void {
    if (!this.active) {
      return;
    }

    // Captura HTML antes de sair (para casos não cobertos pelos outros handlers)
    // Este é um fallback para navegações não interceptadas
    const htmlContent = this.captureHtml();

    // Tenta enviar evento de navegação (pode não funcionar se a página fechar rápido)
    this.emitNavigationEvent({
      fromUrl: window.location.href,
      toUrl: 'unknown', // Não sabemos para onde está indo
      type: 'redirect',
      timestamp: Date.now(),
      htmlContent,
    });
  }

  // ============================================================================
  // Métodos de window.open
  // ============================================================================

  /**
   * Sobrescreve window.open para bloquear abertura de novas abas
   * Requisito 4.3
   */
  private overrideWindowOpen(): void {
    // Salva referência original
    this.originalWindowOpen = window.open;

    // Cria proxy que bloqueia e notifica
    const self = this;
    window.open = function (
      url?: string | URL,
      target?: string,
      features?: string
    ): Window | null {
      // Resolve URL
      const resolvedUrl = url ? self.resolveUrl(url.toString()) : '';

      // Notifica bloqueio
      self.notifyWindowOpenBlocked(resolvedUrl);

      // Chama callback se configurado
      if (self.config.onWindowOpenBlocked) {
        self.config.onWindowOpenBlocked(resolvedUrl);
      }

      // Retorna null (indica que a janela não foi aberta)
      // Mantém assinatura compatível com window.open original
      void target;
      void features;
      return null;
    };
  }

  /**
   * Restaura window.open original
   */
  private restoreWindowOpen(): void {
    if (this.originalWindowOpen) {
      window.open = this.originalWindowOpen;
      this.originalWindowOpen = null;
    }
  }

  /**
   * Notifica que window.open foi bloqueado
   */
  private notifyWindowOpenBlocked(url: string): void {
    // Envia para Service Worker
    if (this.sendToServiceWorker && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          type: MESSAGE_TYPE_WINDOW_OPEN_BLOCKED,
          payload: {
            url,
            timestamp: Date.now(),
            pageUrl: window.location.href,
          },
        })
        .catch(() => {
          // Ignora erros de comunicação
        });
    }
  }

  // ============================================================================
  // Métodos Auxiliares
  // ============================================================================

  /**
   * Captura o HTML da página atual
   * Requisito 4.6
   */
  private captureHtml(): string {
    try {
      return document.documentElement.outerHTML;
    } catch {
      // Em caso de erro (ex: página com restrições), retorna string vazia
      return '';
    }
  }

  /**
   * Resolve URL relativa para absoluta
   */
  private resolveUrl(url: string): string {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      // Se falhar, retorna a URL original
      return url;
    }
  }

  /**
   * Emite evento de navegação para callback e Service Worker
   */
  private emitNavigationEvent(event: NavigationEvent): void {
    // Callback local
    if (this.config.onNavigate) {
      this.config.onNavigate(event);
    }

    // Envia para Service Worker
    if (this.sendToServiceWorker && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          type: MESSAGE_TYPE_NAVIGATION_EVENT,
          payload: event,
        })
        .catch(() => {
          // Ignora erros de comunicação (Service Worker pode não estar disponível)
        });
    }
  }
}

// ============================================================================
// Instância Singleton (opcional)
// ============================================================================

/** Instância global do NavigationInterceptor */
let globalInterceptor: NavigationInterceptor | null = null;

/**
 * Obtém ou cria a instância global do NavigationInterceptor
 *
 * @param options - Opções de configuração (usadas apenas na criação)
 * @returns Instância do NavigationInterceptor
 */
export function getNavigationInterceptor(
  options?: NavigationInterceptorOptions
): NavigationInterceptor {
  globalInterceptor ??= new NavigationInterceptor(options);
  return globalInterceptor;
}

/**
 * Reseta a instância global (útil para testes)
 */
export function resetGlobalInterceptor(): void {
  if (globalInterceptor) {
    globalInterceptor.deactivate();
    globalInterceptor = null;
  }
}

export default NavigationInterceptor;
