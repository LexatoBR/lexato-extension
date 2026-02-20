/**
 * Tratador de Erros do Pipeline de Evidências
 *
 * Converte exceções em PipelineError estruturado com código,
 * fase e flag de recuperabilidade. Emite eventos de erro para
 * listeners registrados.
 *
 * Códigos de erro por fase:
 * - Captura: CAPTURE_TAB_ACCESS_DENIED, CAPTURE_URL_BLOCKED, CAPTURE_TIMEOUT, etc.
 * - Timestamp: TIMESTAMP_SERPRO_ERROR, TIMESTAMP_INVALID_RESPONSE
 * - Upload: UPLOAD_PRESIGNED_URL_FAILED, UPLOAD_S3_ERROR, UPLOAD_TIMEOUT, etc.
 * - Preview: PREVIEW_EXPIRED, PREVIEW_DISCARDED
 * - Blockchain: BLOCKCHAIN_POLYGON_FAILED, BLOCKCHAIN_ARBITRUM_FAILED, etc.
 * - Geral: AUTH_REQUIRED, INSUFFICIENT_CREDITS, NETWORK_ERROR, UNKNOWN_ERROR
 *
 * @module ErrorHandler
 */

import type {
  PipelineError,
  PipelineErrorCallback,
  PipelineErrorCode,
  PipelineProgress,
} from './types';

/**
 * Mapeamento de códigos de erro para flag de recuperabilidade
 *
 * Erros recuperáveis permitem retry da fase atual.
 * Erros não recuperáveis são fatais e requerem ação do usuário.
 */
const RECOVERABLE_CODES: Set<PipelineErrorCode> = new Set([
  // Captura - recuperáveis
  'CAPTURE_TIMEOUT',
  'CAPTURE_ISOLATION_FAILED',

  // Timestamp - recuperáveis
  'TIMESTAMP_SERPRO_ERROR',

  // Upload - recuperáveis
  'UPLOAD_PRESIGNED_URL_FAILED',
  'UPLOAD_S3_ERROR',
  'UPLOAD_TIMEOUT',

  // Blockchain - recuperáveis
  'BLOCKCHAIN_ARBITRUM_FAILED',

  // Geral - recuperáveis
  'NETWORK_ERROR',
]);

/**
 * Traduções de mensagens de erro para PT-BR
 *
 * Mapeamento de padrões em inglês para mensagens em português.
 */
