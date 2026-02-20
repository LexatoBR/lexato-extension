/**
 * Tipos para o Modo de Isolamento de Abas (Tab Isolation)
 *
 * Define interfaces e tipos para gerenciamento de isolamento de abas durante
 * gravação de vídeo forense. O isolamento impede abertura de novas abas/janelas
 * para garantir que toda navegação ocorra na aba gravada, preservando a cadeia
 * de custódia completa sem lacunas na evidência.
 *
 * @module TabIsolationTypes
 * @see Requirements 13.33-13.36 do Sistema de Captura de Vídeo Forense
 */

// ============================================================================
// Tipos de Tentativa Bloqueada
// ============================================================================

/**
 * Tipo de tentativa de abertura de nova aba/janela bloqueada
 *
 * - `new_tab`: Nova aba criada via chrome.tabs.onCreated
 * - `new_window`: Nova janela criada via chrome.windows.onCreated
 * - `target_blank`: Link com target="_blank" interceptado
 * - `window_open`: Chamada window.open() interceptada
 * - `keyboard_shortcut_probable`: Aba chrome://newtab/ (provável Ctrl+T)
 */
export type BlockedAttemptType =
  | 'new_tab'
  | 'new_window'
  | 'target_blank'
  | 'window_open'
  | 'keyboard_shortcut_probable';

/**
 * Ação tomada ao bloquear tentativa
 *
 * - `closed`: Aba/janela foi fechada
 * - `redirected`: Navegação redirecionada para mesma aba
 * - `blocked`: Ação foi bloqueada sem redirecionamento
 */
export type BlockedAttemptAction = 'closed' | 'redirected' | 'blocked';

// ============================================================================
// Interfaces Principais
// ============================================================================

/**
 * Informações de uma aba fechada antes da gravação
 * Requirement 13.35
 */
export interface ClosedTabInfo {
  /** ID da aba fechada */
  tabId: number;
  /** URL da aba */
  url: string;
  /** Título da aba */
  title: string;
  /** Timestamp do fechamento (ISO 8601) */
  closedAt: string;
}

/**
 * Tentativa bloqueada de abertura de aba/janela
 * Requirement 13.34
 */
export interface BlockedTabAttempt {
  /** Tipo de tentativa */
  type: BlockedAttemptType;
  /** URL tentada (se disponível) */
  attemptedUrl?: string;
  /** Timestamp da tentativa (ISO 8601) */
  timestamp: string;
  /** Ação tomada */
  action: BlockedAttemptAction;
  /** Tempo de reação em ms (do evento até fechamento) */
  reactionTimeMs?: number;
}

/**
 * Estado dos listeners ativos durante isolamento
 */
export interface TabIsolationActiveListeners {
  /** Listener chrome.tabs.onCreated ativo */
  tabsOnCreated: boolean;
  /** Listener chrome.windows.onCreated ativo */
  windowsOnCreated: boolean;
  /** Interceptação de atalhos de teclado ativa (via detecção e fechamento) */
  keyboardShortcuts: boolean;
}

/**
 * Estado do isolamento de abas durante gravação
 * Requirement 13.33
 */
export interface TabIsolationState {
  /** Se o isolamento de abas está ativo */
  isActive: boolean;
  /** ID da aba sendo gravada */
  recordingTabId: number;
  /** ID da janela sendo gravada */
  recordingWindowId: number;
  /** Timestamp de ativação (ISO 8601) */
  activatedAt: string;
  /** Abas fechadas antes da gravação */
  closedTabsBeforeRecording: ClosedTabInfo[];
  /** Tentativas de abertura bloqueadas */
  blockedAttempts: BlockedTabAttempt[];
  /** Listeners ativos */
  activeListeners: TabIsolationActiveListeners;
}

/**
 * Seção do manifesto com estatísticas de isolamento de abas
 * Requirement 13.36
 */
