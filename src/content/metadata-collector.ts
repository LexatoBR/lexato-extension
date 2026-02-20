/**
 * MetadataCollector - Coleta de metadados para evidências digitais
 *
 * Coleta informações completas sobre a página, ambiente, rede e logs
 * para compor os metadados da evidência digital.
 *
 * @module MetadataCollector
 * @see Requirements 9.1-9.10
 */

import { AuditLogger } from '../lib/audit-logger';
import type { CaptureMetadata, ConsoleLogEntry } from '../types/capture.types';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Metadados completos coletados
 */
export interface CollectedMetadata extends CaptureMetadata {
  /** Headers HTTP da página (se disponíveis) */
  httpHeaders?: Record<string, string>;
  /** Cookies visíveis (não HttpOnly) */
  cookies?: string[];
  /** Logs do console (errors, warnings) */
  consoleLogs?: ConsoleLogEntry[];
  /** Extensões desativadas durante captura (Requirement 6.3) */
  disabledExtensions?: DisabledExtensionInfo[];
}

/**
 * Informações de extensão desativada para metadados
 * Requirement 6.3
 */
export interface DisabledExtensionInfo {
  /** ID da extensão */
  id: string;
  /** Nome da extensão (se disponível) */
  name?: string;
}

/**
 * Configuração do coletor de metadados
 */
export interface MetadataCollectorConfig {
  /** Se deve coletar headers HTTP */
  collectHeaders: boolean;
  /** Se deve coletar cookies */
  collectCookies: boolean;
  /** Se deve coletar logs do console */
  collectConsoleLogs: boolean;
  /** Timeout para coleta de headers em ms */
  headersTimeout: number;
  /** Número máximo de logs do console a coletar */
  maxConsoleLogs: number;
}

/**
 * Resultado da coleta de metadados
 */
export interface MetadataCollectionResult {
  /** Se a coleta foi bem-sucedida */
  success: boolean;
  /** Metadados coletados */
  metadata?: CollectedMetadata;
  /** JSON estruturado dos metadados */
  metadataJson?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração padrão do coletor
 */
const DEFAULT_CONFIG: MetadataCollectorConfig = {
  collectHeaders: true,
  collectCookies: true,
  collectConsoleLogs: true,
  headersTimeout: 5000, // 5 segundos
  maxConsoleLogs: 100,
};

// ============================================================================
// MetadataCollector
// ============================================================================

/**
 * MetadataCollector - Coleta metadados completos da página e ambiente
 *
 * Funcionalidades:
 * - Coleta URL, título, timestamp ISO 8601 (Requirements 9.1, 9.2, 9.3)
 * - Coleta User-Agent, versão da extensão (Requirements 9.4, 9.5)
 * - Coleta dimensões do viewport (Requirement 9.6)
 * - Coleta headers HTTP via fetch (Requirement 9.7)
 * - Coleta logs do console (Requirement 9.8)
 * - Coleta cookies visíveis (Requirement 9.9)
 * - Gera JSON estruturado (Requirement 9.10)
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const collector = new MetadataCollector(logger);
 *
 * const result = await collector.collect();
 * if (result.success) {
 *   console.log('Metadados:', result.metadataJson);
 * }
 * ```
 */
export class MetadataCollector {
  private logger: AuditLogger;
  private config: MetadataCollectorConfig;
  private consoleLogs: ConsoleLogEntry[] = [];
  private originalConsoleError: typeof console.error | null = null;
  private originalConsoleWarn: typeof console.warn | null = null;
  private isCapturingLogs = false;

  /**
   * Cria nova instância do MetadataCollector
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   * @param config - Configuração customizada (opcional)
   */
  constructor(logger: AuditLogger, config?: Partial<MetadataCollectorConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): MetadataCollectorConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Coleta Principal
  // ==========================================================================

