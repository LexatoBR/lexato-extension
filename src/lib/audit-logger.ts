/**
 * Sistema de auditoria e rastreabilidade para a extensão Lexato
 *
 * Gera logs estruturados com correlationId e traceId para rastreabilidade completa
 *
 * @module AuditLogger
 */

/**
 * Níveis de log suportados
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

/**
 * Array de níveis de log para iteração dinâmica
 */
const LOG_LEVELS: readonly LogLevel[] = ['INFO', 'WARN', 'ERROR', 'CRITICAL'] as const;

/**
 * Processos que podem gerar logs
 */
export type LogProcess = 'PISA' | 'PCC' | 'PPETD' | 'LOCKDOWN' | 'UPLOAD' | 'AUTH' | 'CAPTURE' | 'GENERAL' | 'ISOLATION' | 'FORENSIC' | 'PENDING' | 'PREVIEW' | 'VIDEO_CAPTURE' | 'INTERACTION' | 'SIDEPANEL' | 'OVERLAY' | 'CREDITS';

/**
 * Contexto adicional para logs estruturados
 * Permite passar informações contextuais que serão incluídas em cada entrada de log
 */
export interface LogContext {
  /** ID de correlação para rastreamento entre operações */
  correlationId?: string;
  /** ID da captura em andamento */
  captureId?: string;
  /** ID da aba do navegador */
  tabId?: number;
  /** Fase atual do pipeline */
  phase?: string;
  /** Duração da operação em milissegundos */
  duration?: number;
  /** Campos adicionais dinâmicos */
  [key: string]: unknown;
}

/**
 * Informações de erro formatadas para log
 */
export interface LogErrorInfo {
  message: string;
  name: string;
  stack?: string;
}

/**
 * Entrada de log estruturada
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  process: LogProcess;
  action: string;
  correlationId: string;
  traceId: string;
  elapsedMs: number;
  data?: Record<string, unknown>;
  error?: LogErrorInfo;
}

/**
 * Resumo do audit trail
 */
export interface AuditSummary {
  correlationId: string;
  traceId: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  entriesCount: number;
  countByLevel: Record<LogLevel, number>;
  countByProcess: Partial<Record<LogProcess, number>>;
}

/**
 * Opções de configuração do AuditLogger
 */
export interface AuditLoggerOptions {
  /** Habilita logs de nível INFO no console (padrão: false) */
  enableInfoLogs?: boolean;
  /** Chaves sensíveis adicionais para sanitização */
  additionalSensitiveKeys?: string[];
  /** Limite máximo de entradas armazenadas (padrão: 10000) */
  maxEntries?: number;
}

/**
 * Dados sensíveis que devem ser sanitizados
 * Baseado em padrões do Pino Logger para redaction
 * @see https://github.com/pinojs/pino/blob/main/docs/redaction.md
 */
const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'senha',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'cpf',
  'cnpj',
  'email',
  'telefone',
  'phone',
  'creditCard',
  'cartao',
] as const;

/**
 * Padrão para mascarar dados sensíveis
 * Seguindo convenção do Pino Logger
 * Exportado para uso em testes e validações
 */
export const MASK_PATTERN = '[REDACTED]';

/**
 * AuditLogger - Sistema de logs estruturados para auditoria
 *
 * Funcionalidades:
 * - Gera correlationId único (UUID) para cada operação
 * - Gera traceId compatível com AWS X-Ray
 * - Inclui timestamp ISO 8601 em todas as entradas
 * - Categoriza por nível e processo
 * - Sanitiza dados sensíveis automaticamente (padrão Pino Logger)
 * - Captura stack trace em erros
 * - Emite logs em formato JSON estruturado
 * - Suporta métricas de performance com startTimer()
 * - Suporta contexto persistente com withContext()
 * - Limite configurável de entradas para evitar memory leak
 * - Lookup O(1) para chaves sensíveis usando Set
 * 
 * @see https://github.com/pinojs/pino - Inspirado nas melhores práticas do Pino
 */
