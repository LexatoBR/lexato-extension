/**
 * Sistema de tratamento de erros para a extensão Lexato
 *
 * Define códigos de erro por categoria e mensagens em português
 * Adapta mensagens automaticamente para o navegador em uso.
 *
 * @module Errors
 */

import { getBrowserProtocolName } from './browser-detector';

/**
 * Categorias de erro
 */
export type ErrorCategory = 'NETWORK' | 'AUTH' | 'PERMISSION' | 'CAPTURE' | 'VALIDATION' | 'CRYPTO' | 'STORAGE' | 'ISOLATION' | 'UNKNOWN';

/**
 * Códigos de erro por categoria
 */
export const ErrorCodes = {
  // Erros de rede (1xxx)
  NETWORK_OFFLINE: 'ERR_1001',
  NETWORK_TIMEOUT: 'ERR_1002',
  NETWORK_CONNECTION_REFUSED: 'ERR_1003',
  NETWORK_DNS_FAILURE: 'ERR_1004',
  NETWORK_SERVER_ERROR: 'ERR_1005',
  NETWORK_RATE_LIMITED: 'ERR_1006',
  NETWORK_INTEGRATION_FAILURE: 'ERR_1007',

  // Erros de autenticação (2xxx)
  AUTH_INVALID_CREDENTIALS: 'ERR_2001',
  AUTH_TOKEN_EXPIRED: 'ERR_2002',
  AUTH_TOKEN_INVALID: 'ERR_2003',
  AUTH_SESSION_EXPIRED: 'ERR_2004',
  AUTH_MFA_REQUIRED: 'ERR_2005',
  AUTH_MFA_INVALID: 'ERR_2006',
  AUTH_INSUFFICIENT_CREDITS: 'ERR_2007',

  // Erros de permissão (3xxx)
  PERMISSION_DENIED: 'ERR_3001',
  PERMISSION_TAB_ACCESS: 'ERR_3002',
  PERMISSION_STORAGE_ACCESS: 'ERR_3003',
  PERMISSION_NOTIFICATION: 'ERR_3004',

  // Erros de captura (4xxx)
  CAPTURE_FAILED: 'ERR_4001',
  CAPTURE_TIMEOUT: 'ERR_4002',
  CAPTURE_PAGE_LOAD_FAILED: 'ERR_4003',
  CAPTURE_LOCKDOWN_FAILED: 'ERR_4004',
  CAPTURE_DEVTOOLS_DETECTED: 'ERR_4005',
  CAPTURE_DOM_MANIPULATION: 'ERR_4006',
  CAPTURE_VIDEO_FAILED: 'ERR_4007',
  CAPTURE_SCREENSHOT_FAILED: 'ERR_4008',

  // Erros de validação (5xxx)
  VALIDATION_INVALID_INPUT: 'ERR_5001',
  VALIDATION_INVALID_URL: 'ERR_5002',
  VALIDATION_INVALID_FORMAT: 'ERR_5003',
  VALIDATION_REQUIRED_FIELD: 'ERR_5004',
  VALIDATION_HASH_MISMATCH: 'ERR_5005',
  VALIDATION_SIGNATURE_INVALID: 'ERR_5006',

  // Erros de criptografia (6xxx)
  CRYPTO_HASH_FAILED: 'ERR_6001',
  CRYPTO_HASH_TIMEOUT: 'ERR_6002',
  CRYPTO_KEY_GENERATION_FAILED: 'ERR_6003',
  CRYPTO_SIGNATURE_FAILED: 'ERR_6004',
  CRYPTO_INVALID_INPUT: 'ERR_6005',

  // Erros de armazenamento (7xxx)
  STORAGE_QUOTA_EXCEEDED: 'ERR_7001',
  STORAGE_WRITE_FAILED: 'ERR_7002',
  STORAGE_READ_FAILED: 'ERR_7003',
  STORAGE_UPLOAD_FAILED: 'ERR_7004',
  STORAGE_PRESIGNED_URL_FAILED: 'ERR_7005',

  // Erros de isolamento de extensões (8xxx) - Requisito 8.4
  ISOLATION_PERMISSION_DENIED: 'ERR_8001',
  ISOLATION_LIST_FAILED: 'ERR_8002',
  ISOLATION_SNAPSHOT_FAILED: 'ERR_8003',
  ISOLATION_DISABLE_TIMEOUT: 'ERR_8004',
  ISOLATION_RESTORE_TIMEOUT: 'ERR_8005',
  ISOLATION_SNAPSHOT_CORRUPTED: 'ERR_8006',
  ISOLATION_VIOLATION_DETECTED: 'ERR_8007',
  ISOLATION_LEXATO_DISABLED: 'ERR_8008',
  ISOLATION_ALREADY_ACTIVE: 'ERR_8009',
  ISOLATION_NOT_ACTIVE: 'ERR_8010',
  ISOLATION_SNAPSHOT_NOT_FOUND: 'ERR_8011',

  // Erros de inicialização/serviço (9xxx)
  INITIALIZATION_ERROR: 'ERR_9001',
  SERVICE_UNAVAILABLE: 'ERR_9002',
  UNKNOWN_ERROR: 'ERR_9099',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Mensagens de erro em português
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Rede
  [ErrorCodes.NETWORK_OFFLINE]: 'Sem conexão com a internet. Verifique sua conexão e tente novamente.',
  [ErrorCodes.NETWORK_TIMEOUT]: 'A requisição demorou muito para responder. Tente novamente.',
  [ErrorCodes.NETWORK_CONNECTION_REFUSED]: 'Não foi possível conectar ao servidor. Tente novamente mais tarde.',
  [ErrorCodes.NETWORK_DNS_FAILURE]: 'Não foi possível resolver o endereço do servidor.',
  [ErrorCodes.NETWORK_SERVER_ERROR]: 'O servidor encontrou um erro. Tente novamente mais tarde.',
  [ErrorCodes.NETWORK_RATE_LIMITED]: 'Muitas requisições. Aguarde alguns minutos e tente novamente.',
  [ErrorCodes.NETWORK_INTEGRATION_FAILURE]: 'O serviço está temporariamente indisponível. A equipe técnica foi notificada.',

  // Autenticação
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Email ou senha incorretos.',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Sua sessão expirou. Faça login novamente.',
  [ErrorCodes.AUTH_TOKEN_INVALID]: 'Token de autenticação inválido. Faça login novamente.',
  [ErrorCodes.AUTH_SESSION_EXPIRED]: 'Sua sessão expirou. Faça login novamente.',
  [ErrorCodes.AUTH_MFA_REQUIRED]: 'Autenticação de dois fatores necessária.',
  [ErrorCodes.AUTH_MFA_INVALID]: 'Código de verificação inválido.',
  [ErrorCodes.AUTH_INSUFFICIENT_CREDITS]: 'Créditos insuficientes. Adquira mais créditos para continuar.',

  // Permissão
  [ErrorCodes.PERMISSION_DENIED]: 'Permissão negada para esta operação.',
  [ErrorCodes.PERMISSION_TAB_ACCESS]: 'Não foi possível acessar a aba atual. Verifique as permissões da extensão.',
  [ErrorCodes.PERMISSION_STORAGE_ACCESS]: 'Não foi possível acessar o armazenamento local.',
  [ErrorCodes.PERMISSION_NOTIFICATION]: 'Permissão para notificações não concedida.',

  // Captura
  [ErrorCodes.CAPTURE_FAILED]: 'Falha ao capturar a página. Tente novamente.',
  [ErrorCodes.CAPTURE_TIMEOUT]: 'A captura demorou muito. Tente novamente.',
  [ErrorCodes.CAPTURE_PAGE_LOAD_FAILED]: 'A página não carregou completamente. Tente novamente.',
  [ErrorCodes.CAPTURE_LOCKDOWN_FAILED]: 'Não foi possível ativar o modo de segurança.',
  [ErrorCodes.CAPTURE_DEVTOOLS_DETECTED]: 'DevTools detectado. Feche o DevTools para continuar a captura.',
  [ErrorCodes.CAPTURE_DOM_MANIPULATION]: 'Manipulação do DOM detectada durante a captura.',
  [ErrorCodes.CAPTURE_VIDEO_FAILED]: 'Falha ao gravar vídeo. Tente novamente.',
  [ErrorCodes.CAPTURE_SCREENSHOT_FAILED]: 'Falha ao capturar screenshot. Tente novamente.',

  // Validação
  [ErrorCodes.VALIDATION_INVALID_INPUT]: 'Dados de entrada inválidos.',
  [ErrorCodes.VALIDATION_INVALID_URL]: 'URL inválida.',
  [ErrorCodes.VALIDATION_INVALID_FORMAT]: 'Formato de dados inválido.',
  [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 'Campo obrigatório não preenchido.',
  [ErrorCodes.VALIDATION_HASH_MISMATCH]: 'Hash não corresponde ao esperado. Integridade comprometida.',
  [ErrorCodes.VALIDATION_SIGNATURE_INVALID]: 'Assinatura digital inválida.',

  // Criptografia
  [ErrorCodes.CRYPTO_HASH_FAILED]: 'Falha ao calcular hash.',
  [ErrorCodes.CRYPTO_HASH_TIMEOUT]: 'Cálculo de hash excedeu o tempo limite.',
  [ErrorCodes.CRYPTO_KEY_GENERATION_FAILED]: 'Falha ao gerar chaves criptográficas.',
  [ErrorCodes.CRYPTO_SIGNATURE_FAILED]: 'Falha ao gerar assinatura digital.',
  [ErrorCodes.CRYPTO_INVALID_INPUT]: 'Entrada inválida para operação criptográfica.',

  // Armazenamento
  [ErrorCodes.STORAGE_QUOTA_EXCEEDED]: 'Limite de armazenamento excedido.',
  [ErrorCodes.STORAGE_WRITE_FAILED]: 'Falha ao salvar dados.',
  [ErrorCodes.STORAGE_READ_FAILED]: 'Falha ao ler dados.',
  [ErrorCodes.STORAGE_UPLOAD_FAILED]: 'Falha ao fazer upload do arquivo. Tente novamente.',
  [ErrorCodes.STORAGE_PRESIGNED_URL_FAILED]: 'Falha ao obter URL de upload.',

  // Isolamento de extensões (Requisito 8.4)
  [ErrorCodes.ISOLATION_PERMISSION_DENIED]: 'Permissão para gerenciar extensões não disponível.',
  [ErrorCodes.ISOLATION_LIST_FAILED]: 'Falha ao listar extensões instaladas.',
  [ErrorCodes.ISOLATION_SNAPSHOT_FAILED]: 'Falha ao criar snapshot do estado das extensões.',
  [ErrorCodes.ISOLATION_DISABLE_TIMEOUT]: 'Tempo limite excedido ao desativar extensões.',
  [ErrorCodes.ISOLATION_RESTORE_TIMEOUT]: 'Tempo limite excedido ao restaurar extensões.',
  [ErrorCodes.ISOLATION_SNAPSHOT_CORRUPTED]: 'Snapshot de extensões corrompido ou modificado.',
  [ErrorCodes.ISOLATION_VIOLATION_DETECTED]: 'Violação de isolamento detectada durante captura.',
  [ErrorCodes.ISOLATION_LEXATO_DISABLED]: 'Extensão Lexato foi desativada. Erro crítico.',
  [ErrorCodes.ISOLATION_ALREADY_ACTIVE]: 'Isolamento de extensões já está ativo.',
  [ErrorCodes.ISOLATION_NOT_ACTIVE]: 'Isolamento de extensões não está ativo.',
  [ErrorCodes.ISOLATION_SNAPSHOT_NOT_FOUND]: 'Snapshot de extensões não encontrado.',

  // Inicialização e serviço
  [ErrorCodes.INITIALIZATION_ERROR]: 'Falha ao inicializar o serviço.',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Serviço temporariamente indisponível.',
  [ErrorCodes.UNKNOWN_ERROR]: 'Ocorreu um erro inesperado. Tente novamente.',
};

/**
 * Obtém sugestão de recuperação para um código de erro
 * Adapta sugestões dinâmicas baseadas no navegador detectado
 *
 * @param code - Código do erro
 * @returns Sugestão de recuperação ou undefined
 */
export function getRecoverySuggestion(code: ErrorCode): string | undefined {
  const browserName = getBrowserProtocolName();
  
  // Sugestões dinâmicas baseadas no navegador
  const dynamicSuggestions: Partial<Record<ErrorCode, string>> = {
    [ErrorCodes.ISOLATION_LEXATO_DISABLED]: `Reative a extensão Lexato nas configurações do ${browserName}.`,
  };
  
  // Retorna sugestão dinâmica se existir, senão a estática
  return dynamicSuggestions[code] ?? StaticRecoverySuggestions[code];
}

/**
 * Sugestões de recuperação estáticas por código de erro
 */
const StaticRecoverySuggestions: Partial<Record<ErrorCode, string>> = {
  [ErrorCodes.NETWORK_OFFLINE]: 'Verifique sua conexão com a internet.',
  [ErrorCodes.NETWORK_TIMEOUT]: 'Verifique sua conexão e tente novamente.',
  [ErrorCodes.NETWORK_RATE_LIMITED]: 'Aguarde alguns minutos antes de tentar novamente.',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Clique em "Entrar" para fazer login novamente.',
  [ErrorCodes.AUTH_INSUFFICIENT_CREDITS]: 'Acesse o painel para adquirir mais créditos.',
  [ErrorCodes.CAPTURE_DEVTOOLS_DETECTED]: 'Feche o DevTools (F12) e tente novamente.',
  [ErrorCodes.STORAGE_UPLOAD_FAILED]: 'Verifique sua conexão e tente novamente.',
  // Sugestões de recuperação para erros de isolamento (Requisito 8.4)
  [ErrorCodes.ISOLATION_PERMISSION_DENIED]: 'Verifique se a extensão tem permissão "management" habilitada.',
  [ErrorCodes.ISOLATION_LIST_FAILED]: 'Tente novamente. Se persistir, reinicie o navegador.',
  [ErrorCodes.ISOLATION_SNAPSHOT_FAILED]: 'Tente novamente. Se persistir, reinicie o navegador.',
  [ErrorCodes.ISOLATION_DISABLE_TIMEOUT]: 'Algumas extensões podem não ter sido desativadas. Tente novamente.',
  [ErrorCodes.ISOLATION_RESTORE_TIMEOUT]: 'Clique em "Restaurar Extensões" no popup para tentar novamente.',
  [ErrorCodes.ISOLATION_SNAPSHOT_CORRUPTED]: 'Clique em "Restaurar Extensões" para restaurar manualmente.',
  [ErrorCodes.ISOLATION_VIOLATION_DETECTED]: 'Uma extensão foi reativada durante a captura. Reinicie a captura.',
};

/**
 * Sugestões de recuperação exportadas para compatibilidade
 * @deprecated Use getRecoverySuggestion() para sugestões dinâmicas baseadas no navegador
 */
export const RecoverySuggestions = StaticRecoverySuggestions;


/**
 * Erro base da aplicação Lexato
 */
export class LexatoError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly userMessage: string;
  public readonly recoverySuggestion?: string | undefined;
  public readonly originalError?: Error | undefined;
  public readonly timestamp: string;
  public readonly correlationId?: string | undefined;

  constructor(
    code: ErrorCode,
    options?: {
      originalError?: Error | undefined;
      correlationId?: string | undefined;
      customMessage?: string | undefined;
    }
  ) {
    const userMessage = options?.customMessage ?? ErrorMessages[code];
    super(userMessage);

    this.name = 'LexatoError';
    this.code = code;
    this.category = LexatoError.getCategory(code);
    this.userMessage = userMessage;
    this.recoverySuggestion = getRecoverySuggestion(code);
    this.originalError = options?.originalError;
    this.timestamp = new Date().toISOString();
    this.correlationId = options?.correlationId;

    // Manter stack trace original se disponível
    if (options?.originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.originalError.stack}`;
    }
  }

  /**
   * Determina categoria do erro pelo código
   */
  static getCategory(code: ErrorCode): ErrorCategory {
    const prefix = code.substring(4, 5);

    switch (prefix) {
      case '1':
        return 'NETWORK';
      case '2':
        return 'AUTH';
      case '3':
        return 'PERMISSION';
      case '4':
        return 'CAPTURE';
      case '5':
        return 'VALIDATION';
      case '6':
        return 'CRYPTO';
      case '7':
        return 'STORAGE';
      case '8':
        return 'ISOLATION';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Converte para objeto JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      recoverySuggestion: this.recoverySuggestion,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
          }
        : undefined,
    };
  }
}

/**
 * Cria erro a partir de erro genérico
 *
 * @param error - Erro original
 * @param correlationId - ID de correlação opcional
 * @returns LexatoError apropriado
 */
export function fromError(error: unknown, correlationId?: string): LexatoError {
  if (error instanceof LexatoError) {
    return error;
  }

  const originalError = error instanceof Error ? error : new Error(String(error));
  const code = detectErrorCode(originalError);

  return new LexatoError(code, { originalError, correlationId });
}

/**
 * Detecta código de erro apropriado a partir de erro genérico
 */
function detectErrorCode(error: Error): ErrorCode {
  const message = error.message.toLowerCase();

  // Erros de rede
  if (message.includes('network') || message.includes('fetch failed')) {
    return ErrorCodes.NETWORK_OFFLINE;
  }
  if (message.includes('timeout')) {
    return ErrorCodes.NETWORK_TIMEOUT;
  }
  if (message.includes('econnrefused') || message.includes('connection refused')) {
    return ErrorCodes.NETWORK_CONNECTION_REFUSED;
  }
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many')) {
    return ErrorCodes.NETWORK_RATE_LIMITED;
  }
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return ErrorCodes.NETWORK_SERVER_ERROR;
  }

  // Erros de autenticação
  if (message.includes('401') || message.includes('unauthorized')) {
    return ErrorCodes.AUTH_TOKEN_INVALID;
  }
  if (message.includes('403') || message.includes('forbidden')) {
    return ErrorCodes.PERMISSION_DENIED;
  }
  if (message.includes('402') || message.includes('payment') || message.includes('credits')) {
    return ErrorCodes.AUTH_INSUFFICIENT_CREDITS;
  }
  if (message.includes('expired')) {
    return ErrorCodes.AUTH_TOKEN_EXPIRED;
  }

  // Erros de hash
  if (message.includes('hash')) {
    return ErrorCodes.CRYPTO_HASH_FAILED;
  }

  // Erros de validação
  if (message.includes('invalid') || message.includes('validation')) {
    return ErrorCodes.VALIDATION_INVALID_INPUT;
  }

  return ErrorCodes.UNKNOWN_ERROR;
}

/**
 * Verifica se erro é de rede
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof LexatoError) {
    return error.category === 'NETWORK';
  }
  return false;
}

/**
 * Verifica se erro é de autenticação
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof LexatoError) {
    return error.category === 'AUTH';
  }
  return false;
}

/**
 * Verifica se erro é retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof LexatoError) {
    const retryableCodes: ErrorCode[] = [
      ErrorCodes.NETWORK_OFFLINE,
      ErrorCodes.NETWORK_TIMEOUT,
      ErrorCodes.NETWORK_CONNECTION_REFUSED,
      ErrorCodes.NETWORK_SERVER_ERROR,
      ErrorCodes.NETWORK_RATE_LIMITED,
      ErrorCodes.STORAGE_UPLOAD_FAILED,
    ];
    return retryableCodes.includes(error.code);
  }
  return false;
}

export default LexatoError;
