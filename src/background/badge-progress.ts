/**
 * Badge Progress - Indicador de progresso no ícone da extensão
 *
 * Gerencia o badge da extensão para mostrar progresso durante gravação de vídeo.
 * Atualiza a cada 5% de progresso, muda de cor quando próximo do limite,
 * e pisca quando a gravação é finalizada.
 *
 * @module BadgeProgress
 * @see Requirements 20.1-20.5
 */

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração de cores do badge
 * Requirement 20.3, 20.4
 */
export const BADGE_PROGRESS_COLORS = {
  /** Cor verde para progresso normal (#00DEA5 - Lexato primary) */
  NORMAL: '#00DEA5',
  /** Cor amarela quando próximo do limite (últimos 20%) */
  WARNING: '#FFCA28',
  /** Cor vermelha para erro */
  ERROR: '#EF5350',
} as const;

/**
 * Configuração do badge de progresso
 */
export const BADGE_PROGRESS_CONFIG = {
  /** Porcentagem a partir da qual usar cor de aviso (80%) */
  WARNING_THRESHOLD: 80,
  /** Intervalo mínimo entre atualizações (5%) - Requirement 20.2 */
  UPDATE_INTERVAL_PERCENT: 5,
  /** Duração do piscar quando finalizado (ms) */
  BLINK_DURATION_MS: 2000,
  /** Intervalo entre piscadas (ms) */
  BLINK_INTERVAL_MS: 300,
} as const;

// ============================================================================
// Estado interno
// ============================================================================

/** Último valor de progresso atualizado */
let lastUpdatedPercent = -1;

/** Intervalo de piscar ativo */
let blinkInterval: ReturnType<typeof setInterval> | null = null;

/** Timeout para parar de piscar */
let blinkTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// Funções principais
// ============================================================================

/**
 * Atualiza o badge da extensão com porcentagem de progresso
 * Requirement 20.1, 20.2, 20.3, 20.4
 *
 * @param percent - Porcentagem de progresso (0-100)
 * @returns Promise que resolve quando badge é atualizado
 *
 * @example
 * ```typescript
 * // Atualizar progresso durante gravação
 * await updateBadgeProgress(25); // Mostra "25%" em verde
 * await updateBadgeProgress(85); // Mostra "85%" em amarelo (próximo do limite)
 * ```
 */
export async function updateBadgeProgress(percent: number): Promise<void> {
  // Validar e normalizar porcentagem
  const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  // Verificar se deve atualizar (a cada 5% ou se é 100%)
  // Requirement 20.2: Badge atualiza a cada 5% de progresso
  const shouldUpdate =
    normalizedPercent === 100 ||
    normalizedPercent === 0 ||
    Math.abs(normalizedPercent - lastUpdatedPercent) >= BADGE_PROGRESS_CONFIG.UPDATE_INTERVAL_PERCENT;

  if (!shouldUpdate) {
    return;
  }

  lastUpdatedPercent = normalizedPercent;

  // Determinar cor baseada no progresso
  // Requirement 20.3: Verde para normal, 20.4: Amarelo próximo do limite
  const color =
    normalizedPercent >= BADGE_PROGRESS_CONFIG.WARNING_THRESHOLD
      ? BADGE_PROGRESS_COLORS.WARNING
      : BADGE_PROGRESS_COLORS.NORMAL;

  // Formatar texto do badge
  const badgeText = `${normalizedPercent}%`;

  try {
    // Atualizar badge
    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (error) {
    // Ignorar erros silenciosamente (pode ocorrer se extensão está sendo descarregada)
    console.error('[BadgeProgress] Erro ao atualizar badge:', error);
  }
}

/**
 * Inicia efeito de piscar no badge quando gravação é finalizada
 * Requirement 20.5: Badge pisca quando gravação finalizada
 *
 * @param finalPercent - Porcentagem final (opcional, padrão 100)
 * @returns Promise que resolve quando piscar termina
 *
 * @example
 * ```typescript
 * // Piscar ao finalizar gravação
 * await blinkBadgeOnComplete();
 * ```
 */
export async function blinkBadgeOnComplete(finalPercent = 100): Promise<void> {
  // Limpar qualquer piscar anterior
  stopBlinking();

  const badgeText = `${finalPercent}%`;
  let isVisible = true;

  // Iniciar piscar
  // Requirement 20.5: Badge pisca quando finalizado
  blinkInterval = setInterval(async () => {
    try {
      if (isVisible) {
        await chrome.action.setBadgeText({ text: '' });
      } else {
        await chrome.action.setBadgeText({ text: badgeText });
        await chrome.action.setBadgeBackgroundColor({ color: BADGE_PROGRESS_COLORS.NORMAL });
      }
      isVisible = !isVisible;
    } catch {
      // Ignorar erros
    }
  }, BADGE_PROGRESS_CONFIG.BLINK_INTERVAL_MS);

  // Parar de piscar após duração definida
  blinkTimeout = setTimeout(() => {
    stopBlinking();
    // Limpar badge após piscar
    clearBadgeProgress().catch(() => {
      // Ignorar erros
    });
  }, BADGE_PROGRESS_CONFIG.BLINK_DURATION_MS);
}

/**
 * Para o efeito de piscar
 */
function stopBlinking(): void {
  if (blinkInterval) {
    clearInterval(blinkInterval);
    blinkInterval = null;
  }
  if (blinkTimeout) {
    clearTimeout(blinkTimeout);
    blinkTimeout = null;
  }
}

/**
 * Limpa o badge de progresso
 *
 * @returns Promise que resolve quando badge é limpo
 *
 * @example
 * ```typescript
 * // Limpar badge após gravação
 * await clearBadgeProgress();
 * ```
 */
export async function clearBadgeProgress(): Promise<void> {
  // Parar qualquer piscar em andamento
  stopBlinking();

  // Resetar estado
  lastUpdatedPercent = -1;

  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    // Ignorar erros
  }
}

/**
 * Define badge de erro
 *
 * @param message - Mensagem curta de erro (opcional)
 * @returns Promise que resolve quando badge é atualizado
 *
 * @example
 * ```typescript
 * // Mostrar erro no badge
 * await setBadgeError('ERR');
 * ```
 */
export async function setBadgeError(message = '!'): Promise<void> {
  // Parar qualquer piscar em andamento
  stopBlinking();

  // Resetar estado
  lastUpdatedPercent = -1;

  try {
    await chrome.action.setBadgeText({ text: message });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_PROGRESS_COLORS.ERROR });
  } catch {
    // Ignorar erros
  }
}

/**
 * Obtém o último valor de progresso atualizado
 * Útil para testes
 *
 * @returns Último valor de progresso ou -1 se não iniciado
 */
export function getLastUpdatedPercent(): number {
  return lastUpdatedPercent;
}

/**
 * Reseta o estado interno (útil para testes)
 */
export function resetBadgeState(): void {
  stopBlinking();
  lastUpdatedPercent = -1;
}
