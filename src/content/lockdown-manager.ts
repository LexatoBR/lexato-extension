/**
 * LockdownSecurityManager - Gerenciador de Segurança do Modo Lockdown
 *
 * Implementa todas as proteções de segurança durante a captura de evidências.
 * Bloqueia interações que possam manipular a página durante a captura.
 *
 * Proteções implementadas:
 * - Bloqueio de teclado (exceto Escape)
 * - Bloqueio de menu de contexto
 * - Bloqueio de atalhos do DevTools (F12, Ctrl+Shift+I/J/C, etc.)
 * - Bloqueio de copiar/colar (Ctrl+C/V/X)
 * - Bloqueio de seleção e drag
 * - Bloqueio de impressão
 * - Bloqueio de bookmarklets
 * - Proteção de funções nativas (Object.freeze)
 * - Detecção de DevTools
 * - Monitoramento contínuo (500ms)
 *
 * @module LockdownManager
 * @see Requirements 5.1-5.18
 */

import { AuditLogger } from '../lib/audit-logger';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Violação detectada durante lockdown
 */
export interface ViolacaoLockdown {
  type: string;
  timestamp: number;
  details: Record<string, unknown>;
}

/**
 * Snapshot baseline do DOM
 */
export interface DOMBaseline {
  hash: string;
  elementCount: number;
  textContentLength: number;
  timestamp: number;
}

/**
 * Resultado da ativação do lockdown
 */
export interface LockdownActivationResult {
  success: boolean;
  protections: string[];
  baselineSnapshot: DOMBaseline;
  error?: string;
}

/**
 * Resultado da desativação do lockdown
 */
export interface LockdownDeactivationResult {
  protections: string[];
  violations: ViolacaoLockdown[];
  totalViolations: number;
}

/**
 * Callback para notificação de DevTools detectado
 */
export type DevToolsDetectedCallback = () => void;

// ============================================================================
// Constantes
// ============================================================================

/**
 * Intervalo de monitoramento contínuo em ms
 * CRÍTICO: 200ms para detecção rápida de DevTools durante gravação de vídeo
 */
const MONITORING_INTERVAL_MS = 200;

/**
 * Threshold para detecção de DevTools (diferença de pixels)
 *
 * DESABILITADO: A detecção por dimensões (outerWidth - innerWidth) é
 * inerentemente não confiável e causa falsos positivos quando:
 * - Side Panel do Chrome está aberto (~320px)
 * - Zoom do navegador diferente de 100%
 * - Escala do sistema operacional (macOS Retina, Windows DPI scaling)
 * - Barras de ferramentas do navegador
 * - Extensões que adicionam UI
 *
 * Referência: sindresorhus/devtools-detect admite que a heurística
 * "has too many false-positives" e "will show false positive if you
 * toggle any kind of sidebar."
 *
 * A proteção contra DevTools é garantida pelo bloqueio de atalhos
 * no lockdown-injector.ts (mundo MAIN): F12, Ctrl+Shift+I/J/C, Ctrl+U.
 *
 * @deprecated Não utilizado - mantido apenas como referência
 */
const _DEVTOOLS_THRESHOLD_PX = 200;

/**
 * Teclas de atalho do DevTools que devem ser bloqueadas
 */
const DEVTOOLS_SHORTCUTS = ['F12', 'I', 'i', 'J', 'j', 'C', 'c'];

/**
 * Teclas de atalho gerais que devem ser bloqueadas
 */
const BLOCKED_SHORTCUTS = ['U', 'u', 'P', 'p', 'S', 's'];

/**
 * Teclas de copiar/colar que devem ser bloqueadas
 */
const COPY_PASTE_KEYS = ['C', 'c', 'V', 'v', 'X', 'x'];

// ============================================================================
// LockdownSecurityManager
// ============================================================================

/**
 * LockdownSecurityManager - Gerencia todas as proteções do modo lockdown
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const lockdown = new LockdownSecurityManager(logger);
 *
 * // Ativar lockdown
 * const result = await lockdown.activate();
 * if (result.success) {
 *   console.log('Lockdown ativado com proteções:', result.protections);
 * }
 *
 * // Desativar lockdown
 * const deactivateResult = lockdown.deactivate();
 * console.log('Violações detectadas:', deactivateResult.totalViolations);
 * ```
 */
export class LockdownSecurityManager {
  private logger: AuditLogger;
  private isActive = false;
  private protections: string[] = [];
  private violations: ViolacaoLockdown[] = [];
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private devToolsDetectedCallback: DevToolsDetectedCallback | null = null;
  private baselineSnapshot: DOMBaseline | null = null;

