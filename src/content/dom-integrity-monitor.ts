/**
 * DOMIntegrityMonitor - Monitor de Integridade do DOM
 *
 * Detecta manipulações no DOM durante a captura de evidências usando MutationObserver.
 * Implementa observação recursiva de Shadow DOMs e bloqueio de elementos perigosos.
 *
 * Funcionalidades:
 * - Captura snapshot baseline do DOM antes de iniciar
 * - Observa mutações em todo o documento via MutationObserver
 * - Observa Shadow DOMs recursivamente
 * - Bloqueia criação de elementos perigosos (iframe, frame, object, embed, script)
 * - Calcula hash do DOM para verificação de integridade
 *
 * @module DOMIntegrityMonitor
 * @see Requirements 5.9, 5.10, 5.13, 5.16
 */

import { CryptoUtils } from '../lib/crypto-utils-native';
import { AuditLogger } from '../lib/audit-logger';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Informações sobre mutação detectada no DOM
 */
export interface MutationInfo {
  /** Tipo de mutação: childList, attributes, characterData */
  type: string;
  /** Caminho do elemento alvo no DOM */
  target: string;
  /** Timestamp da detecção */
  timestamp: number;
  /** Número sequencial da mutação */
  mutationNumber: number;
  /** Número de nós adicionados (para childList) */
  addedNodes?: number | undefined;
  /** Número de nós removidos (para childList) */
  removedNodes?: number | undefined;
  /** Nome do atributo modificado (para attributes) */
  attributeName?: string | undefined;
  /** Valor anterior (para attributes e characterData) */
  oldValue?: string | undefined;
  /** Novo valor (para attributes e characterData) */
  newValue?: string | undefined;
  /** Se a mutação foi em Shadow DOM */
  isShadowDOM?: boolean | undefined;
  /** Se a mutação foi bloqueada (elemento perigoso) */
  blocked?: boolean | undefined;
  /** Index signature para compatibilidade com Record<string, unknown> */
  [key: string]: string | number | boolean | undefined;
}

/**
 * Snapshot baseline do DOM
 */
export interface DOMBaseline {
  /** Hash SHA-256 do conteúdo do DOM */
  hash: string;
  /** Contagem total de elementos */
  elementCount: number;
  /** Comprimento do textContent do body */
  textContentLength: number;
  /** Timestamp da captura */
  timestamp: number;
}

/**
 * Resultado da verificação de integridade
 */
export interface IntegrityCheckResult {
  /** Se o hash atual corresponde ao baseline */
  hashMatch: boolean;
  /** Se a contagem de elementos corresponde */
  elementCountMatch: boolean;
  /** Número de mutações detectadas */
  mutationsDetected: number;
  /** Hash atual do DOM */
  currentHash: string;
  /** Hash do baseline */
  baselineHash: string | null;
  /** Contagem atual de elementos */
  currentElementCount: number;
  /** Contagem de elementos no baseline */
  baselineElementCount: number | null;
}

/**
 * Callback para notificação de mutações
 */
export type MutationCallback = (mutation: MutationInfo) => void;

/**
 * Callback para notificação de elementos perigosos bloqueados
 */
export type DangerousElementCallback = (tagName: string, mutation: MutationInfo) => void;

// ============================================================================
// Constantes
// ============================================================================

/**
 * Tags de elementos considerados perigosos durante captura
 * @see Requirement 5.9
 */
const DANGEROUS_TAGS = ['iframe', 'frame', 'object', 'embed', 'script'] as const;

/**
 * Configuração do MutationObserver
 */
const MUTATION_OBSERVER_CONFIG: MutationObserverInit = {
  childList: true,
  attributes: true,
  characterData: true,
  subtree: true,
  attributeOldValue: true,
  characterDataOldValue: true,
};

// ============================================================================
// DOMIntegrityMonitor
// ============================================================================

/**
 * DOMIntegrityMonitor - Detecta manipulações no DOM durante lockdown
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const monitor = new DOMIntegrityMonitor(logger);
 *
 * // Capturar baseline
 * const baseline = await monitor.captureBaseline();
 *
 * // Iniciar monitoramento
 * await monitor.start((mutation) => {
 *   console.log('Mutação detectada:', mutation);
 * });
 *
 * // Verificar integridade
 * const result = await monitor.verifyIntegrity();
 *
 * // Parar monitoramento
 * const stats = monitor.stop();
 * ```
 */