export interface TabIsolationManifestSection {
  /** Isolamento foi ativado */
  enabled: boolean;
  /** Abas fechadas antes da gravação */
  closedTabsBeforeRecording: Array<{
    url: string;
    title: string;
    closedAt: string;
  }>;
  /** Total de tentativas bloqueadas */
  totalBlockedAttempts: number;
  /** Detalhes das tentativas bloqueadas */
  blockedAttempts: BlockedTabAttempt[];
  /** Integridade do isolamento mantida (sem violações) */
  integrityVerified: boolean;
  /** Violações detectadas (se houver) */
  violations?: string[];
  /** Tempo médio de reação para fechar abas (ms) */
  averageReactionTimeMs?: number;
}

// ============================================================================
// Interfaces de Configuração
// ============================================================================

/**
 * Configuração do isolamento de abas
 */
export interface TabIsolationConfig {
  /** Tempo máximo de reação aceitável em ms (padrão: 100) */
  maxReactionTimeMs: number;
  /** Se deve registrar tentativas bloqueadas no audit log */
  logBlockedAttempts: boolean;
  /** Se deve exibir notificações no overlay */
  showOverlayNotifications: boolean;
  /** Timeout para fechamento de abas em ms (padrão: 5000) */
  closeTabTimeout: number;
}

// ============================================================================
// Interfaces de Mensagens
// ============================================================================

/**
 * Mensagem de ativação do isolamento para content script
 */
export interface TabIsolationActivateMessage {
  type: 'LEXATO_ISOLATION_ACTIVATE';
}

/**
 * Mensagem de desativação do isolamento para content script
 */
export interface TabIsolationDeactivateMessage {
  type: 'LEXATO_ISOLATION_DEACTIVATE';
}

/**
 * Mensagem de window.open bloqueado do content script (world: MAIN)
 */
export interface WindowOpenBlockedMessage {
  type: 'LEXATO_WINDOW_OPEN_BLOCKED';
  url: string;
  target?: string;
  timestamp: number;
}

/**
 * Mensagem de target="_blank" bloqueado do content script (world: MAIN)
 */
export interface TargetBlankBlockedMessage {
  type: 'LEXATO_TARGET_BLANK_BLOCKED';
  url: string;
  timestamp: number;
}

/**
 * União de todas as mensagens de isolamento
 */
export type TabIsolationMessage =
  | TabIsolationActivateMessage
  | TabIsolationDeactivateMessage
  | WindowOpenBlockedMessage
  | TargetBlankBlockedMessage;

/**
 * Notificação de aba bloqueada para o overlay
 */
export interface TabBlockedNotification {
  type: 'TAB_BLOCKED_NOTIFICATION';
  message: string;
  attemptType: BlockedAttemptType;
  timestamp: string;
}

// ============================================================================
// Interfaces de Resultado
// ============================================================================

/**
 * Resultado da ativação do isolamento
 */
export interface TabIsolationActivationResult {
  /** Se a ativação foi bem-sucedida */
  success: boolean;
  /** Abas fechadas durante ativação */
  closedTabs: ClosedTabInfo[];
  /** Janelas fechadas durante ativação */
  closedWindows: number[];
  /** Erro se houver */
  error?: string;
  /** Tempo total da operação (ms) */
  elapsedMs: number;
}

/**
 * Resultado da desativação do isolamento
 */
