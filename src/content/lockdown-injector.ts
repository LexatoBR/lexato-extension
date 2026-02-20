/**
 * LockdownInjector - Script injetado no contexto MAIN da página
 *
 * CRÍTICO: Este script executa no mundo MAIN (contexto da página), não no ISOLATED.
 * Isso permite interceptar eventos ANTES do navegador processá-los.
 *
 * MODO VIDEO (Interativo):
 * - Bloqueia APENAS DevTools (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 * - Bloqueia menu de contexto (para impedir "Inspecionar Elemento")
 * - PERMITE todas as interações normais do usuário (cliques, teclado, scroll, formulários)
 * - Todas as interações são documentadas pelo interaction-tracker.ts
 *
 * Conformidade ISO 27037: Preservação de evidência digital com interação documentada
 *
 * IMPORTANTE: Usa export onExecute para compatibilidade com CRXJS vite-plugin
 * que requer essa função para scripts no mundo MAIN.
 *
 * @module LockdownInjector
 * @see Requirements 5.1-5.18, ISO 27037
 */

// ============================================================================
// Estado Global
// ============================================================================

/** Flag de lockdown ativo */
let lockdownActive = false;

/** Contador de violações */
let violationCount = 0;

/** Log prefix para identificação */
const LOG_PREFIX = '[Lexato Lockdown]';

// ============================================================================
// Configuração de Teclas Bloqueadas (APENAS DevTools)
// ============================================================================

/**
 * Teclas que abrem DevTools - SEMPRE bloqueadas durante lockdown
 */
const DEVTOOLS_KEYS = new Set(['F12']);

/**
 * Combinações Ctrl+Shift que abrem DevTools
 */
const DEVTOOLS_CTRL_SHIFT_KEYS = new Set(['I', 'i', 'J', 'j', 'C', 'c']);

/**
 * Combinações Ctrl que são perigosas (view source)
 * NOTA: Apenas Ctrl+U (view source) é bloqueado
 * Ctrl+S (save) e Ctrl+P (print) são PERMITIDOS para uso normal
 */
const DANGEROUS_CTRL_KEYS = new Set(['U', 'u']);

// ============================================================================
// Comunicação com Content Script
// ============================================================================

/**
 * Notifica content script sobre violação detectada
 */
function notifyViolation(type: string, details: Record<string, unknown>): void {
  violationCount++;

  window.postMessage({
    type: 'LEXATO_LOCKDOWN_VIOLATION',
    violationType: type,
    details: details,
    violationCount: violationCount,
    timestamp: Date.now(),
  }, '*');
}

// ============================================================================
// Bloqueio de Eventos de Teclado (APENAS DevTools)
// ============================================================================

/**
 * Handler para eventos de teclado - Bloqueia APENAS atalhos de DevTools
 *
 * IMPORTANTE: Todas as outras teclas são PERMITIDAS para interação normal
 * O interaction-tracker.ts documenta todas as teclas pressionadas
 */
function handleKeyEvent(e: KeyboardEvent): void {
  if (!lockdownActive) {
    return;
  }

  // F12 - DevTools - BLOQUEAR
  if (DEVTOOLS_KEYS.has(e.key) || e.keyCode === 123) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    notifyViolation('devtools-f12', { key: e.key, keyCode: e.keyCode });
    return;
  }

  // Ctrl+Shift+I/J/C - DevTools - BLOQUEAR
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && DEVTOOLS_CTRL_SHIFT_KEYS.has(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    notifyViolation('devtools-shortcut', {
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
    });
    return;
  }

  // Ctrl+U (view source) - BLOQUEAR
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && DANGEROUS_CTRL_KEYS.has(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    notifyViolation('view-source-blocked', { key: e.key });
    return;
  }

  // TODAS AS OUTRAS TECLAS SÃO PERMITIDAS
  // O interaction-tracker.ts documenta todas as interações
}

// ============================================================================
// Bloqueio de Menu de Contexto
// ============================================================================

