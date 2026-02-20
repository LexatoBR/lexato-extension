/**
 * Cliente HTTP para comunicação com a API do backend Lexato
 *
 * Implementa axios com interceptors para autenticação, retry e tratamento de erros.
 *
 * IMPORTANTE: Este módulo é usado no service worker da extensão Chrome.
 * O axios por padrão usa o adapter 'xhr' que acessa document.cookie,
 * causando erro "document is not defined" em service workers.
 * Solução: usar adapter 'fetch' que é compatível com service workers.
 *
 * CORREÇÃO CRÍTICA (2026-01-18):
 * O Axios v1.7+ avalia `platform.hasStandardBrowserEnv` em tempo de carregamento
 * do módulo, o que pode causar acesso a `document` antes que a configuração
 * do adapter seja aplicada. A solução é:
 * 1. Importar service-worker-polyfills.ts PRIMEIRO no service-worker.ts
 * 2. O polyfill define um stub mínimo para `document.cookie`
 * 3. Configurar o axios com adapter 'fetch' e withXSRFToken: false
 *
 * @see https://github.com/axios/axios/pull/5146 - Fetch adapter PR
 * @see https://github.com/axios/axios#request-config - Documentação oficial
 *
 * Requisitos atendidos:
 * - 12.1: Axios com base URL configurável por ambiente
 * - 12.2: Authorization header com Bearer token
 * - 12.3: X-Correlation-Id em todas as requisições
 * - 12.4: Interceptor para refresh automático em 401
 * - 12.5: Timeout de 30 segundos
 * - 12.6: Mensagens de erro em português
 * - 12.8: Tratamento de erro 402 (créditos insuficientes)
 *
 * @module APIClient
 */

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { AuditLogger } from '../lib/audit-logger';
import { LexatoError, ErrorCodes, fromError, type ErrorCode } from '../lib/errors';
import { captureException, addBreadcrumb } from '../lib/sentry';
import type { AuthTokens } from '../types/auth.types';
import { isServiceWorker } from '../lib/context-utils';

// ============================================================================
// Tipos e Interfaces
// ============================================================================

/**
 * Configuração do cliente API
 */
export interface APIClientConfig {
  /** URL base da API */
  baseURL: string;
  /** Timeout em milissegundos (padrão: 30000) */
  timeout?: number;
  /** Função para obter tokens de autenticação */
  getTokens: () => Promise<AuthTokens | null>;
  /** Função para fazer refresh do token */
  refreshToken: () => Promise<boolean>;
  /** Função para obter correlationId */
  getCorrelationId?: () => string;
  /** Logger para auditoria */
  logger?: AuditLogger;
}

/**
 * Resposta padrão da API
 */