export class DOMIntegrityMonitor {
  private logger: AuditLogger;
  private observer: MutationObserver | null = null;
  private shadowObservers: Map<Element, MutationObserver> = new Map();
  private mutationCount = 0;
  private isActive = false;
  private baselineSnapshot: DOMBaseline | null = null;
  private mutations: MutationInfo[] = [];
  private onMutationCallback: MutationCallback | null = null;
  private onDangerousElementCallback: DangerousElementCallback | null = null;

  /**
   * Cria nova instância do DOMIntegrityMonitor
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   */
  constructor(logger: AuditLogger) {
    this.logger = logger;
  }

  /**
   * Verifica se o monitor está ativo
   */
  isMonitorActive(): boolean {
    return this.isActive;
  }

  /**
   * Obtém o baseline capturado
   */
  getBaseline(): DOMBaseline | null {
    return this.baselineSnapshot ? { ...this.baselineSnapshot } : null;
  }

  /**
   * Obtém lista de mutações detectadas
   */
  getMutations(): MutationInfo[] {
    return [...this.mutations];
  }

  /**
   * Obtém contagem de mutações
   */
  getMutationCount(): number {
    return this.mutationCount;
  }

  /**
   * Define callback para elementos perigosos bloqueados
   */
  onDangerousElement(callback: DangerousElementCallback): void {
    this.onDangerousElementCallback = callback;
  }

  // ==========================================================================
  // Captura de Baseline (Requirement 5.16)
  // ==========================================================================

  /**
   * Captura snapshot baseline do DOM
   *
   * Captura hash, elementCount e textContentLength antes de iniciar monitoramento.
   *
   * @returns Snapshot baseline do DOM
   * @see Requirement 5.16
   */
  async captureBaseline(): Promise<DOMBaseline> {
    this.logger.info('LOCKDOWN', 'DOM_BASELINE_CAPTURE_START', {});

    const hash = await this.calculateDOMHash();
    const elementCount = document.querySelectorAll('*').length;
    const textContentLength = document.body?.textContent?.length ?? 0;

    this.baselineSnapshot = {
      hash,
      elementCount,
      textContentLength,
      timestamp: Date.now(),
    };

    this.logger.info('LOCKDOWN', 'DOM_BASELINE_CAPTURED', {
      elementCount,
      textContentLength,
      hashPrefix: hash.substring(0, 16),
    });

    return { ...this.baselineSnapshot };
  }

  /**
   * Calcula hash SHA-256 do conteúdo do DOM
   *
   * @returns Hash em hexadecimal lowercase
   */
  async calculateDOMHash(): Promise<string> {
    const content = document.documentElement.outerHTML;
    return CryptoUtils.hash(content);
  }

  // ==========================================================================
  // Monitoramento com MutationObserver (Requirement 5.10)
  // ==========================================================================