export interface TabIsolationDeactivationResult {
  /** Se a desativação foi bem-sucedida */
  success: boolean;
  /** Total de tentativas bloqueadas durante sessão */
  totalBlockedAttempts: number;
  /** Erro se houver */
  error?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Verifica se objeto é ClosedTabInfo válido
 * @param obj - Objeto a verificar
 * @returns true se for ClosedTabInfo válido
 */
export function isClosedTabInfo(obj: unknown): obj is ClosedTabInfo {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const info = obj as Record<string, unknown>;
  return (
    typeof info['tabId'] === 'number' &&
    typeof info['url'] === 'string' &&
    typeof info['title'] === 'string' &&
    typeof info['closedAt'] === 'string'
  );
}

/**
 * Verifica se string é BlockedAttemptType válido
 * @param type - String a verificar
 * @returns true se for BlockedAttemptType válido
 */
export function isBlockedAttemptType(type: unknown): type is BlockedAttemptType {
  return (
    type === 'new_tab' ||
    type === 'new_window' ||
    type === 'target_blank' ||
    type === 'window_open' ||
    type === 'keyboard_shortcut_probable'
  );
}

/**
 * Verifica se string é BlockedAttemptAction válida
 * @param action - String a verificar
 * @returns true se for BlockedAttemptAction válida
 */
export function isBlockedAttemptAction(action: unknown): action is BlockedAttemptAction {
  return action === 'closed' || action === 'redirected' || action === 'blocked';
}

/**
 * Verifica se objeto é BlockedTabAttempt válido
 * @param obj - Objeto a verificar
 * @returns true se for BlockedTabAttempt válido
 */
export function isBlockedTabAttempt(obj: unknown): obj is BlockedTabAttempt {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const attempt = obj as Record<string, unknown>;

  // Campos obrigatórios
  if (!isBlockedAttemptType(attempt['type'])) {
    return false;
  }
  if (typeof attempt['timestamp'] !== 'string') {
    return false;
  }
  if (!isBlockedAttemptAction(attempt['action'])) {
    return false;
  }

  // Campos opcionais
  if (attempt['attemptedUrl'] !== undefined && typeof attempt['attemptedUrl'] !== 'string') {
    return false;
  }
  if (attempt['reactionTimeMs'] !== undefined && typeof attempt['reactionTimeMs'] !== 'number') {
    return false;
  }

  return true;
}

/**
 * Verifica se objeto é TabIsolationActiveListeners válido
 * @param obj - Objeto a verificar
 * @returns true se for TabIsolationActiveListeners válido
 */
export function isTabIsolationActiveListeners(obj: unknown): obj is TabIsolationActiveListeners {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const listeners = obj as Record<string, unknown>;
  return (
    typeof listeners['tabsOnCreated'] === 'boolean' &&
    typeof listeners['windowsOnCreated'] === 'boolean' &&
    typeof listeners['keyboardShortcuts'] === 'boolean'
  );
}

/**
 * Verifica se objeto é TabIsolationState válido
 * @param obj - Objeto a verificar
 * @returns true se for TabIsolationState válido
 */
export function isTabIsolationState(obj: unknown): obj is TabIsolationState {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const state = obj as Record<string, unknown>;

  // Campos obrigatórios
  if (typeof state['isActive'] !== 'boolean') {
    return false;
  }
  if (typeof state['recordingTabId'] !== 'number') {
    return false;
  }
  if (typeof state['recordingWindowId'] !== 'number') {
    return false;
  }
  if (typeof state['activatedAt'] !== 'string') {
    return false;
  }

  // Arrays
  if (!Array.isArray(state['closedTabsBeforeRecording'])) {
    return false;
  }
  if (!state['closedTabsBeforeRecording'].every(isClosedTabInfo)) {
    return false;
  }

  if (!Array.isArray(state['blockedAttempts'])) {
    return false;
  }
  if (!state['blockedAttempts'].every(isBlockedTabAttempt)) {
    return false;
  }

  // Objeto aninhado
  if (!isTabIsolationActiveListeners(state['activeListeners'])) {
    return false;
  }

  return true;
}

/**
 * Verifica se objeto é TabIsolationManifestSection válido
 * @param obj - Objeto a verificar
 * @returns true se for TabIsolationManifestSection válido
 */
export function isTabIsolationManifestSection(obj: unknown): obj is TabIsolationManifestSection {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const section = obj as Record<string, unknown>;

  // Campos obrigatórios
  if (typeof section['enabled'] !== 'boolean') {
    return false;
  }
  if (typeof section['totalBlockedAttempts'] !== 'number') {
    return false;
  }
  if (typeof section['integrityVerified'] !== 'boolean') {
    return false;
  }

  // Array de abas fechadas
  if (!Array.isArray(section['closedTabsBeforeRecording'])) {
    return false;
  }
  for (const tab of section['closedTabsBeforeRecording']) {
    if (typeof tab !== 'object' || tab === null) {
      return false;
    }
    const tabInfo = tab as Record<string, unknown>;
    if (
      typeof tabInfo['url'] !== 'string' ||
      typeof tabInfo['title'] !== 'string' ||
      typeof tabInfo['closedAt'] !== 'string'
    ) {
      return false;
    }
  }

  // Array de tentativas bloqueadas
  if (!Array.isArray(section['blockedAttempts'])) {
    return false;
  }
  if (!section['blockedAttempts'].every(isBlockedTabAttempt)) {
    return false;
  }

  // Campos opcionais
  if (section['violations'] !== undefined) {
    if (!Array.isArray(section['violations'])) {
      return false;
    }
    if (!section['violations'].every((v: unknown) => typeof v === 'string')) {
      return false;
    }
  }

  if (
    section['averageReactionTimeMs'] !== undefined &&
    typeof section['averageReactionTimeMs'] !== 'number'
  ) {
    return false;
  }

  return true;
}

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Cria estado inicial do isolamento de abas
 * @returns Estado inicial com valores padrão
 */
export function createInitialTabIsolationState(): TabIsolationState {
  return {
    isActive: false,
    recordingTabId: -1,
    recordingWindowId: -1,
    activatedAt: '',
    closedTabsBeforeRecording: [],
    blockedAttempts: [],
    activeListeners: {
      tabsOnCreated: false,
      windowsOnCreated: false,
      keyboardShortcuts: false,
    },
  };
}

/**
 * Cria configuração padrão do isolamento de abas
 * @returns Configuração com valores padrão
 */
export function createDefaultTabIsolationConfig(): TabIsolationConfig {
  return {
    maxReactionTimeMs: 100,
    logBlockedAttempts: true,
    showOverlayNotifications: true,
    closeTabTimeout: 5000,
  };
}

/**
 * Calcula tempo médio de reação das tentativas bloqueadas
 * @param attempts - Array de tentativas bloqueadas
 * @returns Tempo médio em ms ou undefined se não houver dados
 */
export function calculateAverageReactionTime(
  attempts: BlockedTabAttempt[]
): number | undefined {
  const attemptsWithTime = attempts.filter(
    (a) => a.reactionTimeMs !== undefined
  );

  if (attemptsWithTime.length === 0) {
    return undefined;
  }

  const totalTime = attemptsWithTime.reduce(
    (sum, a) => sum + (a.reactionTimeMs ?? 0),
    0
  );

  return Math.round(totalTime / attemptsWithTime.length);
}

/**
 * Gera seção do manifesto a partir do estado de isolamento
 * @param state - Estado atual do isolamento
 * @param violations - Violações detectadas (opcional)
 * @returns Seção do manifesto formatada
 */
export function generateManifestSectionFromState(
  state: TabIsolationState,
  violations?: string[]
): TabIsolationManifestSection {
  const section: TabIsolationManifestSection = {
    enabled: state.isActive || state.closedTabsBeforeRecording.length > 0,
    closedTabsBeforeRecording: state.closedTabsBeforeRecording.map((tab) => ({
      url: tab.url,
      title: tab.title,
      closedAt: tab.closedAt,
    })),
    totalBlockedAttempts: state.blockedAttempts.length,
    blockedAttempts: state.blockedAttempts,
    integrityVerified: !violations || violations.length === 0,
  };

  // Adicionar campos opcionais apenas se tiverem valor
  if (violations && violations.length > 0) {
    section.violations = violations;
  }

  const avgReactionTime = calculateAverageReactionTime(state.blockedAttempts);
  if (avgReactionTime !== undefined) {
    section.averageReactionTimeMs = avgReactionTime;
  }

  return section;
}