  /**
   * Coleta todos os metadados da página
   *
   * @param disabledExtensions - Lista de extensões desativadas durante captura (Requirement 6.3)
   * @returns Resultado com metadados coletados e JSON estruturado
   */
  async collect(disabledExtensions?: DisabledExtensionInfo[]): Promise<MetadataCollectionResult> {
    this.logger.info('CAPTURE', 'METADATA_COLLECTION_START', {
      url: window.location.href,
      config: this.config,
      disabledExtensionsCount: disabledExtensions?.length ?? 0,
    });

    try {
      // Coletar metadados básicos (Requirements 9.1, 9.2, 9.3)
      const basicMetadata = this.collectBasicMetadata();

      // Coletar informações de ambiente (Requirements 9.4, 9.5, 9.6)
      const environmentMetadata = this.collectEnvironmentMetadata();

      // Coletar headers HTTP (Requirement 9.7)
      let httpHeaders: Record<string, string> | undefined;
      if (this.config.collectHeaders) {
        httpHeaders = await this.collectHttpHeaders();
      }

      // Coletar cookies visíveis (Requirement 9.9)
      let cookies: string[] | undefined;
      if (this.config.collectCookies) {
        cookies = this.collectCookies();
      }

      // Coletar logs do console (Requirement 9.8)
      let consoleLogs: ConsoleLogEntry[] | undefined;
      if (this.config.collectConsoleLogs) {
        consoleLogs = this.getConsoleLogs();
      }

      // Montar metadados completos
      const metadata: CollectedMetadata = {
        ...basicMetadata,
        ...environmentMetadata,
      };

      // Adicionar campos opcionais apenas se definidos
      if (httpHeaders && Object.keys(httpHeaders).length > 0) {
        metadata.httpHeaders = httpHeaders;
      }
      if (cookies && cookies.length > 0) {
        metadata.cookies = cookies;
      }
      if (consoleLogs && consoleLogs.length > 0) {
        metadata.consoleLogs = consoleLogs;
      }
      // Requirement 6.3: Incluir extensões desativadas nos metadados
      if (disabledExtensions && disabledExtensions.length > 0) {
        metadata.disabledExtensions = disabledExtensions;
      }

      // Gerar JSON estruturado (Requirement 9.10)
      const metadataJson = this.generateJson(metadata);

      this.logger.info('CAPTURE', 'METADATA_COLLECTION_COMPLETE', {
        url: metadata.url,
        hasHeaders: !!httpHeaders,
        cookiesCount: cookies?.length ?? 0,
        consoleLogsCount: consoleLogs?.length ?? 0,
        disabledExtensionsCount: disabledExtensions?.length ?? 0,
      });

      return {
        success: true,
        metadata,
        metadataJson,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('CAPTURE', 'METADATA_COLLECTION_FAILED', { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // ==========================================================================
  // Coleta de Metadados Básicos (Requirements 9.1, 9.2, 9.3)
  // ==========================================================================

  /**
   * Coleta metadados básicos da página
   * Requirements 9.1, 9.2, 9.3
   *
   * @returns Metadados básicos (URL, título, timestamp)
   */
  collectBasicMetadata(): Pick<CaptureMetadata, 'url' | 'title' | 'timestamp'> {
    return {
      url: this.collectUrl(),
      title: this.collectTitle(),
      timestamp: this.collectTimestamp(),
    };
  }

  /**
   * Coleta URL completa da página
   * Requirement 9.1
   */
  collectUrl(): string {
    return window.location.href;
  }

  /**
   * Coleta título da página
   * Requirement 9.2
   */
  collectTitle(): string {
    return document.title || '';
  }

  /**
   * Coleta timestamp ISO 8601 com timezone
   * Requirement 9.3
   */
  collectTimestamp(): string {
    return new Date().toISOString();
  }

  // ==========================================================================
  // Coleta de Ambiente (Requirements 9.4, 9.5, 9.6)
  // ==========================================================================

  /**
   * Coleta metadados do ambiente
   * Requirements 9.4, 9.5, 9.6
   *
   * @returns Metadados de ambiente
   */
  collectEnvironmentMetadata(): Pick<
    CaptureMetadata,
    'userAgent' | 'extensionVersion' | 'viewport' | 'pageSize' | 'viewportsCaptured'
  > {
    return {
      userAgent: this.collectUserAgent(),
      extensionVersion: this.collectExtensionVersion(),
      viewport: this.collectViewportDimensions(),
      pageSize: this.collectPageSize(),
      viewportsCaptured: 1, // Valor padrão, será atualizado durante captura
    };
  }

  /**
   * Coleta User-Agent do navegador
   * Requirement 9.4
   */
  collectUserAgent(): string {
    return navigator.userAgent;
  }

  /**
   * Coleta versão da extensão
   * Requirement 9.5
   */
  collectExtensionVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      try {
        return chrome.runtime.getManifest().version;
      } catch {
        return '0.0.0';
      }
    }
    return '0.0.0';
  }

  /**
   * Coleta dimensões do viewport
   * Requirement 9.6
   */
  collectViewportDimensions(): { width: number; height: number } {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * Coleta dimensões da página completa
   */
  collectPageSize(): { width: number; height: number } {
    return {
      width: Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth
      ),
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      ),
    };
  }


  // ==========================================================================
  // Coleta de Rede (Requirement 9.7)
  // ==========================================================================

  /**
   * Coleta headers HTTP da página via fetch
   * Requirement 9.7
   *
   * @returns Headers HTTP ou undefined se falhar
   */
  async collectHttpHeaders(): Promise<Record<string, string> | undefined> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.headersTimeout);

      // Fazer requisição HEAD para obter headers sem baixar conteúdo
      const response = await fetch(window.location.href, {
        method: 'HEAD',
        signal: controller.signal,
        credentials: 'same-origin',
      });

      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        // Filtrar headers sensíveis
        if (!this.isSensitiveHeader(key)) {
          headers[key] = value;
        }
      });

