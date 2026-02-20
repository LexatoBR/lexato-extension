/**
 * Helpers para tratamento de erros
 *
 * Padroniza extração de mensagens de erro em todo o Service Worker.
 *
 * @module ErrorHelpers
 */

/**
 * Extrai mensagem de erro de forma segura de qualquer tipo de erro
 *
 * @param error - Erro de qualquer tipo (Error, string, unknown)
 * @returns Mensagem de erro como string
 *
 * @example
 * ```typescript
 * try {
 *   await operacaoArriscada();
 * } catch (error) {
 *   logger.error('OPERACAO', 'FALHA', { error: getErrorMessage(error) });
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Erro desconhecido';
}

/**
 * Extrai stack trace de forma segura
 *
 * @param error - Erro de qualquer tipo
 * @returns Stack trace ou undefined se não disponível
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Extrai nome do erro de forma segura
 *
 * @param error - Erro de qualquer tipo
 * @returns Nome do erro ou 'Unknown'
 */
export function getErrorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return 'Unknown';
}

/**
 * Cria objeto de erro padronizado para logging
 *
 * @param error - Erro de qualquer tipo
 * @returns Objeto com message, name e stack
 */
export function createErrorDetails(error: unknown): {
  message: string;
  name: string;
  stack?: string;
} {
  const stack = getErrorStack(error);
  return {
    message: getErrorMessage(error),
    name: getErrorName(error),
    ...(stack !== undefined && { stack }),
  };
}

/**
 * Verifica se erro é de permissão do Chrome
 *
 * @param error - Erro a verificar
 * @returns true se for erro de permissão
 */
export function isPermissionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('permission') ||
    message.includes('activeTab') ||
    message.includes('all_urls') ||
    message.includes('cannot access')
  );
}

/**
 * Verifica se erro é de aba não encontrada
 *
 * @param error - Erro a verificar
 * @returns true se for erro de aba não encontrada
 */
export function isTabNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('no tab') || message.includes('tab was closed');
}

/**
 * Verifica se erro é de timeout
 *
 * @param error - Erro a verificar
 * @returns true se for erro de timeout
 */
export function isTimeoutError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('timeout') || message.includes('timed out');
}
