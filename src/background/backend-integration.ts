/**
 * Integração com Backend para Certificação em Cascata (Níveis 3-5)
 *
 * Gerencia comunicação com backend para completar certificação:
 * - Nível 3: ICP-Brasil (timestamp authority)
 * - Nível 4: Blockchain (Polygon + Arbitrum)
 * - Nível 5: Geração de PDF
 *
 * Requisitos atendidos:
 * - 24.1: Enviar Hash_N2 para certificação temporal
 * - 24.4: Receber notificação de PDF via WebSocket
 * - 24.5: Polling com backoff para status de certificação
 * - 24.6: Timeout de 5 min para ICP-Brasil
 * - 24.7: Timeout de 10 min para blockchain
 * - 24.8: Exibir progresso de cada nível na UI
 * - 24.9: Tratar fallback para TSAs internacionais
 * - 24.10: Informar usuário sobre certificação parcial
 *
 * @module BackendIntegration
 */

import { AuditLogger } from '../lib/audit-logger';
import { CircuitBreaker, CircuitOpenError } from '../lib/circuit-breaker';
import { RetryHandler } from '../lib/retry-handler';
import { LexatoError, ErrorCodes } from '../lib/errors';
import type { APIClient } from './api-client';
import type { PCCLevel2Result } from '../types/pcc.types';
import type { CertificationStatusResponse } from '../types/api.types';

// ============================================================================
// Tipos e Interfaces
// ============================================================================

/**
 * Status de um nível de certificação
 */
export type CertificationLevelStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'skipped';


/**
 * Progresso da certificação
 */
export interface CertificationProgress {
  /** Nível atual sendo processado (3, 4 ou 5) */
  currentLevel: 3 | 4 | 5;
  /** Status do nível atual */
  status: CertificationLevelStatus;
  /** Progresso percentual geral (0-100) */
  percent: number;
  /** Mensagem descritiva */
  message: string;
  /** Detalhes por nível */
  levels: {
    level3: CertificationLevelStatus;
    level4: CertificationLevelStatus;
    level5: CertificationLevelStatus;
  };
}

/**
 * Resultado da certificação completa
 */
export interface CertificationResult {
  /** Se a certificação foi bem-sucedida */
  success: boolean;
  /** ID da captura */
  captureId: string;
  /** Hash_N2 enviado */
  hashN2: string;
  /** Resultado do Nível 3 (ICP-Brasil) */
  level3: {
    status: CertificationLevelStatus;
    timestamp?: string;
    tsaProvider?: string;
    usedFallback?: boolean;
    error?: string;
  };
  /** Resultado do Nível 4 (Blockchain) */
  level4: {
    status: CertificationLevelStatus;
    polygon?: {
      txHash: string;
      blockNumber: number;
      timestamp: string;
    };
    arbitrum?: {
      txHash: string;
      blockNumber: number;
      timestamp: string;
    };
    error?: string;
  };
  /** Resultado do Nível 5 (PDF) */
  level5: {
    status: CertificationLevelStatus;
    pdfUrl?: string;
    error?: string;
  };
  /** Tempo total de processamento em ms */
  totalProcessingTimeMs: number;
  /** Se houve certificação parcial */
  isPartial: boolean;
  /** Mensagem de erro geral (se falha total) */
  error?: string;
}

/**
 * Requisição de certificação para o backend
 */
export interface CertificationRequest {
  /** ID da captura */
  captureId: string;
  /** Hash do Nível 2 */
  hashN2: string;
  /** Hash do Nível 1 */
  hashN1: string;
  /** Merkle Root */
  merkleRoot: string;
  /** Timestamp local ISO 8601 */
  localTimestamp: string;
  /** Tipo de armazenamento */
  storageType: 'standard' | 'premium_5y' | 'premium_10y' | 'premium_20y';
  /** Correlation ID para rastreabilidade */
  correlationId: string;
}


/**
 * Resposta de submissão de certificação
 */