      this.logger.info('CAPTURE', 'HTTP_HEADERS_COLLECTED', {
        headersCount: Object.keys(headers).length,
      });

      return headers;
    } catch (error) {
      // Não falhar a coleta por erro de headers
      this.logger.warn('CAPTURE', 'HTTP_HEADERS_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      return undefined;
    }
  }

  /**
   * Verifica se header é sensível e deve ser filtrado
   */
  private isSensitiveHeader(headerName: string): boolean {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
      'x-csrf-token',
    ];
    return sensitiveHeaders.includes(headerName.toLowerCase());
  }

  // ==========================================================================
  // Coleta de Logs do Console (Requirement 9.8)
  // ==========================================================================

  /**
   * Inicia captura de logs do console
   * Requirement 9.8
   */
  startConsoleCapture(): void {
    if (this.isCapturingLogs) {
      return;
    }

    this.consoleLogs = [];
    this.isCapturingLogs = true;

    // Salvar funções originais
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;

    // Interceptar console.error
    console.error = (...args: unknown[]) => {
      this.captureConsoleLog('error', args);
      this.originalConsoleError?.apply(console, args);
    };

    // Interceptar console.warn
    console.warn = (...args: unknown[]) => {
      this.captureConsoleLog('warn', args);
      this.originalConsoleWarn?.apply(console, args);
    };

    this.logger.info('CAPTURE', 'CONSOLE_CAPTURE_STARTED', {});
  }

  /**
   * Para captura de logs do console
   */
  stopConsoleCapture(): void {
    if (!this.isCapturingLogs) {
      return;
    }

    // Restaurar funções originais
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = null;
    }
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
      this.originalConsoleWarn = null;
    }

    this.isCapturingLogs = false;

    this.logger.info('CAPTURE', 'CONSOLE_CAPTURE_STOPPED', {
      logsCount: this.consoleLogs.length,
    });
  }

  /**
   * Captura entrada de log do console
   */
  private captureConsoleLog(level: 'error' | 'warn', args: unknown[]): void {
    if (this.consoleLogs.length >= this.config.maxConsoleLogs) {
      return; // Limite atingido
    }

    const message = args
      .map((arg) => {
        if (typeof arg === 'string') {
          return arg;
        }
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    this.consoleLogs.push({
      level,
      message: message.substring(0, 1000), // Limitar tamanho da mensagem
      timestamp: Date.now(),
    });
  }

  /**
   * Obtém logs do console capturados
   * Requirement 9.8
   */
  getConsoleLogs(): ConsoleLogEntry[] {
    return [...this.consoleLogs];
  }

  /**
   * Limpa logs do console capturados
   */
  clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  // ==========================================================================
  // Coleta de Cookies (Requirement 9.9)
  // ==========================================================================

  /**
   * Coleta cookies visíveis (não HttpOnly)
   * Requirement 9.9
   *
   * @returns Array de cookies no formato "nome=valor"
   */
  collectCookies(): string[] {
    try {
      const cookieString = document.cookie;
      if (!cookieString) {
        return [];
      }

      // Parsear cookies
      const cookies = cookieString.split(';').map((cookie) => cookie.trim()).filter((cookie) => cookie.length > 0);

      // Sanitizar valores sensíveis
      const sanitizedCookies = cookies.map((cookie) => {
        const [name] = cookie.split('=');
        if (name && this.isSensitiveCookie(name)) {
          return `${name}=***REDACTED***`;
        }
        return cookie;
      });

      this.logger.info('CAPTURE', 'COOKIES_COLLECTED', {
        count: sanitizedCookies.length,
      });

      return sanitizedCookies;
    } catch (error) {
      this.logger.warn('CAPTURE', 'COOKIES_COLLECTION_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      return [];
    }
  }

  /**
   * Verifica se cookie é sensível e deve ter valor mascarado
   */
  private isSensitiveCookie(cookieName: string): boolean {
    const sensitiveCookies = [
      'session',
      'token',
      'auth',
      'jwt',
      'access',
      'refresh',
      'csrf',
      'xsrf',
      'api_key',
      'apikey',
    ];
    const lowerName = cookieName.toLowerCase();
    return sensitiveCookies.some((sensitive) => lowerName.includes(sensitive));
  }

  // ==========================================================================
  // Geração de JSON (Requirement 9.10)
  // ==========================================================================

  /**
   * Gera JSON estruturado com todos os metadados
   * Requirement 9.10
   *
   * @param metadata - Metadados coletados
   * @returns JSON string com chaves ordenadas
   */
  generateJson(metadata: CollectedMetadata): string {
    // Ordenar chaves para consistência de hash
    const sortedMetadata = this.sortObjectKeys(metadata);
    return JSON.stringify(sortedMetadata, null, 2);
  }

  /**
   * Ordena chaves de objeto recursivamente
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }

    if (typeof obj === 'object') {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(obj as Record<string, unknown>).sort();

      for (const key of keys) {
        sorted[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
      }

      return sorted;
    }

    return obj;
  }

  // ==========================================================================
  // Métodos de Limpeza
  // ==========================================================================

  /**
   * Limpa recursos e restaura estado original
   */
  cleanup(): void {
    this.stopConsoleCapture();
    this.clearConsoleLogs();
  }
}

// ============================================================================
// Funções Auxiliares Exportadas
// ============================================================================

/**
 * Coleta metadados básicos da página de forma simplificada
 *
 * @returns Objeto com URL, título e timestamp
 */
export function collectBasicPageMetadata(): {
  url: string;
  title: string;
  timestamp: string;
} {
  return {
    url: window.location.href,
    title: document.title || '',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Coleta informações do ambiente de forma simplificada
 *
 * @returns Objeto com User-Agent, versão e viewport
 */
export function collectEnvironmentInfo(): {
  userAgent: string;
  extensionVersion: string;
  viewport: { width: number; height: number };
} {
  let extensionVersion = '0.0.0';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    try {
      extensionVersion = chrome.runtime.getManifest().version;
    } catch {
      // Ignorar erro
    }
  }

  return {
    userAgent: navigator.userAgent,
    extensionVersion,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

/**
 * Coleta cookies visíveis de forma simplificada
 *
 * @returns Array de cookies
 */
export function collectVisibleCookies(): string[] {
  const cookieString = document.cookie;
  if (!cookieString) {
    return [];
  }
  return cookieString.split(';').map((cookie) => cookie.trim()).filter((cookie) => cookie.length > 0);
}

/**
 * Gera timestamp ISO 8601 com timezone
 *
 * @returns Timestamp no formato ISO 8601
 */
export function generateISOTimestamp(): string {
  return new Date().toISOString();
}

export default MetadataCollector;
