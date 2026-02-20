/**
 * Rastreador de Interações do Usuário
 *
 * Rastreia interações do usuário durante a gravação de vídeo:
 * - Cliques (click)
 * - Teclas pressionadas (keypress)
 * - Scrolls (scroll)
 * - Interações com formulários (form-interaction)
 *
 * Os eventos são contabilizados localmente e enviados para o Service Worker
 * para atualização do Side Panel em tempo real.
 *
 * @module interaction-tracker
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7

 */

// ============================================================================
// Tipos
// ============================================================================

/**
 * Estatísticas de interação do usuário
 */
export interface InteractionStats {
  /** Número de cliques */
  clickCount: number;
  /** Número de teclas pressionadas */
  keystrokeCount: number;
  /** Número de scrolls */
  scrollCount: number;
  /** Número de formulários interagidos */
  formsInteracted: number;
  /** Número de páginas visitadas */
  pagesVisited: number;
}

/**
 * Tipos de eventos de interação
 */
export type InteractionEventType = 'click' | 'keypress' | 'scroll' | 'form-interaction';

/**
 * Evento de interação
 */
export interface InteractionEvent {
  /** Tipo do evento */
  type: InteractionEventType;
  /** Timestamp do evento */
  timestamp: number;
  /** Dados adicionais (posição do clique, etc.) */
  data?: Record<string, unknown>;
}

/**
 * Callback para eventos de interação
 */
export type InteractionEventCallback = (event: InteractionEvent) => void;

/**
 * Opções de configuração do InteractionTracker
 */
export interface InteractionTrackerOptions {
  /** Callback chamado a cada evento de interação */
  onInteraction?: InteractionEventCallback;
  /** Intervalo de debounce para scroll em ms (padrão: 100) */
  scrollDebounceMs?: number;
  /** Se deve enviar eventos para o Service Worker (padrão: true) */
  sendToServiceWorker?: boolean;
}

// ============================================================================
// Constantes
// ============================================================================

/** Intervalo padrão de debounce para scroll */
const DEFAULT_SCROLL_DEBOUNCE_MS = 100;

/** Tipo de mensagem para atualização de stats */
const MESSAGE_TYPE_STATS_UPDATE = 'INTERACTION_STATS_UPDATE';

/** Tipo de mensagem para evento de interação */
const MESSAGE_TYPE_INTERACTION_EVENT = 'INTERACTION_EVENT';

// ============================================================================
// Classe InteractionTracker
// ============================================================================

/**
 * Rastreia interações do usuário durante gravação de vídeo
 *
 * @example
 * ```typescript
 * const tracker = new InteractionTracker({
 *   onInteraction: (event) => console.log('Interação:', event),
 *   sendToServiceWorker: true
 * });
 *
 * tracker.start();
 * // ... usuário interage com a página ...
 * const stats = tracker.getStats();
 * tracker.stop();
 * ```
 */
export class InteractionTracker {
  /** Estatísticas atuais */
  private stats: InteractionStats;

  /** Se o rastreamento está ativo */
  private isTracking: boolean;

  /** Callback de interação (pode ser undefined) */
  private onInteraction: InteractionEventCallback | undefined;

  /** Intervalo de debounce para scroll */
  private scrollDebounceMs: number;

  /** Se deve enviar para Service Worker */
  private sendToServiceWorker: boolean;

  /** Timeout do debounce de scroll */
  private scrollDebounceTimeout: ReturnType<typeof setTimeout> | null;

  /** Set de formulários já interagidos (para evitar contagem duplicada) */
  private interactedForms: Set<HTMLFormElement>;

  /** Referências dos handlers para remoção posterior */
  private handlers: {
    click: (e: MouseEvent) => void;
    keypress: (e: KeyboardEvent) => void;
    scroll: () => void;
    input: (e: Event) => void;
    submit: (e: SubmitEvent) => void;
  } | null;

  /**
   * Cria uma nova instância do InteractionTracker
   *
   * @param options - Opções de configuração
   */
  constructor(options: InteractionTrackerOptions = {}) {
    this.stats = this.createInitialStats();
    this.isTracking = false;
    this.onInteraction = options.onInteraction;
    this.scrollDebounceMs = options.scrollDebounceMs ?? DEFAULT_SCROLL_DEBOUNCE_MS;
    this.sendToServiceWorker = options.sendToServiceWorker ?? true;
    this.scrollDebounceTimeout = null;
    this.interactedForms = new Set();
    this.handlers = null;
  }