export class AuditLogger {
  private readonly correlationId: string;
  private readonly traceId: string;
  private startTime: number;
  private entries: LogEntry[] = [];
  private readonly persistentContext: LogContext;
  private readonly options: Required<AuditLoggerOptions>;
  
  /** Set para lookup O(1) de chaves sensíveis - padrão Pino Logger */
  private readonly sensitiveKeysSet: Set<string>;

  /**
   * Cria nova instância do AuditLogger
   *
   * @param correlationId - ID de correlação (opcional, gera automaticamente)
   * @param persistentContext - Contexto persistente que será incluído em todos os logs
   * @param traceId - ID de trace (opcional, gera automaticamente) - usado internamente por withContext
   * @param options - Opções de configuração do logger
   */
  constructor(
    correlationId?: string, 
    persistentContext: LogContext = {},
    traceId?: string,
    options: AuditLoggerOptions = {}
  ) {
    this.correlationId = correlationId ?? AuditLogger.generateCorrelationId();
    this.traceId = traceId ?? AuditLogger.generateTraceId();
    this.startTime = Date.now();
    this.persistentContext = persistentContext;
    
    // Configurações com valores padrão
    this.options = {
      enableInfoLogs: options.enableInfoLogs ?? false,
      additionalSensitiveKeys: options.additionalSensitiveKeys ?? [],
      maxEntries: options.maxEntries ?? 10000,
    };
    
    // Criar Set para lookup O(1) - padrão Pino Logger
    const allSensitiveKeys = [
      ...DEFAULT_SENSITIVE_KEYS,
      ...this.options.additionalSensitiveKeys,
    ];
    this.sensitiveKeysSet = new Set(allSensitiveKeys.map(k => k.toLowerCase()));
  }

  /**
   * Gera correlationId único (UUID v4)
   */
  static generateCorrelationId(): string {
    return crypto.randomUUID();
  }

  /**
   * Gera traceId compatível com AWS X-Ray
   * Formato: 1-{timestamp hex}-{random hex}
   */
  static generateTraceId(): string {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const randomBytes = new Uint8Array(12);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `1-${timestamp}-${randomHex}`;
  }

  /**
   * Obtém o correlationId atual
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Obtém o traceId atual
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Registra log de nível INFO
   */
  info(process: LogProcess, action: string, data?: Record<string, unknown>): void {
    this.log('INFO', process, action, data);
  }

  /**
   * Registra log de nível DEBUG (alias para INFO com enableInfoLogs)
   * Usado para logs de depuração que só aparecem quando enableInfoLogs está ativo
   */
  debug(process: LogProcess, action: string, data?: Record<string, unknown>): void {
    // Debug usa INFO internamente, controlado por enableInfoLogs
    this.log('INFO', process, action, data);
  }

  /**
   * Registra log de nível WARN
   */
  warn(process: LogProcess, action: string, data?: Record<string, unknown>): void {
    this.log('WARN', process, action, data);
  }

  /**
   * Registra log de nível ERROR
   */
  error(process: LogProcess, action: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('ERROR', process, action, data, error);
  }

  /**
   * Registra log de nível CRITICAL
   */
  critical(process: LogProcess, action: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('CRITICAL', process, action, data, error);
  }

  /**
   * Registra entrada de log
   * Mescla o contexto persistente com os dados fornecidos
   */
  private log(
    level: LogLevel,
    process: LogProcess,
    action: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    // Validação de entrada
    if (!action?.trim()) {
      console.warn('[AuditLogger] Action não pode ser vazia');
      return;
    }

    // Criar entrada de log usando método extraído
    const entry = this.createLogEntry(level, process, action, data, error);

    // Aplicar limite de entradas para evitar memory leak
    if (this.entries.length >= this.options.maxEntries) {
      this.entries.shift(); // Remove entrada mais antiga (FIFO)
    }

    this.entries.push(entry);

    // Emitir log no console em formato padronizado
    this.emitLog(entry);
  }