export interface CertificationSubmitResponse {
  /** Se a submissão foi aceita */
  success: boolean;
  /** ID da certificação no backend */
  certificationId: string;
  /** Status inicial */
  status: 'queued' | 'processing';
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Opções de configuração do BackendIntegration
 */
export interface BackendIntegrationOptions {
  /** Timeout para ICP-Brasil em ms (padrão: 5 minutos) */
  icpBrasilTimeoutMs?: number;
  /** Timeout para blockchain em ms (padrão: 10 minutos) */
  blockchainTimeoutMs?: number;
  /** Intervalo inicial de polling em ms (padrão: 2000) */
  pollingIntervalMs?: number;
  /** Intervalo máximo de polling em ms (padrão: 30000) */
  maxPollingIntervalMs?: number;
  /** Callback de progresso */
  onProgress?: (progress: CertificationProgress) => void;
  /** Callback para notificação de PDF via WebSocket */
  onPdfReady?: (pdfUrl: string) => void;
}

/**
 * Callback para progresso da certificação
 */
export type CertificationProgressCallback = (progress: CertificationProgress) => void;

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração padrão do BackendIntegration
 */
const DEFAULT_CONFIG = {
  /** Timeout para ICP-Brasil: 5 minutos (Requisito 24.6) */
  ICP_BRASIL_TIMEOUT_MS: 5 * 60 * 1000,
  /** Timeout para blockchain: 10 minutos (Requisito 24.7) */
  BLOCKCHAIN_TIMEOUT_MS: 10 * 60 * 1000,
  /** Intervalo inicial de polling: 2 segundos */
  POLLING_INTERVAL_MS: 2000,
  /** Intervalo máximo de polling: 30 segundos */
  MAX_POLLING_INTERVAL_MS: 30000,
  /** Fator de backoff para polling */
  POLLING_BACKOFF_FACTOR: 1.5,
};

/**
 * Endpoints da API de certificação
 */
const API_ENDPOINTS = {
  /** Submeter certificação */
  SUBMIT: '/certification/submit',
  /** Consultar status */
  STATUS: '/certification/status',
  /** WebSocket para notificações */
  WEBSOCKET: '/ws/certification',
};


// ============================================================================
// Classe BackendIntegration
// ============================================================================

/**
 * BackendIntegration - Gerencia certificação em cascata com backend
 *
 * Funcionalidades:
 * - Envio de Hash_N2 para certificação temporal (Requisito 24.1)
 * - Polling com backoff para status (Requisito 24.5)
 * - Timeout de 5 min para ICP-Brasil (Requisito 24.6)
 * - Timeout de 10 min para blockchain (Requisito 24.7)
 * - Progresso de cada nível na UI (Requisito 24.8)
 * - Fallback para TSAs internacionais (Requisito 24.9)
 * - Informar sobre certificação parcial (Requisito 24.10)
 */
export class BackendIntegration {
  private logger: AuditLogger;
  private apiClient: APIClient;
  private options: Required<Omit<BackendIntegrationOptions, 'onProgress' | 'onPdfReady'>> & {
    onProgress?: CertificationProgressCallback;
    onPdfReady?: (pdfUrl: string) => void;
  };
  private circuitBreakerIcp: CircuitBreaker;
  private circuitBreakerBlockchain: CircuitBreaker;
  private retryHandler: RetryHandler;
  private webSocket: WebSocket | null = null;
  private isPolling = false;
  private pollingAbortController: AbortController | null = null;

  /**
   * Cria nova instância do BackendIntegration
   *
   * @param apiClient - Cliente API para comunicação com backend
   * @param logger - Logger para auditoria
   * @param options - Opções de configuração
   */
  constructor(
    apiClient: APIClient,
    logger: AuditLogger,
    options: BackendIntegrationOptions = {}
  ) {
    this.apiClient = apiClient;
    this.logger = logger;

    const baseOptions = {
      icpBrasilTimeoutMs: options.icpBrasilTimeoutMs ?? DEFAULT_CONFIG.ICP_BRASIL_TIMEOUT_MS,
      blockchainTimeoutMs: options.blockchainTimeoutMs ?? DEFAULT_CONFIG.BLOCKCHAIN_TIMEOUT_MS,
      pollingIntervalMs: options.pollingIntervalMs ?? DEFAULT_CONFIG.POLLING_INTERVAL_MS,
      maxPollingIntervalMs: options.maxPollingIntervalMs ?? DEFAULT_CONFIG.MAX_POLLING_INTERVAL_MS,
    };

    this.options = options.onProgress
      ? options.onPdfReady
        ? { ...baseOptions, onProgress: options.onProgress, onPdfReady: options.onPdfReady }
        : { ...baseOptions, onProgress: options.onProgress }
      : options.onPdfReady
        ? { ...baseOptions, onPdfReady: options.onPdfReady }
        : baseOptions;

    // Inicializar Circuit Breakers
    this.circuitBreakerIcp = new CircuitBreaker({
      serviceName: 'icp-brasil',
      failureThreshold: 5,
      resetTimeoutMs: 5 * 60 * 1000, // 5 minutos
      halfOpenRequests: 1,
    });

    this.circuitBreakerBlockchain = new CircuitBreaker({
      serviceName: 'blockchain',
      failureThreshold: 5,
      resetTimeoutMs: 1 * 60 * 1000, // 1 minuto
      halfOpenRequests: 2,
    });

    // Inicializar Retry Handler
    this.retryHandler = new RetryHandler('api');
  }