  /**
   * Cria objeto de estatísticas inicial
   */
  private createInitialStats(): InteractionStats {
    return {
      clickCount: 0,
      keystrokeCount: 0,
      scrollCount: 0,
      formsInteracted: 0,
      pagesVisited: 1, // Página inicial conta como 1
    };
  }

  /**
   * Inicia o rastreamento de interações
   *
   * Adiciona listeners para click, keypress, scroll e form interactions.
   * Se já estiver rastreando, não faz nada.
   */
  start(): void {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.stats = this.createInitialStats();
    this.interactedForms.clear();

    // Cria handlers com bind para manter contexto
    this.handlers = {
      click: this.handleClick.bind(this),
      keypress: this.handleKeypress.bind(this),
      scroll: this.handleScroll.bind(this),
      input: this.handleInput.bind(this),
      submit: this.handleSubmit.bind(this),
    };

    // Adiciona listeners
    document.addEventListener('click', this.handlers.click, { capture: true, passive: true });
    document.addEventListener('keypress', this.handlers.keypress, { capture: true, passive: true });
    window.addEventListener('scroll', this.handlers.scroll, { capture: true, passive: true });
    document.addEventListener('input', this.handlers.input, { capture: true, passive: true });
    document.addEventListener('submit', this.handlers.submit, { capture: true });
  }

  /**
   * Para o rastreamento de interações
   *
   * Remove todos os listeners e limpa timeouts.
   */
  stop(): void {
    if (!this.isTracking || !this.handlers) {
      return;
    }

    this.isTracking = false;

    // Remove listeners
    document.removeEventListener('click', this.handlers.click, { capture: true });
    document.removeEventListener('keypress', this.handlers.keypress, { capture: true });
    window.removeEventListener('scroll', this.handlers.scroll, { capture: true });
    document.removeEventListener('input', this.handlers.input, { capture: true });
    document.removeEventListener('submit', this.handlers.submit, { capture: true });

    // Limpa timeout de scroll
    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
      this.scrollDebounceTimeout = null;
    }