  /**
   * Inicia monitoramento do DOM com MutationObserver
   *
   * @param onMutationDetected - Callback chamado quando mutação é detectada
   * @see Requirement 5.10
   */
  async start(onMutationDetected?: MutationCallback): Promise<void> {
    if (this.isActive) {
      this.logger.warn('LOCKDOWN', 'DOM_MONITOR_ALREADY_ACTIVE', {});
      return;
    }

    this.onMutationCallback = onMutationDetected ?? null;

    // Capturar baseline se ainda não foi capturado
    if (!this.baselineSnapshot) {
      await this.captureBaseline();
    }

    // Criar e iniciar observer principal
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        this.processSingleMutation(mutation, false);
      }
    });

    this.observer.observe(document.documentElement, MUTATION_OBSERVER_CONFIG);

    // Observar Shadow DOMs existentes
    this.observeExistingShadowRoots();

    this.isActive = true;

    this.logger.info('LOCKDOWN', 'DOM_MONITOR_STARTED', {
      baseline: {
        elementCount: this.baselineSnapshot?.elementCount,
        textContentLength: this.baselineSnapshot?.textContentLength,
      },
    });
  }

  /**
   * Processa uma única mutação
   */
  private processSingleMutation(mutation: MutationRecord, isShadowDOM: boolean): void {
    this.mutationCount++;

    const mutationInfo: MutationInfo = {
      type: mutation.type,
      target: this.getElementPath(mutation.target),
      timestamp: Date.now(),
      mutationNumber: this.mutationCount,
      isShadowDOM,
    };

    // Processar por tipo de mutação
    if (mutation.type === 'childList') {
      mutationInfo.addedNodes = mutation.addedNodes.length;
      mutationInfo.removedNodes = mutation.removedNodes.length;

      // Verificar elementos perigosos adicionados
      this.checkDangerousElements(mutation.addedNodes, mutationInfo);

      // Observar novos Shadow DOMs
      this.observeNewShadowRoots(mutation.addedNodes);
    } else if (mutation.type === 'attributes') {
      mutationInfo.attributeName = mutation.attributeName ?? undefined;
      mutationInfo.oldValue = mutation.oldValue ?? undefined;
      const attrValue = mutation.attributeName
        ? (mutation.target as Element).getAttribute(mutation.attributeName)
        : null;
      mutationInfo.newValue = attrValue ?? undefined;
    } else if (mutation.type === 'characterData') {
      mutationInfo.oldValue = mutation.oldValue?.substring(0, 100) ?? undefined;
      mutationInfo.newValue = mutation.target.textContent?.substring(0, 100) ?? undefined;
    }

    // Armazenar mutação
    this.mutations.push(mutationInfo);

    // Notificar callback
    if (this.onMutationCallback) {
      this.onMutationCallback(mutationInfo);
    }

    // Registrar no logger
    this.logger.warn('LOCKDOWN', 'DOM_MUTATION_DETECTED', mutationInfo);
  }

  // ==========================================================================
  // Bloqueio de Elementos Perigosos (Requirement 5.9)
  // ==========================================================================

  /**
   * Verifica e bloqueia elementos perigosos
   *
   * @param nodes - Lista de nós adicionados
   * @param mutationInfo - Informações da mutação
   * @see Requirement 5.9
   */
  private checkDangerousElements(nodes: NodeList, mutationInfo: MutationInfo): void {
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        if (DANGEROUS_TAGS.includes(tagName as (typeof DANGEROUS_TAGS)[number])) {
          // Marcar como bloqueado
          mutationInfo.blocked = true;

          // Remover elemento perigoso
          try {
            element.remove();
            this.logger.critical('LOCKDOWN', 'DANGEROUS_ELEMENT_BLOCKED', {
              tagName,
              path: this.getElementPath(element),
            });
          } catch (error) {
            this.logger.error('LOCKDOWN', 'DANGEROUS_ELEMENT_REMOVAL_FAILED', {
              tagName,
              error: error instanceof Error ? error.message : 'Unknown',
            });
          }

          // Notificar callback
          if (this.onDangerousElementCallback) {
            this.onDangerousElementCallback(tagName, mutationInfo);
          }
        }

        // Verificar filhos recursivamente
        if (element.children.length > 0) {
          this.checkDangerousElementsRecursive(element);
        }
      }
    });
  }

  /**
   * Verifica elementos perigosos recursivamente
   */
  private checkDangerousElementsRecursive(parent: Element): void {
    const children = parent.querySelectorAll(DANGEROUS_TAGS.join(','));
    children.forEach((element) => {
      const tagName = element.tagName.toLowerCase();
      try {
        element.remove();
        this.logger.critical('LOCKDOWN', 'DANGEROUS_ELEMENT_BLOCKED_RECURSIVE', {
          tagName,
          path: this.getElementPath(element),
        });
      } catch (error) {
        this.logger.error('LOCKDOWN', 'DANGEROUS_ELEMENT_REMOVAL_FAILED', {
          tagName,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    });
  }

  // ==========================================================================
  // Observação de Shadow DOM (Requirement 5.13)
  // ==========================================================================

  /**
   * Observa Shadow DOMs existentes no documento
   *
   * @see Requirement 5.13
   */
  private observeExistingShadowRoots(): void {
    this.observeShadowRootsInElement(document.documentElement);
  }

  /**
   * Observa Shadow DOMs em um elemento e seus descendentes
   */
  private observeShadowRootsInElement(root: Element | DocumentFragment): void {
    const elements = root.querySelectorAll('*');

    elements.forEach((element) => {
      if (element.shadowRoot && !this.shadowObservers.has(element)) {
        this.observeShadowRoot(element, element.shadowRoot);
      }
    });
  }

  /**
   * Observa novos Shadow DOMs em nós adicionados
   */
  private observeNewShadowRoots(nodes: NodeList): void {
    nodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        // Verificar se o elemento tem Shadow DOM
        if (element.shadowRoot && !this.shadowObservers.has(element)) {
          this.observeShadowRoot(element, element.shadowRoot);
        }

        // Verificar descendentes
        this.observeShadowRootsInElement(element);
      }
    });
  }

  /**
   * Cria observer para um Shadow DOM específico
   */
  private observeShadowRoot(hostElement: Element, shadowRoot: ShadowRoot): void {
    const shadowObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        this.processSingleMutation(mutation, true);
      }
    });

    shadowObserver.observe(shadowRoot, MUTATION_OBSERVER_CONFIG);
    this.shadowObservers.set(hostElement, shadowObserver);

    // Observar Shadow DOMs aninhados
    this.observeShadowRootsInElement(shadowRoot);

    this.logger.info('LOCKDOWN', 'SHADOW_DOM_OBSERVED', {
      hostElement: this.getElementPath(hostElement),
    });
  }

  // ==========================================================================
  // Verificação de Integridade
  // ==========================================================================

  /**
   * Verifica integridade do DOM comparando com baseline
   *
   * @returns Resultado da verificação de integridade
   */
  async verifyIntegrity(): Promise<IntegrityCheckResult> {
    const currentHash = await this.calculateDOMHash();
    const currentElementCount = document.querySelectorAll('*').length;

    return {
      hashMatch: currentHash === this.baselineSnapshot?.hash,
      elementCountMatch: currentElementCount === this.baselineSnapshot?.elementCount,
      mutationsDetected: this.mutationCount,
      currentHash,
      baselineHash: this.baselineSnapshot?.hash ?? null,
      currentElementCount,
      baselineElementCount: this.baselineSnapshot?.elementCount ?? null,
    };
  }

  // ==========================================================================
  // Métodos Auxiliares
  // ==========================================================================

  /**
   * Obtém caminho do elemento no DOM
   *
   * @param node - Nó para obter caminho
   * @returns String representando o caminho do elemento
   */
  private getElementPath(node: Node): string {
    if (!node || node === document) {
      return 'document';
    }

    const path: string[] = [];
    let current: Node | null = node;

    while (current && current !== document.documentElement) {
      let selector = (current as Element).tagName?.toLowerCase() || '#text';

      if ((current as Element).id) {
        selector += `#${(current as Element).id}`;
      } else if (
        (current as Element).className &&
        typeof (current as Element).className === 'string'
      ) {
        const classes = (current as Element).className.trim().split(/\s+/).slice(0, 2).join('.');
        if (classes) {
          selector += `.${classes}`;
        }
      }

      path.unshift(selector);
      current = current.parentNode;
    }

    return path.join(' > ') || 'unknown';
  }

  /**
   * Para monitoramento e retorna estatísticas
   *
   * @returns Estatísticas do monitoramento
   */
  stop(): { totalMutations: number; baseline: DOMBaseline | null; mutations: MutationInfo[] } {
    // Desconectar observer principal
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Desconectar observers de Shadow DOM
    this.shadowObservers.forEach((observer) => observer.disconnect());
    this.shadowObservers.clear();

    this.isActive = false;

    this.logger.info('LOCKDOWN', 'DOM_MONITOR_STOPPED', {
      totalMutations: this.mutationCount,
    });

    return {
      totalMutations: this.mutationCount,
      baseline: this.baselineSnapshot ? { ...this.baselineSnapshot } : null,
      mutations: [...this.mutations],
    };
  }

  /**
   * Reseta o estado do monitor
   */
  reset(): void {
    this.stop();
    this.mutationCount = 0;
    this.mutations = [];
    this.baselineSnapshot = null;
    this.onMutationCallback = null;
    this.onDangerousElementCallback = null;

    this.logger.info('LOCKDOWN', 'DOM_MONITOR_RESET', {});
  }
}

export default DOMIntegrityMonitor;