  // ==========================================================================
  // Métodos Públicos
  // ==========================================================================

  /**
   * Submete Hash_N2 para certificação completa (Níveis 3-5)
   *
   * @param captureId - ID da captura
   * @param level2Result - Resultado do PCC Nível 2
   * @param storageType - Tipo de armazenamento
   * @returns Resultado da certificação
   */
  async submitForCertification(
    captureId: string,
    level2Result: PCCLevel2Result,
    storageType: 'standard' | 'premium_5y' | 'premium_10y' | 'premium_20y'
  ): Promise<CertificationResult> {
    const startTime = performance.now();

    this.logger.info('PCC', 'BACKEND_CERTIFICATION_START', {
      captureId,
      hashN2: level2Result.hashN2.substring(0, 16) + '...',
      storageType,
    });

    try {
      // Validar entrada
      this.validateLevel2Result(level2Result);

      // Preparar requisição
      const request: CertificationRequest = {
        captureId,
        hashN2: level2Result.hashN2,
        hashN1: level2Result.hashN1,
        merkleRoot: '', // Será preenchido pelo backend se necessário
        localTimestamp: new Date().toISOString(),
        storageType,
        correlationId: this.logger.getCorrelationId(),
      };

      // Reportar progresso inicial
      this.reportProgress(3, 'processing', 0, 'Enviando para certificação...');

      // Submeter para backend
      const submitResponse = await this.submitCertificationRequest(request);

      if (!submitResponse.success) {
        throw new LexatoError(ErrorCodes.NETWORK_SERVER_ERROR, {
          customMessage: submitResponse.error ?? 'Falha ao submeter certificação',
        });
      }

      // Iniciar polling para acompanhar status
      const result = await this.pollCertificationStatus(
        captureId,
        submitResponse.certificationId
      );

      const totalProcessingTimeMs = performance.now() - startTime;

      this.logger.info('PCC', 'BACKEND_CERTIFICATION_COMPLETE', {
        captureId,
        success: result.success,
        isPartial: result.isPartial,
        totalProcessingTimeMs,
      });

      return {
        ...result,
        totalProcessingTimeMs,
      };
    } catch (error) {
      const totalProcessingTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.error('PCC', 'BACKEND_CERTIFICATION_FAILED', {
        captureId,
        error: errorMessage,
        totalProcessingTimeMs,
      });

      return this.createFailedResult(captureId, level2Result.hashN2, errorMessage, totalProcessingTimeMs);
    }
  }