    this.handlers = null;
  }

  /**
   * Obtém as estatísticas atuais de interação
   *
   * @returns Cópia das estatísticas atuais
   */
  getStats(): InteractionStats {
    return { ...this.stats };
  }

  /**
   * Incrementa o contador de páginas visitadas
   *
   * Chamado externamente quando uma navegação ocorre.
   */
  incrementPagesVisited(): void {
    this.stats.pagesVisited++;
    this.notifyStatsUpdate();
  }

  /**
   * Verifica se o rastreamento está ativo
   *
   * @returns true se estiver rastreando
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Reseta as estatísticas para valores iniciais
   */
  reset(): void {
    this.stats = this.createInitialStats();
    this.interactedForms.clear();
    this.notifyStatsUpdate();
  }

  // ============================================================================
  // Handlers de Eventos
  // ============================================================================

  /**
   * Handler para eventos de clique
   * Requisito 2.2
   */
  private handleClick(event: MouseEvent): void {
    if (!this.isTracking) {
      return;
    }

    this.stats.clickCount++;

    const interactionEvent: InteractionEvent = {
      type: 'click',
      timestamp: Date.now(),
      data: {
        x: event.clientX,
        y: event.clientY,
        target: this.getTargetDescription(event.target),
      },
    };

    this.emitEvent(interactionEvent);
    this.notifyStatsUpdate();
  }

  /**
   * Handler para eventos de tecla
   * Requisito 2.3
   */
  private handleKeypress(event: KeyboardEvent): void {
    if (!this.isTracking) {
      return;
    }

    this.stats.keystrokeCount++;

    const interactionEvent: InteractionEvent = {
      type: 'keypress',
      timestamp: Date.now(),
      data: {
        // Não registra a tecla específica por privacidade
        target: this.getTargetDescription(event.target),
      },
    };

    this.emitEvent(interactionEvent);
    this.notifyStatsUpdate();
  }

  /**
   * Handler para eventos de scroll (com debounce)
   * Requisito 2.4
   */
  private handleScroll(): void {
    if (!this.isTracking) {
      return;
    }

    // Debounce para evitar contagem excessiva
    if (this.scrollDebounceTimeout) {
      clearTimeout(this.scrollDebounceTimeout);
    }

    this.scrollDebounceTimeout = setTimeout(() => {
      this.stats.scrollCount++;

      const interactionEvent: InteractionEvent = {
        type: 'scroll',
        timestamp: Date.now(),
        data: {
          scrollY: window.scrollY,
          scrollX: window.scrollX,
        },
      };

      this.emitEvent(interactionEvent);
      this.notifyStatsUpdate();
    }, this.scrollDebounceMs);
  }

  /**
   * Handler para eventos de input em formulários
   * Requisito 2.5
   */
  private handleInput(event: Event): void {
    if (!this.isTracking) {
      return;
    }

    const target = event.target as HTMLElement;
    const form = target.closest('form');

    if (form && !this.interactedForms.has(form)) {
      this.interactedForms.add(form);
      this.stats.formsInteracted++;

      const interactionEvent: InteractionEvent = {
        type: 'form-interaction',
        timestamp: Date.now(),
        data: {
          formId: form.id || undefined,
          formName: form.name || undefined,
          inputType: (target as HTMLInputElement).type || 'unknown',
        },
      };

      this.emitEvent(interactionEvent);
      this.notifyStatsUpdate();
    }
  }

  /**
   * Handler para eventos de submit de formulário
   * Requisito 2.5
   */
  private handleSubmit(event: SubmitEvent): void {
    if (!this.isTracking) {
      return;
    }

    const form = event.target as HTMLFormElement;

    // Garante que o formulário seja contado mesmo se não houve input antes
    if (!this.interactedForms.has(form)) {
      this.interactedForms.add(form);
      this.stats.formsInteracted++;
    }

    const interactionEvent: InteractionEvent = {
      type: 'form-interaction',
      timestamp: Date.now(),
      data: {
        formId: form.id || undefined,
        formName: form.name || undefined,
        action: 'submit',
      },
    };

    this.emitEvent(interactionEvent);
    this.notifyStatsUpdate();
  }

  // ============================================================================
  // Métodos Auxiliares
  // ============================================================================

  /**
   * Obtém descrição do elemento alvo para logging
   */
  private getTargetDescription(target: EventTarget | null): string {
    if (!target || !(target instanceof HTMLElement)) {
      return 'unknown';
    }

    const tagName = target.tagName.toLowerCase();
    const id = target.id ? `#${target.id}` : '';
    const className = target.className
      ? `.${target.className.split(' ').filter(Boolean).join('.')}`
      : '';

    return `${tagName}${id}${className}`.substring(0, 100);
  }

  /**
   * Emite evento de interação para callback e Service Worker
   */
  private emitEvent(event: InteractionEvent): void {
    // Callback local
    if (this.onInteraction) {
      this.onInteraction(event);
    }

    // Envia para Service Worker
    if (this.sendToServiceWorker && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          type: MESSAGE_TYPE_INTERACTION_EVENT,
          payload: event,
        })
        .catch(() => {
          // Ignora erros de comunicação (Service Worker pode não estar disponível)
        });
    }
  }

  /**
   * Notifica atualização de estatísticas para o Service Worker
   * Requisito 2.7
   */
  private notifyStatsUpdate(): void {
    if (this.sendToServiceWorker && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          type: MESSAGE_TYPE_STATS_UPDATE,
          payload: this.getStats(),
        })
        .catch(() => {
          // Ignora erros de comunicação
        });
    }
  }
}

// ============================================================================
// Instância Singleton (opcional)
// ============================================================================

/** Instância global do InteractionTracker */
let globalTracker: InteractionTracker | null = null;

/**
 * Obtém ou cria a instância global do InteractionTracker
 *
 * Quando chamado com options e já existe uma instância parada,
 * cria uma nova instância para garantir estado limpo.
 *
 * @param options - Opções de configuração (usadas apenas na criação)
 * @returns Instância do InteractionTracker
 */
export function getInteractionTracker(options?: InteractionTrackerOptions): InteractionTracker {
  // Se já existe uma instância mas está parada e temos options,
  // criar nova instância para garantir estado limpo
  if (globalTracker && !globalTracker.isActive() && options) {
    globalTracker = new InteractionTracker(options);
  }
  
  globalTracker ??= new InteractionTracker(options);
  return globalTracker;
}

/**
 * Reseta a instância global (útil para testes)
 */
export function resetGlobalTracker(): void {
  if (globalTracker) {
    globalTracker.stop();
    globalTracker = null;
  }
}

/**
 * Força criação de nova instância do InteractionTracker
 * Usado quando navegando para nova página durante gravação
 *
 * @param options - Opções de configuração
 * @returns Nova instância do InteractionTracker
 */
export function createFreshTracker(options?: InteractionTrackerOptions): InteractionTracker {
  // Parar instância anterior se existir
  if (globalTracker) {
    globalTracker.stop();
  }
  
  globalTracker = new InteractionTracker(options);
  return globalTracker;
}

export default InteractionTracker;