const MESSAGE_TRANSLATIONS: Array<{ pattern: RegExp; translation: string }> = [
  // Erros de acesso e permissão
  { pattern: /access denied/i, translation: 'Acesso negado à aba' },
  { pattern: /permission denied/i, translation: 'Permissão negada' },
  { pattern: /not allowed/i, translation: 'Operação não permitida' },

  // Erros de timeout
  { pattern: /timeout/i, translation: 'Tempo limite excedido' },
  { pattern: /timed out/i, translation: 'Tempo limite excedido' },

  // Erros de rede
  { pattern: /network error/i, translation: 'Erro de conexão' },
  { pattern: /fetch failed/i, translation: 'Falha na requisição' },
  { pattern: /failed to fetch/i, translation: 'Falha na requisição' },
  { pattern: /connection refused/i, translation: 'Conexão recusada' },
  { pattern: /connection reset/i, translation: 'Conexão interrompida' },
  { pattern: /no internet/i, translation: 'Sem conexão com a internet' },
  { pattern: /offline/i, translation: 'Dispositivo offline' },

  // Erros de URL
  { pattern: /blocked/i, translation: 'URL bloqueada' },
  { pattern: /chrome:\/\//i, translation: 'Não é possível capturar páginas do Chrome' },
  { pattern: /invalid url/i, translation: 'URL inválida' },

  // Erros de autenticação
  { pattern: /unauthorized/i, translation: 'Não autorizado' },
  { pattern: /401/i, translation: 'Autenticação necessária' },
  { pattern: /403/i, translation: 'Acesso proibido' },
  { pattern: /auth.*required/i, translation: 'Autenticação necessária' },
  { pattern: /token.*expired/i, translation: 'Sessão expirada' },
  { pattern: /session.*expired/i, translation: 'Sessão expirada' },

  // Erros de créditos
  { pattern: /credit/i, translation: 'Créditos insuficientes' },
  { pattern: /saldo/i, translation: 'Saldo insuficiente' },
  { pattern: /insufficient.*funds/i, translation: 'Saldo insuficiente' },

  // Erros de upload
  { pattern: /presigned/i, translation: 'Falha ao obter URL de upload' },
  { pattern: /s3.*error/i, translation: 'Erro no armazenamento' },
  { pattern: /upload.*failed/i, translation: 'Falha no upload' },
  { pattern: /integrity/i, translation: 'Falha na verificação de integridade' },
  { pattern: /hash.*mismatch/i, translation: 'Hash não corresponde ao esperado' },
  { pattern: /checksum/i, translation: 'Erro de verificação de integridade' },

  // Erros de timestamp
  { pattern: /serpro/i, translation: 'Erro no serviço de carimbo de tempo' },
  { pattern: /timestamp.*invalid/i, translation: 'Resposta de timestamp inválida' },
  { pattern: /tsa.*error/i, translation: 'Erro na autoridade de timestamp' },

  // Erros de blockchain
  { pattern: /polygon.*failed/i, translation: 'Falha no registro Polygon' },
  { pattern: /arbitrum.*failed/i, translation: 'Falha no registro Arbitrum' },
  { pattern: /blockchain.*failed/i, translation: 'Falha no registro blockchain' },
  { pattern: /transaction.*failed/i, translation: 'Transação falhou' },
  { pattern: /gas.*insufficient/i, translation: 'Gas insuficiente para transação' },

  // Erros de mídia
  { pattern: /media.*error/i, translation: 'Erro na captura de mídia' },
  { pattern: /mediarecorder/i, translation: 'Erro no gravador de mídia' },
  { pattern: /stream.*error/i, translation: 'Erro no stream de mídia' },

  // Erros de isolamento
  { pattern: /isolation.*failed/i, translation: 'Falha ao isolar extensões' },
  { pattern: /extension.*disable/i, translation: 'Falha ao desativar extensões' },

  // Erros de preview
  { pattern: /expired/i, translation: 'Tempo de aprovação expirado' },
  { pattern: /discarded/i, translation: 'Evidência descartada pelo usuário' },

  // Erros genéricos
  { pattern: /internal.*error/i, translation: 'Erro interno do servidor' },
  { pattern: /500/i, translation: 'Erro interno do servidor' },
  { pattern: /502/i, translation: 'Servidor indisponível' },
  { pattern: /503/i, translation: 'Serviço temporariamente indisponível' },
  { pattern: /504/i, translation: 'Tempo limite do servidor excedido' },
];

/**
 * Mensagens padrão para cada código de erro (em PT-BR)
 */
const DEFAULT_ERROR_MESSAGES: Record<PipelineErrorCode, string> = {
  // Erros de captura
  CAPTURE_TAB_ACCESS_DENIED: 'Acesso negado à aba. Verifique as permissões da extensão.',
  CAPTURE_URL_BLOCKED: 'Esta URL não pode ser capturada (páginas do Chrome são bloqueadas).',
  CAPTURE_TIMEOUT: 'Tempo limite de captura excedido. Tente novamente.',
  CAPTURE_ISOLATION_FAILED: 'Falha ao isolar extensões durante a captura.',
  CAPTURE_MEDIA_ERROR: 'Erro na captura de mídia. Verifique as permissões.',

  // Erros de timestamp
  TIMESTAMP_SERPRO_ERROR: 'Erro no serviço de carimbo de tempo SERPRO. Tentando novamente...',
  TIMESTAMP_INVALID_RESPONSE: 'Resposta inválida do serviço de timestamp.',

  // Erros de upload
  UPLOAD_PRESIGNED_URL_FAILED: 'Falha ao obter URL de upload. Tente novamente.',
  UPLOAD_S3_ERROR: 'Erro no armazenamento. Tente novamente.',
  UPLOAD_TIMEOUT: 'Tempo limite de upload excedido. Tente novamente.',
  UPLOAD_INTEGRITY_MISMATCH: 'Falha na verificação de integridade do arquivo.',

  // Erros de preview
  PREVIEW_EXPIRED: 'O tempo de aprovação expirou (24 horas). Realize nova captura.',
  PREVIEW_DISCARDED: 'Evidência descartada pelo usuário.',

  // Erros de blockchain
  BLOCKCHAIN_POLYGON_FAILED: 'Falha no registro Polygon. Certificação não pode continuar.',
  BLOCKCHAIN_ARBITRUM_FAILED: 'Falha no registro Arbitrum. Registro parcial concluído.',
  BLOCKCHAIN_BOTH_FAILED: 'Falha em ambas as redes blockchain.',

  // Erros gerais
  AUTH_REQUIRED: 'Autenticação necessária. Faça login novamente.',
  INSUFFICIENT_CREDITS: 'Créditos insuficientes. Adquira mais créditos para continuar.',
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet e tente novamente.',
  UNKNOWN_ERROR: 'Erro desconhecido. Tente novamente ou contate o suporte.',
};

/**
 * Tratador de erros do pipeline de evidências
 *
 * Responsável por:
 * - Converter exceções em PipelineError estruturado
 * - Inferir código de erro baseado na mensagem e fase
 * - Determinar se erro é recuperável (permite retry)
 * - Traduzir mensagens para PT-BR
 * - Emitir eventos de erro para listeners
 *
 * @example
 * ```typescript
 * const errorHandler = new ErrorHandler();
 *
 * // Registrar listener
 * const unsubscribe = errorHandler.subscribe((error) => {
 *   console.error(`[${error.phase}] ${error.code}: ${error.message}`);
 *   if (error.recoverable) {
 *     console.log('Erro recuperável - retry possível');
 *   }
 * });
 *
 * // Processar erro
 * try {
 *   await captureEvidence();
 * } catch (error) {
 *   const pipelineError = errorHandler.handle(error, 'capture');
 *   // pipelineError contém código, mensagem em PT-BR, fase e flag recoverable
 * }
 *
 * // Remover listener
 * unsubscribe();
 * ```
 */
export class ErrorHandler {
  /**
   * Set de listeners registrados para eventos de erro
   */
  private readonly listeners: Set<PipelineErrorCallback> = new Set();

  /**
   * Cria uma nova instância do ErrorHandler
   */
  constructor() {
    // Inicialização simples - sem estado persistente
  }

  /**
   * Processa erro e emite evento para listeners
   *
   * Converte qualquer tipo de erro em PipelineError estruturado,
   * infere o código de erro, determina recuperabilidade e
   * traduz a mensagem para PT-BR.
   *
   * @param error - Erro a ser processado (Error, string ou unknown)
   * @param phase - Fase do pipeline onde o erro ocorreu
   * @returns PipelineError estruturado
   *
   * @example
   * ```typescript
   * try {
   *   await uploadToS3(data);
   * } catch (error) {
   *   const pipelineError = errorHandler.handle(error, 'upload');
   *   // { code: 'UPLOAD_S3_ERROR', message: 'Erro no armazenamento...', ... }
   * }
   * ```
   */
  handle(error: unknown, phase: PipelineProgress['phaseName']): PipelineError {
    const pipelineError = this.toPipelineError(error, phase);

    // Emitir evento para listeners
    this.emit(pipelineError);

    // Log do erro para debugging
    console.error(`[ErrorHandler] ${phase}/${pipelineError.code}: ${pipelineError.message}`, {
      recoverable: pipelineError.recoverable,
      details: pipelineError.details,
    });

    return pipelineError;
  }

  /**
   * Registra um listener para eventos de erro
   *
   * @param callback - Função a ser chamada em cada erro
   * @returns Função para remover o listener
   *
   * @example
   * ```typescript
   * const unsubscribe = errorHandler.subscribe((error) => {
   *   showErrorToast(error.message);
   * });
   *
   * // Mais tarde...
   * unsubscribe();
   * ```
   */
  subscribe(callback: PipelineErrorCallback): () => void {
    this.listeners.add(callback);

    // Retorna função para remover listener
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Remove todos os listeners
   */
  unsubscribeAll(): void {
    this.listeners.clear();
  }

  /**
   * Verifica se um código de erro é recuperável
   *
   * Erros recuperáveis permitem retry da fase atual.
   * Erros não recuperáveis são fatais e requerem ação do usuário.
   *
   * @param code - Código de erro a verificar
   * @returns true se o erro permite retry, false caso contrário
   *
   * @example
   * ```typescript
   * if (errorHandler.isRecoverable('NETWORK_ERROR')) {
   *   // Pode tentar novamente
   *   await retry(operation);
   * } else {
   *   // Erro fatal - notificar usuário
   *   showFatalError();
   * }
   * ```
   */
  isRecoverable(code: PipelineErrorCode): boolean {
    return RECOVERABLE_CODES.has(code);
  }

  /**
   * Infere o código de erro baseado na mensagem e fase
   *
   * Analisa a mensagem de erro e a fase atual para determinar
   * o código de erro mais apropriado.
   *
   * @param message - Mensagem de erro original
   * @param phase - Fase do pipeline onde o erro ocorreu
   * @returns Código de erro inferido
   */
  inferErrorCode(message: string, phase: PipelineProgress['phaseName']): PipelineErrorCode {
    const lowerMessage = message.toLowerCase();

    // Erros de captura
    if (phase === 'capture') {
      if (lowerMessage.includes('access denied') || lowerMessage.includes('permission denied')) {
        return 'CAPTURE_TAB_ACCESS_DENIED';
      }
      if (lowerMessage.includes('blocked') || lowerMessage.includes('chrome://') || lowerMessage.includes('chrome-extension://')) {
        return 'CAPTURE_URL_BLOCKED';
      }
      if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
        return 'CAPTURE_TIMEOUT';
      }
      if (lowerMessage.includes('isolation') || lowerMessage.includes('extension')) {
        return 'CAPTURE_ISOLATION_FAILED';
      }
      if (lowerMessage.includes('media') || lowerMessage.includes('stream') || lowerMessage.includes('recorder')) {
        return 'CAPTURE_MEDIA_ERROR';
      }
    }

    // Erros de timestamp
    if (phase === 'timestamp') {
      if (lowerMessage.includes('serpro') || lowerMessage.includes('tsa')) {
        return 'TIMESTAMP_SERPRO_ERROR';
      }
      if (lowerMessage.includes('invalid') || lowerMessage.includes('response')) {
        return 'TIMESTAMP_INVALID_RESPONSE';
      }
    }

    // Erros de upload
    if (phase === 'upload') {
      if (lowerMessage.includes('presigned') || lowerMessage.includes('signed url')) {
        return 'UPLOAD_PRESIGNED_URL_FAILED';
      }
      if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
        return 'UPLOAD_TIMEOUT';
      }
      if (lowerMessage.includes('integrity') || lowerMessage.includes('hash') || lowerMessage.includes('checksum')) {
        return 'UPLOAD_INTEGRITY_MISMATCH';
      }
      if (lowerMessage.includes('s3') || lowerMessage.includes('aws') || lowerMessage.includes('storage')) {
        return 'UPLOAD_S3_ERROR';
      }
    }

    // Erros de preview
    if (phase === 'preview') {
      if (lowerMessage.includes('expired') || lowerMessage.includes('timeout')) {
        return 'PREVIEW_EXPIRED';
      }
      if (lowerMessage.includes('discarded') || lowerMessage.includes('cancelled') || lowerMessage.includes('canceled')) {
        return 'PREVIEW_DISCARDED';
      }
    }

    // Erros de blockchain
    if (phase === 'blockchain') {
      if (lowerMessage.includes('polygon')) {
        return 'BLOCKCHAIN_POLYGON_FAILED';
      }
      if (lowerMessage.includes('arbitrum')) {
        return 'BLOCKCHAIN_ARBITRUM_FAILED';
      }
      if (lowerMessage.includes('both') || (lowerMessage.includes('polygon') && lowerMessage.includes('arbitrum'))) {
        return 'BLOCKCHAIN_BOTH_FAILED';
      }
    }

    // Erros gerais (independente da fase)
    if (lowerMessage.includes('auth') || lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
      return 'AUTH_REQUIRED';
    }
    if (lowerMessage.includes('credit') || lowerMessage.includes('saldo') || lowerMessage.includes('insufficient')) {
      return 'INSUFFICIENT_CREDITS';
    }
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('offline')
    ) {
      return 'NETWORK_ERROR';
    }

    // Fallback para erro desconhecido
    return 'UNKNOWN_ERROR';
  }

  /**
   * Converte qualquer erro em PipelineError estruturado
   *
   * @param error - Erro original (Error, string ou unknown)
   * @param phase - Fase do pipeline onde o erro ocorreu
   * @returns PipelineError estruturado
   */
  private toPipelineError(error: unknown, phase: PipelineProgress['phaseName']): PipelineError {
    // Se já é um PipelineError, retorna diretamente
    if (this.isPipelineError(error)) {
      return error;
    }

    // Extrair mensagem do erro
    const originalMessage = this.extractMessage(error);

    // Inferir código de erro
    const code = this.inferErrorCode(originalMessage, phase);

    // Determinar se é recuperável
    const recoverable = this.isRecoverable(code);

    // Traduzir mensagem para PT-BR
    const message = this.translateMessage(originalMessage, code);

    // Construir detalhes adicionais
    const details: Record<string, unknown> = {
      originalMessage,
    };

    // Adicionar informações extras se disponíveis
    if (error instanceof Error) {
      if (error.name && error.name !== 'Error') {
        details['errorName'] = error.name;
      }
      if ('code' in error) {
        details['errorCode'] = (error as Error & { code?: string }).code;
      }
      if ('status' in error) {
        details['httpStatus'] = (error as Error & { status?: number }).status;
      }
    }

    // Construir PipelineError
    const pipelineError: PipelineError = {
      code,
      message,
      phase,
      recoverable,
      details,
    };

    // Adicionar stack trace apenas em desenvolvimento
    if (error instanceof Error && error.stack && typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'production') {
      pipelineError.stack = error.stack;
    }

    return pipelineError;
  }

  /**
   * Verifica se um objeto é um PipelineError válido
   *
   * @param error - Objeto a verificar
   * @returns true se é um PipelineError válido
   */
  private isPipelineError(error: unknown): error is PipelineError {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const obj = error as Record<string, unknown>;
    return (
      typeof obj['code'] === 'string' &&
      typeof obj['message'] === 'string' &&
      typeof obj['phase'] === 'string' &&
      typeof obj['recoverable'] === 'boolean'
    );
  }

  /**
   * Extrai mensagem de qualquer tipo de erro
   *
   * @param error - Erro original
   * @returns Mensagem extraída
   */
  private extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'object' && error !== null) {
      const obj = error as Record<string, unknown>;
      if (typeof obj['message'] === 'string') {
        return obj['message'];
      }
      if (typeof obj['error'] === 'string') {
        return obj['error'];
      }
    }
    return String(error);
  }

  /**
   * Traduz mensagem de erro para PT-BR
   *
   * Tenta encontrar uma tradução baseada em padrões conhecidos.
   * Se não encontrar, usa a mensagem padrão do código de erro.
   *
   * @param message - Mensagem original
   * @param code - Código de erro inferido
   * @returns Mensagem traduzida em PT-BR
   */
  private translateMessage(message: string, code: PipelineErrorCode): string {
    // Tentar encontrar tradução por padrão
    for (const { pattern, translation } of MESSAGE_TRANSLATIONS) {
      if (pattern.test(message)) {
        return translation;
      }
    }

    // Usar mensagem padrão do código de erro
    const defaultMessage = DEFAULT_ERROR_MESSAGES[code];
    if (defaultMessage) {
      return defaultMessage;
    }

    // Fallback: retornar mensagem original se não houver tradução
    return message;
  }

  /**
   * Emite evento de erro para todos os listeners
   *
   * @param error - Erro a emitir
   */
  private emit(error: PipelineError): void {
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[ErrorHandler] Erro em listener:', listenerError);
      }
    }
  }
}

/**
 * Instância singleton do ErrorHandler
 *
 * Use esta instância para compartilhar o handler entre módulos.
 *
 * @example
 * ```typescript
 * import { errorHandler } from './error-handler';
 *
 * const error = errorHandler.handle(new Error('Network error'), 'upload');
 * ```
 */
export const errorHandler = new ErrorHandler();