  /**
   * Cria uma entrada de log estruturada
   * Método extraído para melhor legibilidade e testabilidade
   * 
   * @param level - Nível do log
   * @param process - Processo que gerou o log
   * @param action - Ação sendo registrada
   * @param data - Dados adicionais
   * @param error - Erro opcional
   * @returns Entrada de log formatada
   */
  private createLogEntry(
    level: LogLevel,
    process: LogProcess,
    action: string,
    data?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    // Mesclar contexto persistente com dados fornecidos
    const mergedData = {
      ...this.persistentContext,
      ...data,
    };

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      process,
      action,
      correlationId: this.correlationId,
      traceId: this.traceId,
      elapsedMs: Date.now() - this.startTime,
    };

    // Só incluir data se houver dados após merge
    if (Object.keys(mergedData).length > 0) {
      entry.data = this.sanitizeData(mergedData);
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  /**
   * Formata informações de erro para inclusão no log
   * 
   * @param error - Erro a ser formatado
   * @returns Informações de erro estruturadas
   */
  private formatError(error: Error): LogErrorInfo {
    return {
      message: error.message,
      name: error.name,
      ...(error.stack && { stack: error.stack }),
    };
  }

  /**
   * Sanitiza dados removendo informações sensíveis
   */
  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    return this.sanitizeObject(data) as Record<string, unknown>;
  }

  /**
   * Verifica se uma chave é sensível usando lookup O(1)
   * Padrão inspirado no Pino Logger para redaction
   * 
   * @param key - Chave a ser verificada
   * @returns true se a chave contém termo sensível
   */
  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    for (const sensitiveKey of this.sensitiveKeysSet) {
      if (lowerKey.includes(sensitiveKey)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sanitiza objeto recursivamente
   * Usa lookup O(1) via Set para verificação de chaves sensíveis
   */
  private sanitizeObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const sanitized: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = MASK_PATTERN;
      } else {
        sanitized[key] = this.sanitizeObject(record[key]);
      }
    }

