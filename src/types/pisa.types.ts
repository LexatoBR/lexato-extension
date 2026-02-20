/**
 * Tipos para o PISA - Processo de Inicialização Segura de Ambiente
 *
 * Define interfaces para as etapas do PISA e seus resultados
 *
 * @module PISATypes
 */

/**
 * Nomes das etapas do PISA
 */
export type PISAStageName =
  | 'PRE_RELOAD'
  | 'POST_RELOAD'
  | 'LOADED'
  | 'SECURE_CHANNEL'
  | 'LOCKDOWN';

/**
 * Resultado de uma etapa do PISA
 */
export interface ResultadoEtapaPISA {
  /** Número da etapa (0-4) */
  stage: number;
  /** Nome da etapa */
  name: PISAStageName;
  /** Hash calculado nesta etapa */
  hash: string;
  /** Timestamp em milissegundos */
  timestamp: number;
  /** Dados específicos da etapa */
  data: Record<string, unknown>;
}

/**
 * Resultado completo do processo PISA
 */
export interface PISAResult {
  /** Se o processo foi bem-sucedido */
  success: boolean;
  /** Hash da cadeia completa: Hash(H0 || H1 || H2 || H3 || H4) */
  hashCadeia: string;
  /** Resultados de cada etapa */
  stages: ResultadoEtapaPISA[];
  /** Token de autorização do servidor (se sucesso) */
  authorizationToken?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
  /** Tempo total de execução em ms */
  totalDurationMs?: number;
  /** Hash do snapshot de isolamento de extensões (Requirement 6.7) */
  isolationSnapshotHash?: string;
  /** IDs das extensões desativadas durante o processo */
  disabledExtensionIds?: string[];
}

/**
 * Configuração do PISA
 */
export interface PISAConfig {
  /** Timeouts em milissegundos */
  timeouts: {
    /** Timeout para carregamento da página (padrão: 30000ms) */
    pageLoad: number;
    /** Timeout para estabelecimento do canal seguro (padrão: 30000ms) */
    secureChannel: number;
    /** Timeout para cada etapa individual (padrão: 10000ms) */
    stageTimeout: number;
  };
  /** Configuração de retry para canal seguro */
  retry: {
    /** Número máximo de tentativas */
    maxAttempts: number;
    /** Delay inicial em ms */
    initialDelay: number;
    /** Delay máximo em ms */
    maxDelay: number;
    /** Fator de jitter (0-1) */
    jitter: number;
  };
}

/**
 * Configuração parcial do PISA para customização
 */
export interface PartialPISAConfig {
  timeouts?: Partial<PISAConfig['timeouts']>;
  retry?: Partial<PISAConfig['retry']>;
}

/**
 * Dados da etapa 0 (PRE_RELOAD)
 */
export interface Stage0Data extends Record<string, unknown> {
  /** URL atual da página */
  url: string;
  /** Timestamp do clique */
  timestamp: number;
  /** User-Agent do navegador */
  userAgent: string;
  /** Versão da extensão */
  extensionVersion: string;
  /** Hash do snapshot de isolamento de extensões (Requirement 6.7) */
  isolationSnapshotHash?: string;
}

/**
 * Dados da etapa 1 (POST_RELOAD)
 */
export interface Stage1Data extends Record<string, unknown> {
  /** Hash da etapa anterior */
  previousHash: string;
  /** Timestamp do reload */
  timestamp: number;
  /** URL com cache-busting */
  reloadedUrl: string;
}

/**
 * Dados da etapa 2 (LOADED)
 */
export interface Stage2Data extends Record<string, unknown> {
  /** Hash da etapa anterior */
  previousHash: string;
  /** Timestamp da verificação */
  timestamp: number;
  /** Estado do documento */
  readyState: DocumentReadyState;
  /** Se todas as imagens carregaram */
  imagesLoaded: boolean;
  /** Se todas as fontes carregaram */
  fontsLoaded: boolean;
  /** Número total de imagens */
  totalImages: number;
  /** Número de imagens carregadas */
  loadedImages: number;
}

/**
 * Dados da etapa 3 (SECURE_CHANNEL)
 */
export interface Stage3Data extends Record<string, unknown> {
  /** Hash da etapa anterior */
  previousHash: string;
  /** Timestamp do estabelecimento */
  timestamp: number;
  /** Hash da chave pública do cliente */
  publicKeyHash: string;
  /** Hash do nonce do cliente */
  clientNonceHash: string;
  /** Hash do nonce do servidor */
  serverNonceHash: string;
}

/**
 * Dados da etapa 4 (LOCKDOWN)
 */
export interface Stage4Data extends Record<string, unknown> {
  /** Hash da etapa anterior */
  previousHash: string;
  /** Timestamp da ativação */
  timestamp: number;
  /** Lista de proteções ativas */
  protectionsActive: string[];
  /** Snapshot baseline do DOM */
  baselineSnapshot: {
    /** Hash do DOM */
    hash: string;
    /** Número de elementos */
    elementCount: number;
    /** Tamanho do conteúdo de texto */
    textContentLength: number;
  };
}

/**
 * Resposta do servidor para troca de canal seguro
 */
export interface SecureChannelResponse {
  /** Nonce do servidor (Base64) */
  serverNonce: string;
  /** Chave pública do servidor (Base64) */
  serverPublicKey: string;
  /** Timestamp do servidor */
  serverTimestamp: number;
}

/**
 * Resposta do servidor para autorização
 */
export interface AuthorizationResponse {
  /** Token de autorização */
  token: string;
  /** Assinatura do token */
  signature: string;
  /** Timestamp de expiração */
  expiresAt: number;
}

/**
 * Status de carregamento da página
 */
export interface PageLoadStatus {
  /** Estado do documento */
  readyState: DocumentReadyState;
  /** Se todas as imagens carregaram */
  imagesLoaded: boolean;
  /** Se todas as fontes carregaram */
  fontsLoaded: boolean;
  /** Número total de imagens */
  totalImages: number;
  /** Número de imagens carregadas */
  loadedImages: number;
}

/**
 * Resultado da ativação do lockdown
 */
export interface LockdownActivationResult {
  /** Se a ativação foi bem-sucedida */
  success: boolean;
  /** Lista de proteções ativas */
  protections: string[];
  /** Snapshot baseline do DOM */
  baselineSnapshot: {
    hash: string;
    elementCount: number;
    textContentLength: number;
  };
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Mensagens entre service worker e content script para PISA
 */
export type PISAMessage =
  | { type: 'VERIFY_PAGE_LOADED'; timeout: number }
  | { type: 'ACTIVATE_LOCKDOWN' }
  | { type: 'DEACTIVATE_LOCKDOWN' }
  | { type: 'GET_DOM_HASH' };

/**
 * Respostas das mensagens PISA
 */
export type PISAMessageResponse =
  | PageLoadStatus
  | LockdownActivationResult
  | { hash: string };
