/**
 * Retry Handler com backoff exponencial e jitter
 *
 * Implementa retry com backoff exponencial e jitter de 30% para evitar thundering herd
 *
 * @module RetryHandler
 */

/**
 * Configuração do Retry Handler
 */
export interface RetryConfig {
  /** Número máximo de tentativas (incluindo a primeira) */
  maxAttempts: number;
  /** Delay inicial em ms */
  initialDelayMs: number;
  /** Delay máximo em ms */
  maxDelayMs: number;
  /** Fator de multiplicação do backoff */
  backoffFactor: number;
  /** Percentual de jitter (0.3 = 30%) */
  jitterFactor: number;
  /** Função para determinar se erro é retryable */
  isRetryable?: ((error: unknown) => boolean) | undefined;
}

/**
 * Configurações padrão por tipo de serviço
 */
export const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  'icp-brasil': {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    jitterFactor: 0.3,
  },
  blockchain: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 15000,
    backoffFactor: 2,
    jitterFactor: 0.3,
  },
  'canal-seguro': {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
    jitterFactor: 0.2,
  },
  upload: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
    jitterFactor: 0.3,
  },
  api: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
    jitterFactor: 0.3,
  },
  default: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
    jitterFactor: 0.3,
  },
};

/**
 * Resultado de uma tentativa de retry
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelayMs: number;
}

/**
 * Informações sobre uma tentativa
 */
export interface AttemptInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error?: Error;
}

/**
 * Callback para notificação de tentativas
 */
export type OnRetryCallback = (info: AttemptInfo) => void;

/**
 * Erro lançado quando todas as tentativas falharam
 */
export class MaxRetriesExceededError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Máximo de ${attempts} tentativas excedido. Último erro: ${lastError.message}`);
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Verifica se erro é retryable por padrão
 * Considera retryable: erros de rede, timeout, 5xx
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Erros de rede
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return true;
    }

    // Erros HTTP 5xx (servidor)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }

    // Erros de rate limiting (429)
    if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }
  }

  // Verificar se é um objeto com status HTTP
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    // 5xx ou 429
    if (status >= 500 || status === 429) {
      return true;
    }
  }

  return false;
}

/**
 * RetryHandler - Executa operações com retry e backoff exponencial
 *
 * Características:
 * - Backoff exponencial: delay = initialDelay * (backoffFactor ^ attempt)
 * - Jitter de 30%: evita thundering herd
 * - Configurável por tipo de serviço
 * - Callback para notificação de tentativas
 */
export class RetryHandler {
  private config: RetryConfig;

  /**
   * Cria nova instância do RetryHandler
   *
   * @param serviceType - Tipo de serviço ou configuração customizada
   */
  constructor(serviceType: string | Partial<RetryConfig> = 'default') {
    if (typeof serviceType === 'string') {
      const defaultConfig = DEFAULT_RETRY_CONFIGS[serviceType] ?? DEFAULT_RETRY_CONFIGS['default'];
      this.config = { ...defaultConfig } as RetryConfig;
    } else {
      const defaultConfig = DEFAULT_RETRY_CONFIGS['default'];
      const safeDefault = defaultConfig ?? {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffFactor: 2,
        jitterFactor: 0.3,
      };
      this.config = {
        maxAttempts: serviceType.maxAttempts ?? safeDefault.maxAttempts,
        initialDelayMs: serviceType.initialDelayMs ?? safeDefault.initialDelayMs,
        maxDelayMs: serviceType.maxDelayMs ?? safeDefault.maxDelayMs,
        backoffFactor: serviceType.backoffFactor ?? safeDefault.backoffFactor,
        jitterFactor: serviceType.jitterFactor ?? safeDefault.jitterFactor,
        isRetryable: serviceType.isRetryable,
      };
    }
  }

  /**
   * Calcula delay com backoff exponencial e jitter
   *
   * @param attempt - Número da tentativa (0-indexed)
   * @returns Delay em ms
   */
  calculateDelay(attempt: number): number {
    // Backoff exponencial: initialDelay * (backoffFactor ^ attempt)
    const exponentialDelay = this.config.initialDelayMs * Math.pow(this.config.backoffFactor, attempt);

    // Limitar ao máximo
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Aplicar jitter (±jitterFactor)
    const jitterRange = cappedDelay * this.config.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange; // -jitterRange a +jitterRange

    return Math.max(0, Math.round(cappedDelay + jitter));
  }

  /**
   * Executa função com retry
   *
   * @param fn - Função assíncrona para executar
   * @param onRetry - Callback opcional para notificação de tentativas
   * @returns Resultado da função
   * @throws MaxRetriesExceededError se todas as tentativas falharem
   */
  async execute<T>(fn: () => Promise<T>, onRetry?: OnRetryCallback): Promise<T> {
    let lastError: Error = new Error('Nenhuma tentativa executada');
    let _totalDelayMs = 0;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Verificar se é a última tentativa
        if (attempt === this.config.maxAttempts - 1) {
          break;
        }

        // Verificar se erro é retryable
        const isRetryable = this.config.isRetryable ?? defaultIsRetryable;
        if (!isRetryable(error)) {
          throw lastError;
        }

        // Calcular delay
        const delayMs = this.calculateDelay(attempt);
        _totalDelayMs += delayMs;

        // Notificar callback
        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxAttempts: this.config.maxAttempts,
            delayMs,
            error: lastError,
          });
        }

        // Aguardar antes da próxima tentativa
        await this.sleep(delayMs);
      }
    }

    throw new MaxRetriesExceededError(this.config.maxAttempts, lastError);
  }

  /**
   * Executa função com retry e retorna resultado detalhado
   *
   * @param fn - Função assíncrona para executar
   * @param onRetry - Callback opcional para notificação de tentativas
   * @returns Resultado detalhado com sucesso/falha e estatísticas
   */
  async executeWithResult<T>(fn: () => Promise<T>, onRetry?: OnRetryCallback): Promise<RetryResult<T>> {
    let lastError: Error = new Error('Nenhuma tentativa executada');
    let totalDelayMs = 0;
    let attempts = 0;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      attempts++;

      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts,
          totalDelayMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Verificar se é a última tentativa
        if (attempt === this.config.maxAttempts - 1) {
          break;
        }

        // Verificar se erro é retryable
        const isRetryable = this.config.isRetryable ?? defaultIsRetryable;
        if (!isRetryable(error)) {
          return {
            success: false,
            error: lastError,
            attempts,
            totalDelayMs,
          };
        }

        // Calcular delay
        const delayMs = this.calculateDelay(attempt);
        totalDelayMs += delayMs;

        // Notificar callback
        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxAttempts: this.config.maxAttempts,
            delayMs,
            error: lastError,
          });
        }

        // Aguardar antes da próxima tentativa
        await this.sleep(delayMs);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalDelayMs,
    };
  }

  /**
   * Aguarda por um período de tempo
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}

/**
 * Função utilitária para retry simples
 *
 * @param fn - Função assíncrona para executar
 * @param serviceType - Tipo de serviço ou configuração
 * @param onRetry - Callback opcional
 * @returns Resultado da função
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  serviceType: string | Partial<RetryConfig> = 'default',
  onRetry?: OnRetryCallback
): Promise<T> {
  const handler = new RetryHandler(serviceType);
  return handler.execute(fn, onRetry);
}

export default RetryHandler;