    return sanitized;
  }

  /**
   * Emite log no console em formato padronizado
   * Formato: [Module] Operation - {structured data}
   * 
   * Nota: Em Chrome Extensions, não existe process.env.
   * Usamos a opção enableInfoLogs configurável no construtor.
   * @see https://developer.chrome.com/docs/extensions/reference/api/storage
   */
  private emitLog(entry: LogEntry): void {
    // Formato padronizado: [Module] Operation - {data}
    const dataStr = entry.data ? JSON.stringify(entry.data) : '{}';
    const formattedMessage = `[${entry.process}] ${entry.action} - ${dataStr}`;

    switch (entry.level) {
      case 'INFO':
        // INFO logs são controlados pela opção enableInfoLogs
        // Usa console.warn com prefixo [INFO] pois console.info não é permitido pelo ESLint
        if (this.options.enableInfoLogs) {
          console.warn(`[INFO] ${formattedMessage}`);
        }
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'CRITICAL':
        console.error(`[CRITICAL] ${formattedMessage}`);
        break;
    }
  }

  /**
   * Obtém todas as entradas de log
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Gera audit trail completo
   */
  getAuditTrail(): LogEntry[] {
    return this.getEntries();
  }

  /**
   * Inicia um timer para medir duração de operações
   * 
   * Retorna uma função que, quando chamada, retorna o tempo decorrido em milissegundos
   * desde a criação do timer. Opcionalmente emite log de debug com a operação.
   * 
   * @param operation - Nome da operação sendo medida (usado para logging opcional)
   * @returns Função que retorna o tempo decorrido em milissegundos
   * 
   * @example
   * ```typescript
   * const stopTimer = logger.startTimer('processarChunk');
   * // ... operação demorada ...
   * const durationMs = stopTimer();
   * logger.info('CAPTURE', 'Chunk processado', { duration: durationMs });
   * ```
   */
  startTimer(operation: string): () => number {
    const startTime = performance.now();
    const enableDebug = this.options.enableInfoLogs;
    
    return (): number => {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);
      
      // Log de debug opcional para rastreamento de performance
      // Usa console.warn com prefixo [DEBUG] pois console.debug não é permitido pelo ESLint
      if (enableDebug) {
        console.warn(`[DEBUG][Timer] ${operation}: ${durationMs}ms`);
      }
      
      return durationMs;
    };
  }

  /**
   * Cria nova instância do AuditLogger com contexto persistente mesclado
   * 
   * O contexto fornecido será incluído automaticamente em todos os logs
   * gerados pela nova instância. Útil para adicionar informações contextuais
   * como captureId, tabId, phase, etc.
   * 
   * Padrão inspirado no child logger do Pino
   * @see https://github.com/pinojs/pino - Child loggers with context
   * 
   * @param context - Contexto adicional a ser mesclado com o contexto existente
   * @returns Nova instância de AuditLogger com contexto combinado
   * 
   * @example
   * ```typescript
   * const captureLogger = logger.withContext({ 
   *   captureId: 'abc-123', 
   *   tabId: 42,
   *   phase: 'COLLECTING' 
   * });
   * captureLogger.info('CAPTURE', 'Iniciando coleta'); // Inclui captureId, tabId, phase
   * ```
   */
  withContext(context: LogContext): AuditLogger {
    const mergedContext: LogContext = {
      ...this.persistentContext,
      ...context,
    };
    
    // Usar parâmetro traceId no construtor para preservar encapsulamento
    return new AuditLogger(
      this.correlationId, 
      mergedContext, 
      this.traceId,
      this.options
    );
  }

  /**
   * Obtém o contexto persistente atual
   * 
   * @returns Cópia do contexto persistente
   */
  getContext(): LogContext {
    return { ...this.persistentContext };
  }

  /**
   * Gera resumo do audit trail
   * Usa inicialização dinâmica para countByProcess evitando duplicação
   */
  getSummary(): AuditSummary {
    // Inicializar contadores dinamicamente - evita manutenção duplicada
    const countByLevel = Object.fromEntries(
      LOG_LEVELS.map(level => [level, 0])
    ) as Record<LogLevel, number>;

    // countByProcess é construído dinamicamente a partir das entradas
    const countByProcess: Partial<Record<LogProcess, number>> = {};

    for (const entry of this.entries) {
      countByLevel[entry.level]++;
      countByProcess[entry.process] = (countByProcess[entry.process] ?? 0) + 1;
    }

    const endTime = Date.now();
    const firstEntry = this.entries[0];
    const lastEntry = this.entries[this.entries.length - 1];

    return {
      correlationId: this.correlationId,
      traceId: this.traceId,
      startTime: firstEntry?.timestamp ?? new Date(this.startTime).toISOString(),
      endTime: lastEntry?.timestamp ?? new Date(endTime).toISOString(),
      totalDurationMs: endTime - this.startTime,
      entriesCount: this.entries.length,
      countByLevel,
      countByProcess,
    };
  }

  /**
   * Limpa todas as entradas de log
   */
  clear(): void {
    this.entries = [];
    this.startTime = Date.now();
  }

  /**
   * Cria novo logger filho com mesmo correlationId e contexto persistente
   * 
   * @returns Nova instância de AuditLogger com mesmo correlationId, traceId e contexto
   */
  createChild(): AuditLogger {
    return new AuditLogger(
      this.correlationId, 
      { ...this.persistentContext },
      this.traceId,
      this.options
    );
  }

  /**
   * Exporta todas as entradas em formato JSON
   * 
   * @returns String JSON formatada com todas as entradas
   */
  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Exporta todas as entradas em formato NDJSON (Newline Delimited JSON)
   * Útil para streaming e processamento linha a linha
   * 
   * @returns String NDJSON com uma entrada por linha
   */
  toNDJSON(): string {
    return this.entries.map(e => JSON.stringify(e)).join('\n');
  }

  /**
   * Obtém as opções de configuração atuais
   * 
   * @returns Cópia das opções de configuração
   */
  getOptions(): Required<AuditLoggerOptions> {
    return { ...this.options };
  }
}

export default AuditLogger;