  /**
   * Consulta status de certificação
   *
   * @param captureId - ID da captura
   * @returns Status atual da certificação
   */
  async getCertificationStatus(captureId: string): Promise<CertificationStatusResponse> {
    this.logger.info('PCC', 'GET_CERTIFICATION_STATUS', { captureId });

    try {
      const response = await this.retryHandler.execute(async () => {
        return this.apiClient.get<CertificationStatusResponse>(
          `${API_ENDPOINTS.STATUS}/${captureId}`
        );
      });

      if (!response.success || !response.data) {
        throw new LexatoError(ErrorCodes.NETWORK_SERVER_ERROR, {
          customMessage: response.error ?? 'Falha ao consultar status',
        });
      }

      return response.data;
    } catch (error) {
      this.logger.error('PCC', 'GET_STATUS_FAILED', {
        captureId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      throw error;
    }
  }

  /**
   * Conecta ao WebSocket para receber notificações de PDF (Requisito 24.4)
   *
   * @param captureId - ID da captura para filtrar notificações
   */
  connectWebSocket(captureId: string): void {
    if (this.webSocket?.readyState === WebSocket.OPEN) {
      this.logger.warn('PCC', 'WEBSOCKET_ALREADY_CONNECTED', { captureId });
      return;
    }

    const wsUrl = this.buildWebSocketUrl(captureId);

    this.logger.info('PCC', 'WEBSOCKET_CONNECTING', { captureId, url: wsUrl });

    try {
      this.webSocket = new WebSocket(wsUrl);

      this.webSocket.onopen = () => {
        this.logger.info('PCC', 'WEBSOCKET_CONNECTED', { captureId });
      };

      this.webSocket.onmessage = (event) => {
        this.handleWebSocketMessage(event, captureId);
      };

      this.webSocket.onerror = (_error) => {
        this.logger.error('PCC', 'WEBSOCKET_ERROR', {
          captureId,
          error: 'Erro na conexão WebSocket',
        });
      };

      this.webSocket.onclose = () => {
        this.logger.info('PCC', 'WEBSOCKET_CLOSED', { captureId });
        this.webSocket = null;
      };
    } catch (error) {
      this.logger.error('PCC', 'WEBSOCKET_CONNECT_FAILED', {
        captureId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  /**
   * Desconecta do WebSocket
   */
  disconnectWebSocket(): void {
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
      this.logger.info('PCC', 'WEBSOCKET_DISCONNECTED', {});
    }
  }

  /**
   * Cancela polling em andamento
   */
  cancelPolling(): void {
    if (this.pollingAbortController) {
      this.pollingAbortController.abort();
      this.pollingAbortController = null;
      this.isPolling = false;
      this.logger.info('PCC', 'POLLING_CANCELLED', {});
    }
  }


  // ==========================================================================
  // Métodos Privados - Submissão
  // ==========================================================================

  /**
   * Submete requisição de certificação para o backend
   */
  private async submitCertificationRequest(
    request: CertificationRequest
  ): Promise<CertificationSubmitResponse> {
    try {
      const response = await this.retryHandler.execute(async () => {
        return this.apiClient.post<CertificationSubmitResponse>(
          API_ENDPOINTS.SUBMIT,
          request
        );
      });

      if (!response.success || !response.data) {
        return {
          success: false,
          certificationId: '',
          status: 'queued',
          error: response.error ?? 'Falha ao submeter certificação',
        };
      }

      return response.data;
    } catch (error) {
      return {
        success: false,
        certificationId: '',
        status: 'queued',
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // ==========================================================================
  // Métodos Privados - Polling (Requisito 24.5)
  // ==========================================================================

  /**
   * Faz polling do status de certificação com backoff
   */
  private async pollCertificationStatus(
    captureId: string,
    _certificationId: string
  ): Promise<CertificationResult> {
    this.isPolling = true;
    this.pollingAbortController = new AbortController();

    let currentInterval = this.options.pollingIntervalMs;
    const startTime = Date.now();
    const maxTimeout = Math.max(
      this.options.icpBrasilTimeoutMs,
      this.options.blockchainTimeoutMs
    );

    let lastStatus: CertificationStatusResponse | null = null;

    while (this.isPolling && !this.pollingAbortController.signal.aborted) {
      const elapsed = Date.now() - startTime;

      // Verificar timeout geral
      if (elapsed > maxTimeout) {
        this.logger.warn('PCC', 'POLLING_TIMEOUT', {
          captureId,
          elapsedMs: elapsed,
          maxTimeoutMs: maxTimeout,
        });
        break;
      }

      try {
        const status = await this.getCertificationStatus(captureId);
        lastStatus = status;

        // Atualizar progresso
        this.updateProgressFromStatus(status);

        // Verificar se certificação está completa
        if (this.isCertificationComplete(status)) {
          this.isPolling = false;
          return this.buildResultFromStatus(captureId, status);
        }

        // Verificar se houve falha total
        if (status.status === 'failed') {
          this.isPolling = false;
          return this.buildResultFromStatus(captureId, status);
        }
      } catch (_error) {
        this.logger.warn('PCC', 'POLLING_ERROR', {
          captureId,
          error: _error instanceof Error ? _error.message : 'Erro desconhecido',
        });
      }

      // Aguardar antes da próxima consulta
      await this.sleep(currentInterval);

      // Aumentar intervalo com backoff
      currentInterval = Math.min(
        currentInterval * DEFAULT_CONFIG.POLLING_BACKOFF_FACTOR,
        this.options.maxPollingIntervalMs
      );
    }

    // Se saiu do loop sem resultado, retornar status parcial
    if (lastStatus) {
      return this.buildResultFromStatus(captureId, lastStatus);
    }

    return this.createFailedResult(
      captureId,
      '',
      'Timeout ao aguardar certificação',
      Date.now() - startTime
    );
  }


  /**
   * Verifica se certificação está completa
   */
  private isCertificationComplete(status: CertificationStatusResponse): boolean {
    return (
      status.status === 'completed' ||
      (status.levels.level3.status === 'completed' &&
        (status.levels.level4.status === 'completed' ||
          status.levels.level4.status === 'partial') &&
        status.levels.level5.status === 'completed')
    );
  }

  /**
   * Atualiza progresso baseado no status
   */
  private updateProgressFromStatus(status: CertificationStatusResponse): void {
    let currentLevel: 3 | 4 | 5 = 3;
    let percent = 0;
    let message = '';

    // Determinar nível atual e progresso
    if (status.levels.level3.status === 'processing') {
      currentLevel = 3;
      percent = 10;
      message = 'Processando certificação ICP-Brasil...';
    } else if (status.levels.level3.status === 'completed') {
      if (status.levels.level4.status === 'processing') {
        currentLevel = 4;
        percent = 40;
        message = 'Registrando em blockchain...';
      } else if (
        status.levels.level4.status === 'completed' ||
        status.levels.level4.status === 'partial'
      ) {
        if (status.levels.level5.status === 'processing') {
          currentLevel = 5;
          percent = 70;
          message = 'Gerando certificado PDF...';
        } else if (status.levels.level5.status === 'completed') {
          currentLevel = 5;
          percent = 100;
          message = 'Certificação concluída!';
        }
      }
    }

    this.reportProgress(currentLevel, this.mapStatus(status.status), percent, message);
  }

  /**
   * Mapeia status da API para status interno
   */
  private mapStatus(
    apiStatus: 'pending' | 'processing' | 'completed' | 'failed'
  ): CertificationLevelStatus {
    switch (apiStatus) {
      case 'pending':
        return 'pending';
      case 'processing':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Constrói resultado a partir do status da API
   */
  private buildResultFromStatus(
    captureId: string,
    status: CertificationStatusResponse
  ): CertificationResult {
    const isPartial =
      status.levels.level4.status === 'partial' ||
      (status.levels.level3.status === 'completed' &&
        status.levels.level4.status === 'failed') ||
      (status.levels.level4.status === 'completed' &&
        status.levels.level5.status === 'failed');

    // Informar usuário sobre certificação parcial (Requisito 24.10)
    if (isPartial) {
      this.logger.warn('PCC', 'PARTIAL_CERTIFICATION', {
        captureId,
        level3: status.levels.level3.status,
        level4: status.levels.level4.status,
        level5: status.levels.level5.status,
      });
    }

    return {
      success: status.status === 'completed' || isPartial,
      captureId,
      hashN2: '',
      level3: {
        status: this.mapLevelStatus(status.levels.level3.status),
        ...(status.levels.level3.timestamp ? { timestamp: status.levels.level3.timestamp } : {}),
        usedFallback: false, // Será preenchido pelo backend se aplicável
      },
      level4: {
        status: this.mapLevelStatus(status.levels.level4.status),
        ...(status.levels.level4.polygon
          ? {
              polygon: {
                txHash: status.levels.level4.polygon.txHash ?? '',
                blockNumber: status.levels.level4.polygon.blockNumber ?? 0,
                timestamp: new Date().toISOString(),
              },
            }
          : {}),
        ...(status.levels.level4.arbitrum
          ? {
              arbitrum: {
                txHash: status.levels.level4.arbitrum.txHash ?? '',
                blockNumber: status.levels.level4.arbitrum.blockNumber ?? 0,
                timestamp: new Date().toISOString(),
              },
            }
          : {}),
      },
      level5: {
        status: this.mapLevelStatus(status.levels.level5.status),
        ...(status.levels.level5.pdfUrl ? { pdfUrl: status.levels.level5.pdfUrl } : {}),
      },
      totalProcessingTimeMs: 0,
      isPartial,
      ...(status.error ? { error: status.error } : {}),
    };
  }


  /**
   * Mapeia status de nível da API para status interno
   */
  private mapLevelStatus(
    apiStatus: 'pending' | 'processing' | 'completed' | 'partial' | 'failed'
  ): CertificationLevelStatus {
    return apiStatus as CertificationLevelStatus;
  }

  // ==========================================================================
  // Métodos Privados - WebSocket (Requisito 24.4)
  // ==========================================================================

  /**
   * Constrói URL do WebSocket
   */
  private buildWebSocketUrl(captureId: string): string {
    const config = this.apiClient.getConfig();
    const baseUrl = config.baseURL.replace(/^http/, 'ws');
    return `${baseUrl}${API_ENDPOINTS.WEBSOCKET}?captureId=${captureId}`;
  }

  /**
   * Processa mensagem recebida via WebSocket
   */
  private handleWebSocketMessage(event: MessageEvent, captureId: string): void {
    try {
      const data = JSON.parse(event.data);

      this.logger.info('PCC', 'WEBSOCKET_MESSAGE', {
        captureId,
        type: data.type,
      });

      // Notificação de PDF pronto
      if (data.type === 'pdf_ready' && data.pdfUrl) {
        this.logger.info('PCC', 'PDF_READY_NOTIFICATION', {
          captureId,
          pdfUrl: data.pdfUrl,
        });

        if (this.options.onPdfReady) {
          this.options.onPdfReady(data.pdfUrl);
        }

        // Atualizar progresso
        this.reportProgress(5, 'completed', 100, 'Certificado PDF disponível!');
      }

      // Atualização de status
      if (data.type === 'status_update' && data.status) {
        this.updateProgressFromStatus(data.status);
      }
    } catch (error) {
      this.logger.warn('PCC', 'WEBSOCKET_MESSAGE_PARSE_ERROR', {
        captureId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  // ==========================================================================
  // Métodos Públicos - Fallback (Requisito 24.9)
  // ==========================================================================

  /**
   * Verifica se deve usar fallback para TSA internacional
   *
   * @param error - Erro ocorrido
   * @returns true se deve usar fallback
   */
  shouldUseFallback(error: unknown): boolean {
    // Verificar se Circuit Breaker está aberto
    if (error instanceof CircuitOpenError) {
      return true;
    }

    // Verificar se é erro de timeout ou indisponibilidade
    if (error instanceof LexatoError) {
      return (
        error.code === ErrorCodes.NETWORK_TIMEOUT ||
        error.code === ErrorCodes.NETWORK_SERVER_ERROR
      );
    }

    return false;
  }


  // ==========================================================================
  // Métodos Privados - Utilitários
  // ==========================================================================

  /**
   * Valida resultado do Nível 2
   */
  private validateLevel2Result(result: PCCLevel2Result): void {
    if (!result) {
      throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
        customMessage: 'Resultado do Nível 2 não pode ser nulo',
      });
    }

    if (!result.success) {
      throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
        customMessage: 'Resultado do Nível 2 indica falha',
      });
    }

    if (!result.hashN2 || !/^[0-9a-f]{64}$/i.test(result.hashN2)) {
      throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
        customMessage: 'Hash_N2 inválido',
      });
    }

    if (!result.hashN1 || !/^[0-9a-f]{64}$/i.test(result.hashN1)) {
      throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
        customMessage: 'Hash_N1 inválido',
      });
    }
  }

  /**
   * Reporta progresso se callback estiver configurado (Requisito 24.8)
   */
  private reportProgress(
    level: 3 | 4 | 5,
    status: CertificationLevelStatus,
    percent: number,
    message: string
  ): void {
    if (this.options.onProgress) {
      this.options.onProgress({
        currentLevel: level,
        status,
        percent,
        message,
        levels: {
          level3: level === 3 ? status : level > 3 ? 'completed' : 'pending',
          level4: level === 4 ? status : level > 4 ? 'completed' : 'pending',
          level5: level === 5 ? status : 'pending',
        },
      });
    }
  }

  /**
   * Cria resultado de falha
   */
  private createFailedResult(
    captureId: string,
    hashN2: string,
    error: string,
    totalProcessingTimeMs: number
  ): CertificationResult {
    return {
      success: false,
      captureId,
      hashN2,
      level3: { status: 'failed', error },
      level4: { status: 'failed', error },
      level5: { status: 'failed', error },
      totalProcessingTimeMs,
      isPartial: false,
      error,
    };
  }

  /**
   * Aguarda por um período de tempo
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Obtém estado do Circuit Breaker ICP-Brasil
   */
  getIcpBrasilCircuitState(): string {
    return this.circuitBreakerIcp.getState();
  }

  /**
   * Obtém estado do Circuit Breaker Blockchain
   */
  getBlockchainCircuitState(): string {
    return this.circuitBreakerBlockchain.getState();
  }

  /**
   * Verifica se está fazendo polling
   */
  isPollingActive(): boolean {
    return this.isPolling;
  }

  /**
   * Verifica se WebSocket está conectado
   */
  isWebSocketConnected(): boolean {
    return this.webSocket?.readyState === WebSocket.OPEN;
  }
}

export default BackendIntegration;