/**
 * Handler para menu de contexto - Bloqueia para impedir "Inspecionar Elemento"
 *
 * NOTA: O menu de contexto é bloqueado porque não é possível remover apenas
 * a opção "Inspecionar Elemento". Para captura forense, isso é aceitável
 * já que todas as interações são documentadas de qualquer forma.
 */
function handleContextMenu(e: MouseEvent): void {
  if (!lockdownActive) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// ============================================================================
// Eventos de Mouse - APENAS bloqueia botão do meio (abre em nova aba)
// ============================================================================

/**
 * Handler para mousedown - bloqueia APENAS botão do meio
 *
 * Botão esquerdo (0) e direito (2) são PERMITIDOS para interação normal
 * Botão do meio (1) é bloqueado pois abre links em nova aba, quebrando isolamento
 */
function handleMouseDown(e: MouseEvent): void {
  if (!lockdownActive) {
    return;
  }

  // Botão 1 = meio - BLOQUEAR (abre em nova aba)
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    notifyViolation('middle-click-blocked', {
      button: e.button,
      x: e.clientX,
      y: e.clientY,
    });
  }

  // Botão 0 (esquerdo) e 2 (direito) são permitidos
  // O clique direito vai abrir o menu de contexto que será bloqueado separadamente
}

/**
 * Handler para auxclick (botão do meio) - backup
 */
function handleAuxClick(e: MouseEvent): void {
  if (!lockdownActive) {
    return;
  }

  // Apenas bloquear botão do meio
  if (e.button === 1) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
}

// ============================================================================
// Inicialização e Registro de Event Listeners
// ============================================================================

/**
 * Inicializa o lockdown injector
 * Chamado pelo CRXJS loader via onExecute
 */
function initializeLockdown(): void {
  // Escutar mensagens do content script isolado
  window.addEventListener('message', (event) => {
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

    if (event.data.type === 'LEXATO_LOCKDOWN_ACTIVATE') {
      lockdownActive = true;
      violationCount = 0;
      // Não injeta mais CSS restritivo - apenas bloqueia DevTools via JS
    } else if (event.data.type === 'LEXATO_LOCKDOWN_DEACTIVATE') {
      lockdownActive = false;
    }
  });

  // CRÍTICO: Usar fase de CAPTURA (true) para interceptar ANTES de outros handlers
  // e ANTES do navegador processar o evento

  // Eventos de teclado - bloqueia apenas DevTools
  document.addEventListener('keydown', handleKeyEvent, true);
  document.addEventListener('keyup', handleKeyEvent, true);
  document.addEventListener('keypress', handleKeyEvent, true);

  // Menu de contexto - bloqueia para impedir "Inspecionar"
  document.addEventListener('contextmenu', handleContextMenu, true);

  // Eventos de mouse - apenas botão do meio
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('auxclick', handleAuxClick, true);

  // Também adicionar no window para garantir captura
  window.addEventListener('keydown', handleKeyEvent, true);
  window.addEventListener('keyup', handleKeyEvent, true);
  window.addEventListener('contextmenu', handleContextMenu, true);

  // Marcar que o injector está pronto no mundo MAIN usando Symbol para evitar
  // colisão com scripts de outras extensões ou da própria página.
  // NOTA: O Symbol resolve colisão DENTRO do mundo MAIN, mas NÃO é acessível
  // do mundo ISOLATED. A comunicação cross-world usa window.postMessage.
  const LOCKDOWN_KEY = Symbol.for('com.lexato.lockdown.injector.ready');
  if (!(LOCKDOWN_KEY in window)) {
    (window as unknown as Record<symbol, boolean>)[LOCKDOWN_KEY] = true;
  }
}

// ============================================================================
// Export para CRXJS (mundo MAIN requer onExecute)
// ============================================================================

/**
 * Função exportada para o CRXJS loader
 * CRXJS chama onExecute automaticamente para scripts no mundo MAIN
 */
export function onExecute(): void {
  initializeLockdown();
}

// Também inicializar imediatamente como fallback
// caso o CRXJS não chame onExecute
initializeLockdown();