export interface APIResponse<T = unknown> {
  /** Se a operação foi bem-sucedida */
  success: boolean;
  /** Dados da resposta */
  data?: T;
  /** Mensagem de erro */
  error?: string;
  /** Código de erro */
  errorCode?: string;
  /** Metadados adicionais */
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

/**
 * Opções de requisição
 */
export interface RequestOptions {
  /** Se deve incluir token de autenticação */
  authenticated?: boolean;
  /** Timeout customizado para esta requisição */
  timeout?: number;
  /** CorrelationId customizado */
  correlationId?: string;
  /** Headers adicionais */
  headers?: Record<string, string>;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração padrão do cliente
 */
const DEFAULT_CONFIG = {
  /** Timeout padrão de 30 segundos (Requisito 12.5) */
  TIMEOUT_MS: 30000,
  /** Header de correlação */
  CORRELATION_HEADER: 'X-Correlation-Id',
  /** Header de autorização */
  AUTH_HEADER: 'Authorization',
  /** Prefixo do token */
  TOKEN_PREFIX: 'Bearer',
};

/**
 * Mapeamento de status HTTP para códigos de erro (Strategy Pattern)
 * Facilita manutenção e extensão de novos códigos
 */
const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  400: ErrorCodes.VALIDATION_INVALID_INPUT,
  401: ErrorCodes.AUTH_TOKEN_INVALID,
  402: ErrorCodes.AUTH_INSUFFICIENT_CREDITS,
  403: ErrorCodes.PERMISSION_DENIED,
  404: ErrorCodes.VALIDATION_INVALID_INPUT,
  429: ErrorCodes.NETWORK_RATE_LIMITED,
  500: ErrorCodes.NETWORK_SERVER_ERROR,
  502: ErrorCodes.NETWORK_SERVER_ERROR,
  503: ErrorCodes.NETWORK_SERVER_ERROR,
  504: ErrorCodes.NETWORK_SERVER_ERROR,
};

/**
 * URLs base por ambiente
 *
 * @deprecated Use getApiUrl() de @config/environment para novas implementações
 */
export const API_BASE_URLS = {
  development: 'http://127.0.0.1:3000',
  // Staging: configure via VITE_API_BASE_URL no .env.local (veja .env.example)
  staging: (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3000',
  production: 'https://api.lexato.com.br',
} as const;

/**
 * Obtém URL base baseado no ambiente
 * @deprecated Use getApiUrl() de @config/environment para novas implementações
 */
export function getBaseURL(env?: string): string {
  const environment = env ?? (typeof process !== 'undefined' ? process.env?.['NODE_ENV'] : 'production');
  return API_BASE_URLS[environment as keyof typeof API_BASE_URLS] ?? API_BASE_URLS.production;
}

// ============================================================================
// Classe APIClient
// ============================================================================

/**
 * Cliente HTTP para comunicação com a API Lexato
 *
 * Funcionalidades:
 * - Axios com base URL configurável (Requisito 12.1)
 * - Authorization header automático (Requisito 12.2)
 * - X-Correlation-Id em todas as requisições (Requisito 12.3)
 * - Refresh automático de token em 401 (Requisito 12.4)
 * - Timeout de 30 segundos (Requisito 12.5)
 * - Mensagens de erro em português (Requisito 12.6)
 * - Tratamento de erro 402 (Requisito 12.8)
 */
export class APIClient {
  private client: AxiosInstance;
  private config: APIClientConfig;
  private logger: AuditLogger;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Cria nova instância do APIClient
   *
   * @param config - Configuração do cliente
   */
  constructor(config: APIClientConfig) {
    this.config = config;
    this.logger = config.logger ?? new AuditLogger();

    // Detectar se estamos em um Service Worker
    // Service Workers não têm acesso ao DOM e o axios por padrão:
    // 1. Usa adapter 'xhr' que pode acessar document.cookie
    // 2. Tenta ler cookies XSRF via document.cookie
    // Ambos causam erro "document is not defined"
    //
    // Solução baseada na documentação oficial do axios:
    // - Usar adapter 'fetch' que é compatível com Service Workers
    // - Desabilitar XSRF token handling (withXSRFToken: false)
    // @see https://github.com/axios/axios#request-config
    const isInServiceWorker = isServiceWorker();

    // Configuração base do axios
    const axiosConfig: Parameters<typeof axios.create>[0] = {
      baseURL: config.baseURL,
      timeout: config.timeout ?? DEFAULT_CONFIG.TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    // Em Service Workers, configurar para evitar acesso ao DOM
    if (isInServiceWorker) {
      // Usar adapter 'fetch' que não depende de DOM
      axiosConfig.adapter = 'fetch';
      // Desabilitar XSRF token handling - o axios tenta ler document.cookie
      axiosConfig.withXSRFToken = false;
    }

    // Criar instância do axios (Requisito 12.1)
    this.client = axios.create(axiosConfig);

    // Configurar interceptors
    this.setupRequestInterceptor();
    this.setupResponseInterceptor();
  }

  // ==========================================================================
  // Interceptors
  // ==========================================================================

  /**
   * Verifica se uma string tem formato JWT válido
   * JWT válido tem 3 partes separadas por ponto e começa com "eyJ"
   * @param token - String a ser validada
   * @returns true se parece ser um JWT válido
   */
  private isValidJwtFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // JWT tem exatamente 3 partes separadas por ponto
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Obter header com verificação de tipo
    const header = parts[0];
    if (!header?.startsWith('eyJ')) {
      return false;
    }

    // Cada parte deve ter conteúdo
    if (parts.some(part => !part || part.length === 0)) {
      return false;
    }

    // Token JWT típico tem mais de 100 caracteres
    if (token.length < 100) {
      return false;
    }

    return true;
  }

  /**
   * Obtém token de autenticação preferencial
   * Prioriza idToken para API Gateway Cognito Authorizer
   * @returns Token de autenticação ou null
   */
  private async getAuthToken(): Promise<string | null> {
    const tokens = await this.config.getTokens();

    // DEBUG: Log detalhado para diagnóstico de autenticação
    if (tokens) {
      const hasIdToken = !!tokens.idToken && tokens.idToken.length > 0;
      const hasAccessToken = !!tokens.accessToken && tokens.accessToken.length > 0;
      const tokenUsed = hasIdToken ? 'idToken' : (hasAccessToken ? 'accessToken' : 'none');

      this.logger.info('AUTH', 'GET_AUTH_TOKEN_DEBUG', {
        hasIdToken,
        hasAccessToken,
        tokenUsed,
        idTokenLength: tokens.idToken?.length ?? 0,
        accessTokenLength: tokens.accessToken?.length ?? 0,
        idTokenPrefix: tokens.idToken?.substring(0, 20) ?? 'N/A',
        accessTokenPrefix: tokens.accessToken?.substring(0, 20) ?? 'N/A',
      });

      // Validar formato JWT antes de usar
      const preferredToken = tokens.idToken ?? tokens.accessToken;
      if (preferredToken && !this.isValidJwtFormat(preferredToken)) {
        this.logger.error('AUTH', 'INVALID_JWT_FORMAT', {
          tokenLength: preferredToken.length,
          tokenPrefix: preferredToken.substring(0, 30),
          partsCount: preferredToken.split('.').length,
          startsWithEyJ: preferredToken.startsWith('eyJ'),
        });
        // Não retornar token inválido - evita erro 403
        return null;
      }
    } else {
      this.logger.warn('AUTH', 'GET_AUTH_TOKEN_NO_TOKENS', {});
    }

    return tokens?.idToken ?? tokens?.accessToken ?? null;
  }

  /**
   * Configura interceptor de requisição
   * - Adiciona Authorization header (Requisito 12.2)
   * - Adiciona X-Correlation-Id (Requisito 12.3)
   */
  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Adicionar X-Correlation-Id (Requisito 12.3)
        const correlationId = this.config.getCorrelationId?.() ?? crypto.randomUUID();
        config.headers.set(DEFAULT_CONFIG.CORRELATION_HEADER, correlationId);

        // Adicionar Authorization header se autenticado (Requisito 12.2)
        // NOTA: API Gateway Cognito Authorizer requer ID Token, não Access Token
        const skipAuth = config.headers.get('X-Skip-Auth') === 'true';
        if (!skipAuth) {
          const authToken = await this.getAuthToken();

          if (authToken) {
            // Limpar token de possíveis caracteres problemáticos
            // (quebras de linha, espaços extras, etc.)
            const cleanToken = authToken.trim().replace(/[\r\n]/g, '');
            
            // Montar header Authorization no formato "Bearer <token>"
            const authHeaderValue = `${DEFAULT_CONFIG.TOKEN_PREFIX} ${cleanToken}`;
            
            addBreadcrumb({
              category: 'api-client',
              message: 'Authorization header configurado',
              level: 'info',
              data: {
                url: config.url,
                tokenLength: cleanToken.length,
                hasNewlines: authToken !== cleanToken,
              },
            });
            
            // Usar atribuição direta em vez de set() para maior compatibilidade
            // @see https://github.com/axios/axios/blob/v1.x/README.md
            config.headers['Authorization'] = authHeaderValue;
          } else {
            this.logger.warn('AUTH', 'NO_AUTH_TOKEN_AVAILABLE', {});
          }
        }

        // Remover header interno
        config.headers.delete('X-Skip-Auth');

        // Log da requisição em desenvolvimento
        this.logRequest(config, correlationId);

        return config;
      },
      (error: AxiosError) => {
        this.logger.error('GENERAL', 'REQUEST_INTERCEPTOR_ERROR', {
          error: error.message,
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Configura interceptor de resposta
   * - Refresh automático em 401 (Requisito 12.4)
   * - Tratamento de erro 402 (Requisito 12.8)
   * - Mensagens de erro em português (Requisito 12.6)
   */
  private setupResponseInterceptor(): void {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        this.logResponse(response);
        return response;
      },
      async (error: AxiosError) => {
        // Log de erro estruturado via AuditLogger
        if (error.response) {
          this.logger.error('GENERAL', 'API_REQUEST_FAILED', {
            url: error.config?.url,
            status: error.response.status,
            errorData: error.response.data,
          });
        }
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _skipAuth?: boolean };

        // IMPORTANTE: Não tentar refresh em rotas públicas (authenticated: false)
        // Rotas públicas como /auth/login podem retornar 401 para MFA ou credenciais inválidas
        // e não devem disparar refresh de token
        const isPublicRoute = originalRequest._skipAuth === true;

        // Tratamento de erro 401 - Refresh automático (Requisito 12.4)
        // Só tenta refresh em rotas autenticadas
        if (error.response?.status === 401 && !originalRequest._retry && !isPublicRoute) {
          originalRequest._retry = true;

          try {
            const refreshed = await this.handleTokenRefresh();

            if (refreshed) {
              // Obter novo token e refazer requisição
              const authToken = await this.getAuthToken();
              if (authToken) {
                // Limpar token de possíveis caracteres problemáticos
                const cleanToken = authToken.trim().replace(/[\r\n]/g, '');
                const authHeaderValue = `${DEFAULT_CONFIG.TOKEN_PREFIX} ${cleanToken}`;
                
                // Usar atribuição direta para maior compatibilidade
                originalRequest.headers['Authorization'] = authHeaderValue;
              }
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            this.logger.error('AUTH', 'TOKEN_REFRESH_FAILED_IN_INTERCEPTOR', {
              error: refreshError instanceof Error ? refreshError.message : 'Erro desconhecido',
            });
          }

          // Refresh falhou - retornar erro de autenticação
          return Promise.reject(
            new LexatoError(ErrorCodes.AUTH_TOKEN_EXPIRED, {
              originalError: error,
            })
          );
        }

        // Tratamento de erro 402 - Créditos insuficientes (Requisito 12.8)
        if (error.response?.status === 402) {
          return Promise.reject(
            new LexatoError(ErrorCodes.AUTH_INSUFFICIENT_CREDITS, {
              originalError: error,
            })
          );
        }

        // Outros erros - converter para LexatoError (Requisito 12.6)
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Gerencia refresh de token com deduplicação
   */
  private async handleTokenRefresh(): Promise<boolean> {
    // Se já está fazendo refresh, aguardar o resultado
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.config.refreshToken();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  // ==========================================================================
  // Métodos HTTP
  // ==========================================================================

  /**
   * Realiza requisição GET
   *
   * @param url - URL do endpoint
   * @param options - Opções da requisição
   * @returns Resposta da API
   */
  async get<T>(url: string, options?: RequestOptions): Promise<APIResponse<T>> {
    try {
      const config = this.buildRequestConfig(options);
      const response = await this.client.get<APIResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Realiza requisição POST
   *
   * @param url - URL do endpoint
   * @param data - Dados a enviar
   * @param options - Opções da requisição
   * @returns Resposta da API
   */
  async post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<APIResponse<T>> {
    try {
      const config = this.buildRequestConfig(options);
      const response = await this.client.post<APIResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Realiza requisição PUT
   *
   * @param url - URL do endpoint
   * @param data - Dados a enviar
   * @param options - Opções da requisição
   * @returns Resposta da API
   */
  async put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<APIResponse<T>> {
    try {
      const config = this.buildRequestConfig(options);
      const response = await this.client.put<APIResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Realiza requisição PATCH
   *
   * @param url - URL do endpoint
   * @param data - Dados a enviar
   * @param options - Opções da requisição
   * @returns Resposta da API
   */
  async patch<T>(url: string, data?: unknown, options?: RequestOptions): Promise<APIResponse<T>> {
    try {
      const config = this.buildRequestConfig(options);
      const response = await this.client.patch<APIResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Realiza requisição DELETE
   *
   * @param url - URL do endpoint
   * @param options - Opções da requisição
   * @returns Resposta da API
   */
  async delete<T>(url: string, options?: RequestOptions): Promise<APIResponse<T>> {
    try {
      const config = this.buildRequestConfig(options);
      const response = await this.client.delete<APIResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ==========================================================================
  // Métodos Auxiliares
  // ==========================================================================

  /**
   * Constrói configuração da requisição
   * Marca requisições públicas com _skipAuth para evitar refresh automático em 401
   */
  private buildRequestConfig(options?: RequestOptions): AxiosRequestConfig & { _skipAuth?: boolean } {
    const config: AxiosRequestConfig & { _skipAuth?: boolean } = {};

    if (options?.timeout) {
      config.timeout = options.timeout;
    }

    if (options?.headers) {
      config.headers = { ...options.headers };
    }

    if (options?.authenticated === false) {
      config.headers = {
        ...config.headers,
        'X-Skip-Auth': 'true',
      };
      // Marca requisição como pública para o interceptor de resposta
      // Isso evita tentativa de refresh em 401 de rotas públicas (ex: login, MFA)
      config._skipAuth = true;
    }

    if (options?.correlationId) {
      config.headers = {
        ...config.headers,
        [DEFAULT_CONFIG.CORRELATION_HEADER]: options.correlationId,
      };
    }

    return config;
  }

  /**
   * Converte erro para LexatoError com mensagem em português (Requisito 12.6)
   * Usa mapeamento HTTP_STATUS_TO_ERROR_CODE para simplificar manutenção
   */
  private handleError(error: unknown): LexatoError {
    let lexatoError: LexatoError;

    if (error instanceof LexatoError) {
      lexatoError = error;
    } else if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;
      const status = axiosError.response?.status;
      const serverMessage = axiosError.response?.data?.error ?? axiosError.response?.data?.message;

      // Determinar código de erro
      const errorCode = this.mapAxiosErrorToCode(axiosError, status);

      lexatoError = new LexatoError(errorCode, {
        originalError: axiosError,
        customMessage: serverMessage,
      });
    } else {
      lexatoError = fromError(error);
    }

    // Capturar erro no Sentry (exceto erros de autenticação esperados)
    const skipSentryForCodes: ErrorCode[] = [
      ErrorCodes.AUTH_TOKEN_EXPIRED,
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      ErrorCodes.AUTH_SESSION_EXPIRED,
    ];

    if (!skipSentryForCodes.includes(lexatoError.code)) {
      captureException(lexatoError, {
        context: 'api_request',
        errorCode: lexatoError.code,
        url: axios.isAxiosError(error) ? error.config?.url : undefined,
        method: axios.isAxiosError(error) ? error.config?.method : undefined,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      });
    }

    return lexatoError;
  }

  /**
   * Mapeia erro Axios para código de erro interno
   * Separa lógica de mapeamento para facilitar testes e manutenção
   *
   * NOTA: ERR_NETWORK pode ocorrer por várias razões além de falta de internet:
   * - CSP bloqueando a requisição (connect-src)
   * - CORS bloqueando a requisição
   * - Servidor não acessível
   * - Certificate errors
   *
   * Usamos navigator.onLine como heurística adicional para diferenciar.
   */
  private mapAxiosErrorToCode(axiosError: AxiosError<{ type?: string; message?: string }>, status?: number): ErrorCode {
    // Erro de rede (sem resposta do servidor)
    if (!axiosError.response) {
      if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
        return ErrorCodes.NETWORK_TIMEOUT;
      }
      if (axiosError.code === 'ERR_NETWORK') {
        // Verificar se realmente é falta de internet
        // navigator.onLine existe tanto em browser quanto em Service Worker
        const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        // Se o browser diz que está online, provavelmente é outro problema
        // (CORS, CSP, servidor down, etc.) - usar CONNECTION_REFUSED
        if (isOnline) {
          this.logger.warn('GENERAL', 'ERR_NETWORK_BUT_ONLINE', {
            message: 'ERR_NETWORK recebido mas navigator.onLine é true. Provável CSP, CORS ou servidor inacessível.',
            originalMessage: axiosError.message,
          });
          return ErrorCodes.NETWORK_CONNECTION_REFUSED;
        }

        return ErrorCodes.NETWORK_OFFLINE;
      }
      return ErrorCodes.NETWORK_CONNECTION_REFUSED;
    }

    // Detectar INTEGRATION_FAILURE do API Gateway
    // Isso indica que a Lambda não está deployada ou tem erro de inicialização
    const responseType = axiosError.response.data?.type;
    if (status === 500 && responseType === 'INTEGRATION_FAILURE') {
      this.logger.error('GENERAL', 'INTEGRATION_FAILURE_DETECTED', {
        message: 'API Gateway retornou INTEGRATION_FAILURE. Lambda pode não estar deployada.',
        url: axiosError.config?.url,
        status,
        responseType,
      });
      return ErrorCodes.NETWORK_INTEGRATION_FAILURE;
    }

    // Usar mapeamento de status HTTP
    return status ? (HTTP_STATUS_TO_ERROR_CODE[status] ?? ErrorCodes.UNKNOWN_ERROR) : ErrorCodes.UNKNOWN_ERROR;
  }

  /**
   * Log de requisição (apenas em desenvolvimento)
   */
  private logRequest(config: InternalAxiosRequestConfig, correlationId: string): void {
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') {
      this.logger.info('GENERAL', 'API_REQUEST', {
        method: config.method?.toUpperCase(),
        url: config.url,
        correlationId,
      });
    }
  }

  /**
   * Log de resposta (apenas em desenvolvimento)
   */
  private logResponse(response: AxiosResponse): void {
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'development') {
      const correlationId = response.config.headers?.[DEFAULT_CONFIG.CORRELATION_HEADER] ?? 'unknown';
      this.logger.info('GENERAL', 'API_RESPONSE', {
        status: response.status,
        url: response.config.url,
        correlationId,
      });
    }
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Obtém instância do axios para uso direto (casos especiais)
   */
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): APIClientConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory e Singleton
// ============================================================================

let apiClientInstance: APIClient | null = null;

/**
 * Cria ou obtém instância singleton do APIClient
 *
 * @param config - Configuração do cliente (necessária na primeira chamada)
 * @returns Instância do APIClient
 */
export function getAPIClient(config?: APIClientConfig): APIClient {
  if (!apiClientInstance && !config) {
    throw new Error('APIClient não inicializado. Forneça a configuração na primeira chamada.');
  }

  if (config) {
    apiClientInstance = new APIClient(config);
  }

  if (!apiClientInstance) {
    throw new Error('APIClient não inicializado.');
  }

  return apiClientInstance;
}

/**
 * Reseta instância singleton (útil para testes)
 */
export function resetAPIClient(): void {
  apiClientInstance = null;
}

export default APIClient;

// ============================================================================
// Tipos de resposta das Supabase Edge Functions
// ============================================================================

/**
 * Resposta padrao das Edge Functions do Supabase
 */
export interface EdgeFunctionResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Resposta da funcao profile-get
 */
export interface ProfileGetResponse {
  id: string;
  email: string;
  fullName: string;
  document: string;
  phone: string;
  profession: string;
  avatarUrl: string | null;
  teamId: string | null;
  role: 'user' | 'admin' | 'staff';
  createdAt: string;
}

/**
 * Resposta da funcao credits-balance
 */
export interface CreditsBalanceResponse {
  totalBalance: number;
  breakdown: {
    subscription: number;
    oneTime: number;
    bonus: number;
    enterprise: number;
  };
  monthlyAllowance: number | null;
  lowBalanceAlert: boolean;
  expiringCredits: Array<{
    amount: number;
    expiresAt: string;
    daysRemaining: number;
    type: string;
  }>;
}

/**
 * Resposta da funcao evidence-list
 */
export interface EvidenceListResponse {
  evidences: Array<{
    id: string;
    type: string;
    url: string;
    title: string;
    status: string;
    hash: string;
    createdAt: string;
    certifiedAt: string | null;
    storageExpiresAt: string;
  }>;
  total: number;
  page: number;
  limit: number;
}

/**
 * Parametros para listagem de evidencias
 */
export interface EvidenceListParams {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Resposta da funcao notification-list
 */
export interface NotificationListResponse {
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
  unreadCount: number;
}

/**
 * Parametros para listagem de notificacoes
 */
export interface NotificationListParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

/**
 * Acoes de gerenciamento de equipe
 */
export type TeamManageAction = 'invite' | 'remove' | 'list';

/**
 * Parametros para gerenciamento de equipe
 */
export interface TeamManageParams {
  action: TeamManageAction;
  email?: string;
  memberId?: string;
  page?: number;
  limit?: number;
}

/**
 * Resposta da funcao team-manage
 */
export interface TeamManageResponse {
  success: boolean;
  members?: Array<{
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    joinedAt: string;
  }>;
  total?: number;
  message?: string;
}

/**
 * Parametros para verificacao de evidencia (publico)
 */
export interface VerifyCheckParams {
  /** UUID da evidencia ou codigo autenticado de 8 caracteres */
  identifier: string;
}

/**
 * Resposta da funcao verify-check
 */
export interface VerifyCheckResponse {
  valid: boolean;
  accessLevel: 'basic' | 'full';
  evidence?: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    certifiedAt: string | null;
    timestampIcp: string | null;
    networks?: string[];
    hash?: string;
    signature?: string;
    chainOfCustody?: Array<{
      event: string;
      timestamp: string;
      actor: string;
      hash: string;
    }>;
    downloadUrls?: Record<string, string>;
  };
}

// ============================================================================
// Classe SupabaseFunctionsClient
// ============================================================================

/**
 * Cliente para chamadas a Supabase Edge Functions
 *
 * Encapsula todas as operacoes CRUD e auxiliares que foram migradas
 * do API Gateway para Supabase Edge Functions.
 *
 * Funcoes disponíveis:
 * - profile-get: Obter perfil do usuario
 * - credits-balance: Obter saldo de creditos
 * - evidence-list: Listar evidencias com paginacao
 * - team-manage: Gerenciar equipe (invite, remove, list)
 * - notification-list: Listar notificacoes
 * - verify-check: Verificar evidencia (publico)
 */
export class SupabaseFunctionsClient {
  private getClient: () => import('@supabase/supabase-js').SupabaseClient;

  /**
   * Cria nova instancia do SupabaseFunctionsClient
   *
   * @param getClient - Funcao que retorna o SupabaseClient singleton
   */
  constructor(getClient: () => import('@supabase/supabase-js').SupabaseClient) {
    this.getClient = getClient;
  }

  // ==========================================================================
  // Metodos auxiliares
  // ==========================================================================

  /**
   * Invoca uma Edge Function e trata a resposta
   *
   * @param functionName - Nome da funcao a invocar
   * @param body - Corpo da requisicao (opcional)
   * @returns Dados da resposta tipados
   * @throws {LexatoError} Em caso de erro na invocacao ou resposta
   */
  private async invoke<T>(functionName: string, body?: Record<string, unknown>): Promise<T> {
    addBreadcrumb({
      category: 'supabase-functions',
      message: `Invocando funcao: ${functionName}`,
      level: 'info',
      data: { functionName, hasBody: !!body },
    });

    try {
      const supabase = this.getClient();
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: body ?? {},
      });

      if (error) {
        addBreadcrumb({
          category: 'supabase-functions',
          message: `Erro na funcao ${functionName}: ${error.message}`,
          level: 'error',
          data: { functionName, error: error.message },
        });

        throw this.mapEdgeFunctionError(functionName, error);
      }

      // A resposta pode vir como EdgeFunctionResponse com data/error
      const response = data as EdgeFunctionResponse<T>;
      if (response?.error) {
        addBreadcrumb({
          category: 'supabase-functions',
          message: `Erro de negocio na funcao ${functionName}: ${response.error.message}`,
          level: 'warning',
          data: { functionName, errorCode: response.error.code, errorMessage: response.error.message },
        });

        throw this.mapBusinessError(functionName, response.error);
      }

      // Retornar dados - pode ser response.data (formato EdgeFunctionResponse) ou data direto
      const result = response?.data !== undefined ? response.data : data;

      addBreadcrumb({
        category: 'supabase-functions',
        message: `Funcao ${functionName} executada com sucesso`,
        level: 'info',
        data: { functionName },
      });

      return result as T;
    } catch (error) {
      if (error instanceof LexatoError) {
        throw error;
      }

      addBreadcrumb({
        category: 'supabase-functions',
        message: `Erro inesperado na funcao ${functionName}`,
        level: 'error',
        data: { functionName, error: error instanceof Error ? error.message : String(error) },
      });

      captureException(error, {
        context: 'supabase_function_invoke',
        functionName,
      });

      throw fromError(error);
    }
  }

  /**
   * Mapeia erro de invocacao da Edge Function para LexatoError
   */
  private mapEdgeFunctionError(functionName: string, error: { message: string; context?: unknown }): LexatoError {
    const message = error.message.toLowerCase();

    // Erro de autenticacao (JWT invalido ou expirado)
    if (message.includes('jwt') || message.includes('unauthorized') || message.includes('401')) {
      return new LexatoError(ErrorCodes.AUTH_TOKEN_INVALID, {
        customMessage: `Sessao invalida ao chamar ${functionName}. Faca login novamente.`,
      });
    }

    // Erro de permissao
    if (message.includes('forbidden') || message.includes('403')) {
      return new LexatoError(ErrorCodes.PERMISSION_DENIED, {
        customMessage: `Permissao negada ao chamar ${functionName}.`,
      });
    }

    // Erro de rate limit
    if (message.includes('rate') || message.includes('429') || message.includes('too many')) {
      return new LexatoError(ErrorCodes.NETWORK_RATE_LIMITED, {
        customMessage: 'Muitas requisicoes. Aguarde alguns minutos e tente novamente.',
      });
    }

    // Erro de rede/conexao
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return new LexatoError(ErrorCodes.NETWORK_CONNECTION_REFUSED, {
        customMessage: `Nao foi possivel conectar ao servico ${functionName}.`,
      });
    }

    // Erro generico do servidor
    return new LexatoError(ErrorCodes.NETWORK_SERVER_ERROR, {
      customMessage: `Erro ao executar ${functionName}: ${error.message}`,
    });
  }

  /**
   * Mapeia erro de negocio retornado pela Edge Function para LexatoError
   */
  private mapBusinessError(functionName: string, error: { code: string; message: string }): LexatoError {
    // Mapear codigos de erro conhecidos
    const codeMapping: Record<string, ErrorCode> = {
      'AUTH_REQUIRED': ErrorCodes.AUTH_TOKEN_INVALID,
      'AUTH_EXPIRED': ErrorCodes.AUTH_TOKEN_EXPIRED,
      'INSUFFICIENT_CREDITS': ErrorCodes.AUTH_INSUFFICIENT_CREDITS,
      'PERMISSION_DENIED': ErrorCodes.PERMISSION_DENIED,
      'NOT_FOUND': ErrorCodes.VALIDATION_INVALID_INPUT,
      'VALIDATION_ERROR': ErrorCodes.VALIDATION_INVALID_INPUT,
      'RATE_LIMITED': ErrorCodes.NETWORK_RATE_LIMITED,
      'INTERNAL_ERROR': ErrorCodes.NETWORK_SERVER_ERROR,
    };

    const errorCode = codeMapping[error.code] ?? ErrorCodes.UNKNOWN_ERROR;

    return new LexatoError(errorCode, {
      customMessage: error.message || `Erro em ${functionName}: ${error.code}`,
    });
  }

  // ==========================================================================
  // Metodos publicos - Perfil
  // ==========================================================================

  /**
   * Obtem perfil do usuario autenticado
   *
   * @returns Dados do perfil
   * @throws {LexatoError} Se nao autenticado ou erro de rede
   */
  async getProfile(): Promise<ProfileGetResponse> {
    return this.invoke<ProfileGetResponse>('profile-get');
  }

  // ==========================================================================
  // Metodos publicos - Creditos
  // ==========================================================================

  /**
   * Obtem saldo de creditos do usuario
   *
   * @returns Saldo com breakdown por tipo, creditos expirando e alertas
   * @throws {LexatoError} Se nao autenticado ou erro de rede
   */
  async getCreditsBalance(): Promise<CreditsBalanceResponse> {
    return this.invoke<CreditsBalanceResponse>('credits-balance');
  }

  // ==========================================================================
  // Metodos publicos - Evidencias
  // ==========================================================================

  /**
   * Lista evidencias do usuario com paginacao e filtros
   *
   * @param params - Parametros de paginacao e filtros
   * @returns Lista de evidencias com total e paginacao
   * @throws {LexatoError} Se nao autenticado ou erro de rede
   */
  async listEvidences(params?: EvidenceListParams): Promise<EvidenceListResponse> {
    return this.invoke<EvidenceListResponse>('evidence-list', params as Record<string, unknown>);
  }

  // ==========================================================================
  // Metodos publicos - Equipe
  // ==========================================================================

  /**
   * Gerencia equipe (convidar, remover, listar membros)
   *
   * @param action - Acao a executar (invite, remove, list)
   * @param params - Parametros da acao
   * @returns Resultado da operacao
   * @throws {LexatoError} Se nao autenticado, sem permissao ou erro de rede
   */
  async manageTeam(action: TeamManageAction, params?: Omit<TeamManageParams, 'action'>): Promise<TeamManageResponse> {
    return this.invoke<TeamManageResponse>('team-manage', {
      action,
      ...params,
    });
  }

  // ==========================================================================
  // Metodos publicos - Notificacoes
  // ==========================================================================

  /**
   * Lista notificacoes do usuario
   *
   * @param params - Parametros de paginacao e filtros
   * @returns Lista de notificacoes com contagem de nao lidas
   * @throws {LexatoError} Se nao autenticado ou erro de rede
   */
  async listNotifications(params?: NotificationListParams): Promise<NotificationListResponse> {
    return this.invoke<NotificationListResponse>('notification-list', {
      action: 'list',
      ...params,
    });
  }

  /**
   * Marca uma notificacao como lida
   *
   * @param id - ID da notificacao
   * @throws {LexatoError} Se nao autenticado ou notificacao nao encontrada
   */
  async markNotificationRead(id: string): Promise<void> {
    await this.invoke<void>('notification-list', {
      action: 'markRead',
      notificationId: id,
    });
  }

  // ==========================================================================
  // Metodos publicos - Verificacao (publico)
  // ==========================================================================

  /**
   * Verifica uma evidencia (acesso publico, sem autenticacao)
   *
   * Dois niveis de acesso:
   * - UUID da evidencia: dados basicos (validade, timestamp, redes)
   * - Codigo autenticado de 8 caracteres: acesso completo (hash, assinatura, cadeia de custodia)
   *
   * @param params - Identificador da evidencia (UUID ou codigo)
   * @returns Dados da verificacao conforme nivel de acesso
   * @throws {LexatoError} Se evidencia nao encontrada ou erro de rede
   */
  async verifyEvidence(params: VerifyCheckParams): Promise<VerifyCheckResponse> {
    return this.invoke<VerifyCheckResponse>('verify-check', params as unknown as Record<string, unknown>);
  }
}

// ============================================================================
// Factory e Singleton - SupabaseFunctionsClient
// ============================================================================

let supabaseFunctionsClientInstance: SupabaseFunctionsClient | null = null;

/**
 * Cria ou obtem instancia singleton do SupabaseFunctionsClient
 *
 * Usa o Supabase client da extensao (chrome.storage.local como storage adapter)
 * para invocar Edge Functions com autenticacao automatica.
 *
 * @returns Instancia do SupabaseFunctionsClient
 */
export function getSupabaseFunctionsClient(): SupabaseFunctionsClient {
  if (!supabaseFunctionsClientInstance) {
    // Import estatico no topo do arquivo via initSupabaseFunctionsClient()
    // Service Workers MV3 nao suportam import() dinamico nem require()
    throw new Error(
      'SupabaseFunctionsClient nao inicializado. ' +
      'Chame initSupabaseFunctionsClient() durante a inicializacao do service worker.'
    );
  }

  return supabaseFunctionsClientInstance;
}

/**
 * Inicializa o SupabaseFunctionsClient com o getter do Supabase client
 *
 * Deve ser chamado durante a inicializacao do service worker,
 * passando a funcao getSupabaseClient importada estaticamente.
 *
 * @param getClientFn - Funcao que retorna o SupabaseClient singleton
 * @returns Instancia do SupabaseFunctionsClient
 *
 * @example
 * ```typescript
 * import { getSupabaseClient } from '../lib/supabase/client';
 * import { initSupabaseFunctionsClient } from './api-client';
 *
 * // Na inicializacao do service worker:
 * initSupabaseFunctionsClient(getSupabaseClient);
 * ```
 */
export function initSupabaseFunctionsClient(
  getClientFn: () => import('@supabase/supabase-js').SupabaseClient
): SupabaseFunctionsClient {
  supabaseFunctionsClientInstance = new SupabaseFunctionsClient(getClientFn);
  return supabaseFunctionsClientInstance;
}

/**
 * Reseta instancia singleton do SupabaseFunctionsClient (util para testes)
 */
export function resetSupabaseFunctionsClient(): void {
  supabaseFunctionsClientInstance = null;
}
