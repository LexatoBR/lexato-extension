/**
 * Sistema de logging estruturado para extensão Chrome
 *
 * Integra com Sentry para captura de erros e breadcrumbs.
 * Em desenvolvimento: logs no console.
 * Em produção: apenas erros e warnings são logados, breadcrumbs enviados ao Sentry.
 *
 * @example
 * ```typescript
 * import { logger } from '@lib/logger';
 *
 * // Log simples
 * logger.info('Usuário autenticado');
 *
 * // Log com contexto
 * logger.info('Upload iniciado', { fileSize: 1024, fileName: 'test.webm' });
 *
 * // Log de erro com captura automática no Sentry
 * logger.error('Falha no upload', error, { captureId: '123' });
 *
 * // Criar logger com prefixo específico
 * const uploadLogger = logger.withPrefix('[Upload]');
 * uploadLogger.info('Iniciando...');
 * ```
 *
 * @module logger
 */

import {
  addBreadcrumb,
  captureException,
  captureMessage,
  isSentryInitialized,
} from './sentry';
import { isDev } from '../config/environment';

/**
 * Níveis de log disponíveis
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuração do logger
 */
interface LoggerConfig {
  /** Prefixo para todas as mensagens (ex: [ServiceWorker]) */
  prefix?: string | undefined;
  /** Nível mínimo de log (padrão: 'debug' em dev, 'warn' em prod) */
  minLevel?: LogLevel | undefined;
  /** Desabilita console logs (útil para testes) */
  silent?: boolean | undefined;
}

/**
 * Contexto adicional para logs
 */
type LogContext = Record<string, unknown>;

/**
 * Prioridade dos níveis de log
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Determina se estamos em ambiente de desenvolvimento
 * @see src/config/environment.ts - Configuração centralizada
 */
function isDevelopment(): boolean {
  return isDev();
}

/**
 * Determina se estamos em ambiente de teste
 */