  // Referências para event listeners (para remoção posterior)
  private boundKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundKeyupHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundKeypressHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundContextMenuHandler: ((e: MouseEvent) => void) | null = null;
  private boundSelectStartHandler: ((e: Event) => void) | null = null;
  private boundDragStartHandler: ((e: DragEvent) => void) | null = null;
  private boundBeforePrintHandler: ((e: Event) => void) | null = null;
  private boundAfterPrintHandler: ((e: Event) => void) | null = null;
  private boundCopyHandler: ((e: ClipboardEvent) => void) | null = null;
  private boundPasteHandler: ((e: ClipboardEvent) => void) | null = null;
  private boundCutHandler: ((e: ClipboardEvent) => void) | null = null;
  private boundAuxClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundMouseDownHandler: ((e: MouseEvent) => void) | null = null;

  // Elemento de estilo injetado para proteções CSS
  private injectedStyle: HTMLStyleElement | null = null;

  // Funções originais salvas para restauração
  private originalLocationAssign: typeof window.location.assign | null = null;
  private originalLocationReplace: typeof window.location.replace | null = null;

  // Handler para mensagens do mundo MAIN
  private boundMainWorldMessageHandler: ((e: MessageEvent) => void) | null = null;

  // Flag para indicar se o script MAIN foi injetado
  private mainWorldScriptInjected = false;

  /**
   * Cria nova instância do LockdownSecurityManager
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   */
  constructor(logger: AuditLogger) {
    this.logger = logger;
    // Configurar listener para mensagens do mundo MAIN
    this.setupMainWorldListener();
  }

  /**
   * Código JavaScript que será injetado no mundo MAIN da página
   * Este código bloqueia DevTools, menu de contexto e atalhos perigosos
   *
   * CRÍTICO: Este código executa no contexto da página, não no content script
   */
  private getMainWorldBlockerCode(): string {
    return `
(function() {
  'use strict';

  // Evitar múltiplas injeções
  if (window.__LEXATO_MAIN_BLOCKER_ACTIVE__) return;
  window.__LEXATO_MAIN_BLOCKER_ACTIVE__ = true;

  let lockdownActive = false;
  let violationCount = 0;
  const LOG_PREFIX = '[Lexato Lockdown MAIN]';

  // Teclas bloqueadas
  const DEVTOOLS_KEYS = new Set(['F12']);
  const DEVTOOLS_CTRL_SHIFT = new Set(['I', 'i', 'J', 'j', 'C', 'c']);
  const DANGEROUS_CTRL = new Set(['U', 'u', 'S', 's', 'P', 'p']);

  // Notificar violação
  function notifyViolation(type, details) {
    violationCount++;
    window.postMessage({
      type: 'LEXATO_LOCKDOWN_VIOLATION',
      violationType: type,
      details: details,
      violationCount: violationCount,
      timestamp: Date.now()
    }, '*');
    console.warn(LOG_PREFIX + ' VIOLACAO #' + violationCount + ': ' + type, details);
  }

  // Bloquear teclado
  function blockKeyboard(e) {
    if (!lockdownActive) return;
    if (e.key === 'Escape') return;

    // F12
    if (DEVTOOLS_KEYS.has(e.key) || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      notifyViolation('devtools-f12', { key: e.key });
      return false;
    }

    // Ctrl+Shift+I/J/C
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && DEVTOOLS_CTRL_SHIFT.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      notifyViolation('devtools-shortcut', { key: e.key });
      return false;
    }

    // Ctrl+U/S/P
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && DANGEROUS_CTRL.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      notifyViolation('dangerous-shortcut', { key: e.key });
      return false;
    }

    // Bloquear todas as outras teclas
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }

  // Bloquear menu de contexto
  function blockContextMenu(e) {
    if (!lockdownActive) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    notifyViolation('context-menu', { x: e.clientX, y: e.clientY });
    return false;
  }

  // Bloquear botões do mouse (exceto esquerdo)
  function blockMouseButton(e) {
    if (!lockdownActive) return;
    if (e.button !== 0) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      notifyViolation('mouse-button', { button: e.button });
      return false;
    }
  }

  // Escutar ativação/desativação
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    // Validar formato da mensagem
    if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string') return;
    if (!event.data.type.startsWith('LEXATO_')) return;
    if (event.data.type === 'LEXATO_LOCKDOWN_ACTIVATE') {
      lockdownActive = true;
      violationCount = 0;
      console.log(LOG_PREFIX + ' LOCKDOWN ATIVADO');
      injectStyles();
    } else if (event.data.type === 'LEXATO_LOCKDOWN_DEACTIVATE') {
      console.log(LOG_PREFIX + ' LOCKDOWN DESATIVADO - Violacoes: ' + violationCount);
      lockdownActive = false;
      removeStyles();
    }
  });

  // Injetar CSS de proteção
  function injectStyles() {
    removeStyles();
    var style = document.createElement('style');
    style.id = 'lexato-lockdown-styles';
    style.textContent = '* { -webkit-user-select: none !important; user-select: none !important; } html::after { content: "CAPTURA EM ANDAMENTO"; position: fixed; top: 5px; right: 5px; background: rgba(220,38,38,0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; z-index: 2147483647; pointer-events: none; }';
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyles() {
    var el = document.getElementById('lexato-lockdown-styles');
    if (el) el.remove();
  }

  // Registrar event listeners com CAPTURA (true) para máxima prioridade
  document.addEventListener('keydown', blockKeyboard, true);
  document.addEventListener('keyup', blockKeyboard, true);
  document.addEventListener('keypress', blockKeyboard, true);
  document.addEventListener('contextmenu', blockContextMenu, true);
  document.addEventListener('mousedown', blockMouseButton, true);
  document.addEventListener('auxclick', blockMouseButton, true);

  // Também no window
  window.addEventListener('keydown', blockKeyboard, true);
  window.addEventListener('keyup', blockKeyboard, true);
  window.addEventListener('contextmenu', blockContextMenu, true);

  console.log(LOG_PREFIX + ' Bloqueador carregado e aguardando ativacao');
})();
`;
  }