function isTest(): boolean {
  return import.meta.env.MODE === 'test' || (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test');
}

/**
 * Nível mínimo de log baseado no ambiente
 */
function getDefaultMinLevel(): LogLevel {
  if (isTest()) {
    return 'error'; // Silencia logs em testes
  }
  if (isDevelopment()) {
    return 'debug';
  }
  return 'warn'; // Em produção, apenas warn e error
}

/**
 * Sanitiza dados sensíveis do contexto
 */
function sanitizeContext(context: LogContext): LogContext {
  const sensitiveKeys = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'idToken',
    'authorization',
    'apiKey',
    'secret',
    'credential',
    'cookie',
    'session',
  ];

  const sanitized: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursivamente sanitiza objetos aninhados
      sanitized[key] = sanitizeContext(value as LogContext);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Formata a mensagem de log
 */
function formatMessage(prefix: string | undefined, message: string): string {
  if (prefix) {
    return `${prefix} ${message}`;
  }
  return message;
}

/**
 * Classe Logger para logging estruturado
 */
class Logger {
  private prefix?: string | undefined;
  private minLevel: LogLevel;
  private silent: boolean;

  constructor(config: LoggerConfig = {}) {
    this.prefix = config.prefix;
    this.minLevel = config.minLevel ?? getDefaultMinLevel();
    this.silent = config.silent ?? false;
  }

  /**
   * Verifica se o nível de log deve ser exibido
   */
  private shouldLog(level: LogLevel): boolean {
    if (this.silent) {
      return false;
    }
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  /**
   * Log de debug - apenas em desenvolvimento
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) {
      return;
    }

    const formattedMessage = formatMessage(this.prefix, message);
    const sanitizedContext = context ? sanitizeContext(context) : undefined;

    // Debug apenas no console, não envia ao Sentry
    if (isDevelopment()) {
      if (sanitizedContext) {
        console.debug(formattedMessage, sanitizedContext);
      } else {
        console.debug(formattedMessage);
      }
    }
  }

  /**
   * Log informativo
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) {
      return;
    }

    const formattedMessage = formatMessage(this.prefix, message);
    const sanitizedContext = context ? sanitizeContext(context) : undefined;

    // Console log em desenvolvimento
    if (isDevelopment()) {
      if (sanitizedContext) {
        console.info(formattedMessage, sanitizedContext);
      } else {
        console.info(formattedMessage);
      }
    }

    // Adiciona breadcrumb ao Sentry
    if (isSentryInitialized()) {
      addBreadcrumb({
        category: 'log',
        message: formattedMessage,
        level: 'info',
        ...(sanitizedContext && { data: sanitizedContext }),
      });
    }
  }

  /**
   * Log de aviso
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) {
      return;
    }

    const formattedMessage = formatMessage(this.prefix, message);
    const sanitizedContext = context ? sanitizeContext(context) : undefined;

    // Console warn sempre (em dev e prod)
    if (sanitizedContext) {
      console.warn(formattedMessage, sanitizedContext);
    } else {
      console.warn(formattedMessage);
    }

    // Adiciona breadcrumb e envia mensagem ao Sentry
    if (isSentryInitialized()) {
      addBreadcrumb({
        category: 'warning',
        message: formattedMessage,
        level: 'warning',
        ...(sanitizedContext && { data: sanitizedContext }),
      });

      // Envia warning como mensagem ao Sentry para tracking
      captureMessage(formattedMessage, 'warning', sanitizedContext);
    }
  }

  /**
   * Log de erro - sempre captura no Sentry
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) {
      return;
    }

    const formattedMessage = formatMessage(this.prefix, message);
    const sanitizedContext = context ? sanitizeContext(context) : undefined;

    // Console error sempre
    if (error) {
      console.error(formattedMessage, error, sanitizedContext);
    } else if (sanitizedContext) {
      console.error(formattedMessage, sanitizedContext);
    } else {
      console.error(formattedMessage);
    }

    // Captura no Sentry
    if (isSentryInitialized()) {
      addBreadcrumb({
        category: 'error',
        message: formattedMessage,
        level: 'error',
        ...(sanitizedContext && { data: sanitizedContext }),
      });

      if (error) {
        captureException(error, {
          message: formattedMessage,
          ...sanitizedContext,
        });
      } else {
        captureMessage(formattedMessage, 'error', sanitizedContext);
      }
    }
  }

  /**
   * Cria um novo logger com prefixo específico
   *
   * @example
   * const uploadLogger = logger.withPrefix('[Upload]');
   */
  withPrefix(prefix: string): Logger {
    const combinedPrefix = this.prefix ? `${this.prefix} ${prefix}` : prefix;
    return new Logger({
      prefix: combinedPrefix,
      minLevel: this.minLevel,
      silent: this.silent,
    });
  }

  /**
   * Cria um novo logger com nível mínimo específico
   */
  withMinLevel(level: LogLevel): Logger {
    return new Logger({
      ...(this.prefix && { prefix: this.prefix }),
      minLevel: level,
      silent: this.silent,
    });
  }

  /**
   * Cria logger silencioso (para testes)
   */
  asSilent(): Logger {
    return new Logger({
      ...(this.prefix && { prefix: this.prefix }),
      minLevel: this.minLevel,
      silent: true,
    });
  }

  /**
   * Mede tempo de execução de uma operação
   *
   * @example
   * const result = await logger.time('uploadFile', async () => {
   *   return await uploadToS3(file);
   * });
   */
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const formattedOperation = formatMessage(this.prefix, operation);

    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);

      this.debug(`${operation} completado`, { durationMs: duration });

      if (isSentryInitialized()) {
        addBreadcrumb({
          category: 'performance',
          message: `${formattedOperation} completado em ${duration}ms`,
          level: 'info',
          data: { operation, durationMs: duration },
        });
      }

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} falhou após ${duration}ms`, error);
      throw error;
    }
  }

  /**
   * Agrupa múltiplas operações sob um contexto
   *
   * @example
   * logger.group('Processo de captura', () => {
   *   logger.info('Iniciando gravação');
   *   logger.info('Coletando metadados');
   * });
   */
  group(label: string, fn: () => void): void {
    const formattedLabel = formatMessage(this.prefix, label);

    if (isDevelopment() && !this.silent) {
      console.group(formattedLabel);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    } else {
      fn();
    }
  }

  /**
   * Cria um grupo colapsado (apenas em desenvolvimento)
   */
  groupCollapsed(label: string, fn: () => void): void {
    const formattedLabel = formatMessage(this.prefix, label);

    if (isDevelopment() && !this.silent) {
      console.groupCollapsed(formattedLabel);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    } else {
      fn();
    }
  }
}

/**
 * Logger padrão da aplicação
 */
export const logger = new Logger();

/**
 * Loggers pré-configurados para cada contexto da extensão
 */
export const loggers = {
  /** Logger para o Service Worker */
  serviceWorker: new Logger({ prefix: '[SW]' }),

  /** Logger para o Content Script */
  contentScript: new Logger({ prefix: '[CS]' }),

  /** Logger para o Popup */
  popup: new Logger({ prefix: '[Popup]' }),

  /** Logger para o Side Panel */
  sidePanel: new Logger({ prefix: '[SidePanel]' }),

  /** Logger para o Offscreen */
  offscreen: new Logger({ prefix: '[Offscreen]' }),

  /** Logger para Preview */
  preview: new Logger({ prefix: '[Preview]' }),

  /** Logger para API Client */
  api: new Logger({ prefix: '[API]' }),

  /** Logger para Upload */
  upload: new Logger({ prefix: '[Upload]' }),

  /** Logger para Evidence Pipeline */
  pipeline: new Logger({ prefix: '[Pipeline]' }),

  /** Logger para Blockchain */
  blockchain: new Logger({ prefix: '[Blockchain]' }),

  /** Logger para Forensic */
  forensic: new Logger({ prefix: '[Forensic]' }),

  /** Logger para Storage */
  storage: new Logger({ prefix: '[Storage]' }),

  /** Logger para Auth */
  auth: new Logger({ prefix: '[Auth]' }),
};

/**
 * Cria um logger customizado
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Tipo exportado para uso externo
 */
export type { Logger, LoggerConfig };