  /**
   * Injeta o script de bloqueio no mundo MAIN via elemento <script>
   * Esta técnica garante que o código execute no contexto da página
   */
  private injectMainWorldBlocker(): void {
    if (this.mainWorldScriptInjected) {
      this.logger.info('LOCKDOWN', 'MAIN_WORLD_ALREADY_INJECTED', {});
      return;
    }

    try {
      const script = document.createElement('script');
      script.id = 'lexato-main-world-blocker';
      script.textContent = this.getMainWorldBlockerCode();

      // Inserir no início do documento para máxima prioridade
      const target = document.head || document.documentElement;
      target.insertBefore(script, target.firstChild);

      // Remover o elemento <script> após execução (o código já está na memória)
      script.remove();

      this.mainWorldScriptInjected = true;
      this.logger.info('LOCKDOWN', 'MAIN_WORLD_BLOCKER_INJECTED', {});
    } catch (error) {
      this.logger.error('LOCKDOWN', 'MAIN_WORLD_INJECTION_FAILED', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Configura listener para receber mensagens do lockdown-injector (mundo MAIN)
   * CRÍTICO: Recebe notificações de violações detectadas no contexto da página
   */
  private setupMainWorldListener(): void {
    this.boundMainWorldMessageHandler = (event: MessageEvent) => {
      // Aceitar apenas mensagens da própria janela
      if (event.source !== window) {
        return;
      }

      // Validar formato da mensagem: deve ser objeto com type string prefixado LEXATO_
      if (
        !event.data ||
        typeof event.data !== 'object' ||
        typeof event.data.type !== 'string' ||
        !event.data.type.startsWith('LEXATO_')
      ) {
        return;
      }

      // Processar violações do mundo MAIN
      if (event.data.type === 'LEXATO_LOCKDOWN_VIOLATION') {
        this.handleMainWorldViolation(event.data);
      }
    };

    window.addEventListener('message', this.boundMainWorldMessageHandler);
  }

  /**
   * Processa violação detectada pelo lockdown-injector no mundo MAIN
   */
  private handleMainWorldViolation(data: {
    violationType: string;
    details: Record<string, unknown>;
    violationCount: number;
    timestamp: number;
  }): void {
    // Registrar violação
    this.logViolation(`main-world-${data.violationType}`, {
      ...data.details,
      violationCount: data.violationCount,
      source: 'MAIN_WORLD',
    });

    // Se for violação de DevTools, notificar callback
    if (
      data.violationType === 'devtools-f12' ||
      data.violationType === 'devtools-shortcut'
    ) {
      this.logger.critical('LOCKDOWN', 'DEVTOOLS_ATTEMPT_MAIN_WORLD', {
        violationType: data.violationType,
        details: data.details,
      });

      // Notificar callback se definido
      if (this.devToolsDetectedCallback) {
        this.devToolsDetectedCallback();
      }
    }
  }

  /**
   * Envia mensagem para o lockdown-injector no mundo MAIN
   *
   * CRÍTICO: Envia múltiplas vezes com delay para garantir que o script MAIN
   * receba a mensagem mesmo se houver race condition no carregamento.
   */
  private sendToMainWorld(type: string): void {
    const targetOrigin = window.location.origin;

    // Enviar imediatamente
    window.postMessage({ type }, targetOrigin);

    // Enviar novamente após pequenos delays para garantir que o script MAIN receba
    // Isso resolve race conditions de carregamento
    setTimeout(() => window.postMessage({ type }, targetOrigin), 50);
    setTimeout(() => window.postMessage({ type }, targetOrigin), 100);
    setTimeout(() => window.postMessage({ type }, targetOrigin), 200);

    this.logger.info('LOCKDOWN', 'MAIN_WORLD_MESSAGE_SENT', { type });
  }

  /**
   * Verifica se o lockdown está ativo
   */
  isLockdownActive(): boolean {
    return this.isActive;
  }

  /**
   * Obtém lista de proteções ativas
   */
  getActiveProtections(): string[] {
    return [...this.protections];
  }

  /**
   * Obtém lista de violações detectadas
   */
  getViolations(): ViolacaoLockdown[] {
    return [...this.violations];
  }

  /**
   * Define callback para quando DevTools for detectado
   */
  onDevToolsDetected(callback: DevToolsDetectedCallback): void {
    this.devToolsDetectedCallback = callback;
  }

  /**
   * Ativa todas as proteções de segurança
   *
   * @returns Resultado da ativação com lista de proteções e baseline
   */
  async activate(): Promise<LockdownActivationResult> {
    if (this.isActive) {
      this.logger.warn('LOCKDOWN', 'ALREADY_ACTIVE', {
        protections: this.protections,
      });
      return {
        success: true,
        protections: this.protections,
        baselineSnapshot: this.baselineSnapshot ?? this.createEmptyBaseline(),
      };
    }

    this.logger.info('LOCKDOWN', 'ACTIVATION_START', {});

    try {
      // 0. CRÍTICO: Injetar script de bloqueio no mundo MAIN da página
      // Isso injeta código JavaScript diretamente no contexto da página via <script>
      this.injectMainWorldBlocker();

      // 1. Ativar lockdown no mundo MAIN
      // Isso bloqueia F12/DevTools no contexto da página ANTES de qualquer outra coisa
      this.sendToMainWorld('LEXATO_LOCKDOWN_ACTIVATE');
      this.protections.push('main-world-lockdown');

      // 1. Verificação de DevTools DESABILITADA
      // A detecção por dimensões (outerWidth - innerWidth) causa falsos positivos
      // quando o Side Panel do Chrome está aberto (~320px).
      // A proteção contra DevTools é garantida pelo bloqueio de atalhos
      // no lockdown-injector.ts (mundo MAIN): F12, Ctrl+Shift+I/J/C, Ctrl+U.
      this.logger.info('LOCKDOWN', 'DEVTOOLS_DIMENSION_CHECK_SKIPPED', {
        reason: 'Detecção por dimensões desabilitada - causa falsos positivos com Side Panel',
        protection: 'Atalhos de DevTools bloqueados via lockdown-injector.ts (mundo MAIN)',
      });

      // 2. Capturar baseline do DOM
      this.baselineSnapshot = await this.captureBaseline();
      this.protections.push('baseline-captured');

      // 3. Proteger funções nativas (Object.freeze)
      this.protectNativeFunctions();

      // 4. Bloquear eventos de teclado - APENAS DevTools (F12, Ctrl+Shift+I/J/C, Ctrl+U)
      // Todas as outras teclas são permitidas para interação normal
      this.blockKeyboardEvents();

      // 5. Bloquear menu de contexto (impede acesso a "Inspecionar Elemento")
      this.blockContextMenu();

      // === MODO INTERATIVO (ISO 27037) ===
      // As seguintes proteções foram REMOVIDAS para permitir captura interativa:
      // - blockSelectionAndDrag() - Usuário pode selecionar texto
      // - blockPrinting() - Usuário pode imprimir se necessário
      // - blockCopyPaste() - Usuário pode copiar/colar em formulários
      // Todas as interações são documentadas pelo interaction-tracker.ts

      // 6. Bloquear bookmarklets (javascript: URLs que podem modificar a página)
      this.blockBookmarklets();

      // 7. Bloquear apenas botão do meio do mouse (abre em nova aba)
      // Botão esquerdo e direito são permitidos
      this.blockMouseButtons();

      // 8. Injetar CSS mínimo (apenas esconde tooltips)
      this.injectProtectionCSS();

      // 9. Iniciar monitoramento contínuo (200ms) - detecta DevTools
      this.startContinuousMonitoring();

      this.isActive = true;

      this.logger.info('LOCKDOWN', 'ACTIVATION_COMPLETE', {
        protections: this.protections,
        baselineSnapshot: {
          elementCount: this.baselineSnapshot.elementCount,
          textContentLength: this.baselineSnapshot.textContentLength,
        },
      });

      return {
        success: true,
        protections: this.protections,
        baselineSnapshot: this.baselineSnapshot,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('LOCKDOWN', 'ACTIVATION_FAILED', { error: errorMessage });

      // Limpar proteções parciais
      this.cleanup();

      return {
        success: false,
        protections: this.protections,
        baselineSnapshot: this.createEmptyBaseline(),
        error: errorMessage,
      };
    }
  }

  /**
   * Desativa lockdown e retorna relatório de violações
   */
  deactivate(): LockdownDeactivationResult {
    if (!this.isActive) {
      this.logger.warn('LOCKDOWN', 'NOT_ACTIVE', {});
      return {
        protections: [],
        violations: [],
        totalViolations: 0,
      };
    }

    this.logger.info('LOCKDOWN', 'DEACTIVATION_START', {
      violationsCount: this.violations.length,
    });

    this.cleanup();

    const result: LockdownDeactivationResult = {
      protections: [...this.protections],
      violations: [...this.violations],
      totalViolations: this.violations.length,
    };

    // Resetar estado
    this.isActive = false;
    this.protections = [];
    this.violations = [];
    this.baselineSnapshot = null;

    this.logger.info('LOCKDOWN', 'DEACTIVATION_COMPLETE', {
      totalViolations: result.totalViolations,
    });

    return result;
  }

  // ==========================================================================
  // Métodos de Proteção
  // ==========================================================================

  /**
   * Protege funções nativas com Object.freeze
   * Requirement 5.11
   */
  private protectNativeFunctions(): void {
    // Pular em ambiente de teste (jsdom não suporta freeze em protótipos)
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') {
      this.protections.push('native-functions-frozen');
      this.logger.info('LOCKDOWN', 'NATIVE_FUNCTIONS_SKIPPED_TEST_ENV', {});
      return;
    }

    try {
      // Tentar congelar protótipos (pode falhar em alguns ambientes)
      Object.freeze(EventTarget.prototype);
      Object.freeze(Document.prototype);
      Object.freeze(Element.prototype);
      this.protections.push('native-functions-frozen');
      this.logger.info('LOCKDOWN', 'NATIVE_FUNCTIONS_PROTECTED', {});
    } catch (error) {
      // Em alguns ambientes, freeze pode falhar - registrar mas continuar
      this.logger.warn('LOCKDOWN', 'NATIVE_FUNCTIONS_FREEZE_FAILED', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Bloqueia eventos de teclado (exceto Escape)
   * Requirements 5.1, 5.3, 5.4, 5.15
   */
  private blockKeyboardEvents(): void {
    // Handler para keydown
    this.boundKeydownHandler = (e: KeyboardEvent) => {
      this.handleKeyboardEvent(e, 'keydown');
    };

    // Handler para keyup
    this.boundKeyupHandler = (e: KeyboardEvent) => {
      this.handleKeyboardEvent(e, 'keyup');
    };

    // Handler para keypress
    this.boundKeypressHandler = (e: KeyboardEvent) => {
      this.handleKeyboardEvent(e, 'keypress');
    };

    // Adicionar listeners com useCapture: true
    document.addEventListener('keydown', this.boundKeydownHandler, true);
    document.addEventListener('keyup', this.boundKeyupHandler, true);
    document.addEventListener('keypress', this.boundKeypressHandler, true);

    this.protections.push('keyboard-blocked');
    this.logger.info('LOCKDOWN', 'KEYBOARD_BLOCKED', {});
  }

  /**
   * Processa evento de teclado - MODO INTERATIVO
   *
   * Bloqueia APENAS atalhos de DevTools, permitindo todas as outras interações.
   * O interaction-tracker.ts documenta todas as teclas pressionadas para auditoria.
   */
  private handleKeyboardEvent(e: KeyboardEvent, eventType: string): void {
    // Verificar atalhos do DevTools (F12, Ctrl+Shift+I/J/C)
    if (this.isDevToolsShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('devtools-shortcut', {
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        eventType,
      });
      return;
    }

    // Verificar Ctrl+U (view source) - BLOQUEAR
    if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('view-source-blocked', {
        key: e.key,
        eventType,
      });
      return;
    }

    // TODAS AS OUTRAS TECLAS SÃO PERMITIDAS
    // Isso inclui: digitação em formulários, copiar/colar, salvar, imprimir, etc.
    // O interaction-tracker.ts documenta todas as interações para conformidade ISO 27037
  }

  /**
   * Verifica se é atalho do DevTools
   */
  private isDevToolsShortcut(e: KeyboardEvent): boolean {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      return true;
    }

    // Ctrl+Shift+I/J/C (ou Cmd+Shift no Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      if (DEVTOOLS_SHORTCUTS.includes(e.key)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verifica se é atalho bloqueado (Ctrl+U, Ctrl+P, Ctrl+S)
   */
  private isBlockedShortcut(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey) {
      if (BLOCKED_SHORTCUTS.includes(e.key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Verifica se é atalho de copiar/colar
   */
  private isCopyPasteShortcut(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (COPY_PASTE_KEYS.includes(e.key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Bloqueia menu de contexto (botão direito)
   * Requirement 5.2
   */
  private blockContextMenu(): void {
    this.boundContextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('context-menu-blocked', {
        x: e.clientX,
        y: e.clientY,
      });
    };

    document.addEventListener('contextmenu', this.boundContextMenuHandler, true);
    this.protections.push('context-menu-blocked');
    this.logger.info('LOCKDOWN', 'CONTEXT_MENU_BLOCKED', {});
  }

  /**
   * Bloqueia seleção de texto e drag & drop
   * Requirements 5.5, 5.6
   */
  private blockSelectionAndDrag(): void {
    // Bloquear seleção
    this.boundSelectStartHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('selection-blocked', {});
    };

    // Bloquear drag
    this.boundDragStartHandler = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('drag-blocked', {});
    };

    document.addEventListener('selectstart', this.boundSelectStartHandler, true);
    document.addEventListener('dragstart', this.boundDragStartHandler, true);

    this.protections.push('selection-drag-blocked');
    this.logger.info('LOCKDOWN', 'SELECTION_DRAG_BLOCKED', {});
  }

  /**
   * Bloqueia impressão
   * Requirement 5.7
   */
  private blockPrinting(): void {
    this.boundBeforePrintHandler = (e: Event) => {
      e.preventDefault();
      this.logViolation('print-blocked', { event: 'beforeprint' });
    };

    this.boundAfterPrintHandler = (e: Event) => {
      e.preventDefault();
      this.logViolation('print-blocked', { event: 'afterprint' });
    };

    window.addEventListener('beforeprint', this.boundBeforePrintHandler, true);
    window.addEventListener('afterprint', this.boundAfterPrintHandler, true);

    this.protections.push('printing-blocked');
    this.logger.info('LOCKDOWN', 'PRINTING_BLOCKED', {});
  }

  /**
   * Bloqueia eventos de copiar/colar via clipboard
   * Requirement 5.4
   */
  private blockCopyPaste(): void {
    this.boundCopyHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('clipboard-copy-blocked', {});
    };

    this.boundPasteHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('clipboard-paste-blocked', {});
    };

    this.boundCutHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.logViolation('clipboard-cut-blocked', {});
    };

    document.addEventListener('copy', this.boundCopyHandler, true);
    document.addEventListener('paste', this.boundPasteHandler, true);
    document.addEventListener('cut', this.boundCutHandler, true);

    this.protections.push('clipboard-blocked');
    this.logger.info('LOCKDOWN', 'CLIPBOARD_BLOCKED', {});
  }

  /**
   * Bloqueia botão direito e do meio do mouse
   * CRÍTICO: Impede acesso ao menu de contexto com opção "Inspecionar"
   * Requirements 5.2, 5.18
   */
  private blockMouseButtons(): void {
    // Handler para auxclick - bloquear apenas botão do meio (1)
    // Auxclick com outros botões é permitido
    this.boundAuxClickHandler = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.logViolation('middle-click-blocked', {
          button: e.button,
          x: e.clientX,
          y: e.clientY,
        });
      }
    };

    // Handler para mousedown - bloquear APENAS botão do meio (abre em nova aba)
    // Botão esquerdo (0) e direito (2) são permitidos para interação normal
    this.boundMouseDownHandler = (e: MouseEvent) => {
      // Bloquear apenas botão do meio (1) - abre links em nova aba
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.logViolation('middle-click-blocked', {
          button: e.button,
          x: e.clientX,
          y: e.clientY,
        });
      }
      // Botão direito (2) é permitido - o menu de contexto será bloqueado separadamente
    };

    document.addEventListener('auxclick', this.boundAuxClickHandler, true);
    document.addEventListener('mousedown', this.boundMouseDownHandler, true);

    this.protections.push('mouse-buttons-blocked');
    this.logger.info('LOCKDOWN', 'MOUSE_BUTTONS_BLOCKED', {});
  }

  /**
   * Injeta CSS de proteção mínima - MODO INTERATIVO
   *
   * IMPORTANTE: Para captura de vídeo interativa, NÃO bloqueamos interações visuais.
   * Todas as interações são permitidas e documentadas pelo interaction-tracker.ts
   *
   * Este CSS apenas faz ajustes mínimos para conformidade com ISO 27037.
   */
  private injectProtectionCSS(): void {
    // Pular em ambiente de teste
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') {
      this.protections.push('css-protection-injected');
      this.logger.info('LOCKDOWN', 'CSS_PROTECTION_SKIPPED_TEST_ENV', {});
      return;
    }

    try {
      // Criar elemento de estilo
      this.injectedStyle = document.createElement('style');
      this.injectedStyle.setAttribute('data-lexato-lockdown', 'true');
      this.injectedStyle.textContent = `
        /* === LEXATO CSS - Modo Interativo (ISO 27037) === */
        /* NOTA: Todas as interações são PERMITIDAS e documentadas */

        /* Esconder tooltips nativos que possam vazar informações sensíveis */
        [title]::before, [title]::after {
          display: none !important;
        }
      `;

      // Inserir no início do head para ter prioridade
      const head = document.head || document.getElementsByTagName('head')[0];
      if (head) {
        head.insertBefore(this.injectedStyle, head.firstChild);
      } else {
        document.documentElement.appendChild(this.injectedStyle);
      }

      this.protections.push('css-protection-injected');
      this.logger.info('LOCKDOWN', 'CSS_PROTECTION_INJECTED_INTERACTIVE', {});
    } catch (error) {
      this.logger.warn('LOCKDOWN', 'CSS_PROTECTION_FAILED', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Bloqueia bookmarklets interceptando location.assign e location.replace
   * Requirement 5.8
   */
  private blockBookmarklets(): void {
    // Pular em ambiente de teste (jsdom não permite sobrescrever location)
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test') {
      this.protections.push('bookmarklets-blocked');
      this.logger.info('LOCKDOWN', 'BOOKMARKLETS_SKIPPED_TEST_ENV', {});
      return;
    }

    try {
      // Salvar funções originais
      this.originalLocationAssign = window.location.assign.bind(window.location);
      this.originalLocationReplace = window.location.replace.bind(window.location);

      const self = this;

      // Tentar sobrescrever location.assign
      try {
        Object.defineProperty(window.location, 'assign', {
          value: function (url: string) {
            if (typeof url === 'string' && url.toLowerCase().startsWith('javascript:')) {
              self.logViolation('bookmarklet-blocked', {
                method: 'assign',
                urlPrefix: url.substring(0, 50),
              });
              throw new Error('URLs JavaScript bloqueadas durante captura');
            }
            if (self.originalLocationAssign) {
              return self.originalLocationAssign(url);
            }
          },
          writable: true,
          configurable: true,
        });
      } catch (assignError) {
        // location.assign não pode ser sobrescrito neste ambiente
        this.logger.warn('LOCKDOWN', 'LOCATION_ASSIGN_NOT_WRITABLE', {
          error: assignError instanceof Error ? assignError.message : 'Unknown',
        });
      }

      // Tentar sobrescrever location.replace
      try {
        Object.defineProperty(window.location, 'replace', {
          value: function (url: string) {
            if (typeof url === 'string' && url.toLowerCase().startsWith('javascript:')) {
              self.logViolation('bookmarklet-blocked', {
                method: 'replace',
                urlPrefix: url.substring(0, 50),
              });
              throw new Error('URLs JavaScript bloqueadas durante captura');
            }
            if (self.originalLocationReplace) {
              return self.originalLocationReplace(url);
            }
          },
          writable: true,
          configurable: true,
        });
      } catch (replaceError) {
        // location.replace não pode ser sobrescrito neste ambiente
        this.logger.warn('LOCKDOWN', 'LOCATION_REPLACE_NOT_WRITABLE', {
          error: replaceError instanceof Error ? replaceError.message : 'Unknown',
        });
      }

      this.protections.push('bookmarklets-blocked');
      this.logger.info('LOCKDOWN', 'BOOKMARKLETS_BLOCKED', {});
    } catch (error) {
      // Falha geral ao bloquear bookmarklets - continuar sem essa proteção
      this.logger.warn('LOCKDOWN', 'BOOKMARKLETS_BLOCK_FAILED', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Adicionar proteção parcial mesmo assim
      this.protections.push('bookmarklets-blocked-partial');
    }
  }

  /**
   * Inicia monitoramento contínuo (500ms)
   * Requirement 5.14
   */
  private startContinuousMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck();
    }, MONITORING_INTERVAL_MS);

    this.protections.push('continuous-monitoring');
    this.logger.info('LOCKDOWN', 'CONTINUOUS_MONITORING_STARTED', {
      intervalMs: MONITORING_INTERVAL_MS,
    });
  }

  /**
   * Executa verificação de monitoramento
   */
  private performMonitoringCheck(): void {
    // Monitoramento contínuo de integridade do ambiente
    //
    // NOTA: A verificação de DevTools por dimensões foi removida porque
    // causa falsos positivos com o Side Panel do Chrome aberto.
    // A proteção contra DevTools é garantida pelo bloqueio de atalhos
    // no lockdown-injector.ts (mundo MAIN).
    //
    // O monitoramento contínuo agora foca apenas em:
    // - Violações de atalhos de DevTools (reportadas pelo mundo MAIN)
    // - Integridade geral do ambiente de lockdown
  }

  /**
   * Detecta se DevTools está aberto
   * Requirement 5.12
   *
   * IMPORTANTE: Esta detecção usa heurísticas que podem ter falsos positivos.
   * Para evitar falsos positivos, usamos múltiplas verificações:
   * 1. Diferença de dimensões (threshold aumentado para 200px)
   * 2. Verificação de que AMBAS as dimensões são válidas (> 0)
   * 3. Verificação de proporção mínima (evita janelas muito pequenas)
   *
   * DevTools docked tipicamente adiciona 250-400px de diferença.
   * Barras de ferramentas normais raramente excedem 150px.
   */
  isDevToolsOpen(): boolean {
    // DESABILITADO: A detecção por dimensões (outerWidth - innerWidth) causa
    // falsos positivos quando o Side Panel do Chrome está aberto (~320px),
    // com zoom diferente de 100%, ou com sidebars de extensões.
    //
    // A proteção contra DevTools é garantida pelo bloqueio de atalhos
    // no lockdown-injector.ts (mundo MAIN): F12, Ctrl+Shift+I/J/C, Ctrl+U.
    //
    // Referência: sindresorhus/devtools-detect reconhece que esta heurística
    // "has too many false-positives" e "will show false positive if you
    // toggle any kind of sidebar."
    return false;
  }

  // ==========================================================================
  // Métodos Auxiliares
  // ==========================================================================

  /**
   * Captura snapshot baseline do DOM
   * Requirement 5.16
   */
  private async captureBaseline(): Promise<DOMBaseline> {
    const elementCount = document.querySelectorAll('*').length;
    const textContentLength = document.body?.textContent?.length ?? 0;

    // Calcular hash simples do conteúdo (para verificação básica)
    const content = document.documentElement.outerHTML;
    const hash = await this.simpleHash(content);

    return {
      hash,
      elementCount,
      textContentLength,
      timestamp: Date.now(),
    };
  }

  /**
   * Calcula hash simples (para baseline)
   */
  private async simpleHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Cria baseline vazio
   */
  private createEmptyBaseline(): DOMBaseline {
    return {
      hash: '',
      elementCount: 0,
      textContentLength: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Registra violação com timestamp
   * Requirement 5.17
   */
  private logViolation(type: string, details: Record<string, unknown>): void {
    const violation: ViolacaoLockdown = {
      type,
      timestamp: Date.now(),
      details,
    };

    this.violations.push(violation);
    this.logger.warn('LOCKDOWN', 'VIOLATION_DETECTED', { type, details });
  }

  /**
   * Limpa todas as proteções e listeners
   */
  private cleanup(): void {
    // CRÍTICO: Desativar lockdown no mundo MAIN primeiro
    this.sendToMainWorld('LEXATO_LOCKDOWN_DEACTIVATE');

    // Resetar flag de injeção (permite re-injeção em próxima captura se necessário)
    // Nota: O script permanece na memória da página, só desativa via mensagem
    this.mainWorldScriptInjected = false;

    // Remover listener de mensagens do mundo MAIN
    if (this.boundMainWorldMessageHandler) {
      window.removeEventListener('message', this.boundMainWorldMessageHandler);
      this.boundMainWorldMessageHandler = null;
    }

    // Parar monitoramento contínuo
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Remover listeners de teclado
    if (this.boundKeydownHandler) {
      document.removeEventListener('keydown', this.boundKeydownHandler, true);
      this.boundKeydownHandler = null;
    }
    if (this.boundKeyupHandler) {
      document.removeEventListener('keyup', this.boundKeyupHandler, true);
      this.boundKeyupHandler = null;
    }
    if (this.boundKeypressHandler) {
      document.removeEventListener('keypress', this.boundKeypressHandler, true);
      this.boundKeypressHandler = null;
    }

    // Remover listener de menu de contexto
    if (this.boundContextMenuHandler) {
      document.removeEventListener('contextmenu', this.boundContextMenuHandler, true);
      this.boundContextMenuHandler = null;
    }

    // Remover listeners de seleção e drag
    if (this.boundSelectStartHandler) {
      document.removeEventListener('selectstart', this.boundSelectStartHandler, true);
      this.boundSelectStartHandler = null;
    }
    if (this.boundDragStartHandler) {
      document.removeEventListener('dragstart', this.boundDragStartHandler, true);
      this.boundDragStartHandler = null;
    }

    // Remover listeners de impressão
    if (this.boundBeforePrintHandler) {
      window.removeEventListener('beforeprint', this.boundBeforePrintHandler, true);
      this.boundBeforePrintHandler = null;
    }
    if (this.boundAfterPrintHandler) {
      window.removeEventListener('afterprint', this.boundAfterPrintHandler, true);
      this.boundAfterPrintHandler = null;
    }

    // Remover listeners de clipboard
    if (this.boundCopyHandler) {
      document.removeEventListener('copy', this.boundCopyHandler, true);
      this.boundCopyHandler = null;
    }
    if (this.boundPasteHandler) {
      document.removeEventListener('paste', this.boundPasteHandler, true);
      this.boundPasteHandler = null;
    }
    if (this.boundCutHandler) {
      document.removeEventListener('cut', this.boundCutHandler, true);
      this.boundCutHandler = null;
    }

    // Remover listeners de mouse
    if (this.boundAuxClickHandler) {
      document.removeEventListener('auxclick', this.boundAuxClickHandler, true);
      this.boundAuxClickHandler = null;
    }
    if (this.boundMouseDownHandler) {
      document.removeEventListener('mousedown', this.boundMouseDownHandler, true);
      this.boundMouseDownHandler = null;
    }

    // Remover CSS de proteção injetado
    if (this.injectedStyle?.parentNode) {
      this.injectedStyle.parentNode.removeChild(this.injectedStyle);
      this.injectedStyle = null;
    }

    // Restaurar funções de location
    if (this.originalLocationAssign) {
      try {
        window.location.assign = this.originalLocationAssign;
      } catch {
        // Pode falhar em alguns ambientes
      }
      this.originalLocationAssign = null;
    }
    if (this.originalLocationReplace) {
      try {
        window.location.replace = this.originalLocationReplace;
      } catch {
        // Pode falhar em alguns ambientes
      }
      this.originalLocationReplace = null;
    }

    this.logger.info('LOCKDOWN', 'CLEANUP_COMPLETE', {});
  }
}

export default LockdownSecurityManager;
