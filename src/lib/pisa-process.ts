/**
 * PISA - Processo de Inicialização Segura de Ambiente
 *
 * Implementa 5 etapas de inicialização com cadeia de hashes verificável:
 * H0 (pré-reload) → H1 (pós-reload) → H2 (loaded) → H3 (canal) → H4 (lockdown)
 *
 * HASH_CADEIA = Hash(H0 || H1 || H2 || H3 || H4)
 *
 * Integração com Isolamento de Extensões (Requirements 6.1, 6.2, 6.7):
 * - Isolamento DEVE ser ativado ANTES de gerar H0
 * - Hash do snapshot de isolamento incluído na cadeia PISA
 * - Verificação de isolamento ativo antes de cada etapa
 *
 * @module PISAProcess
 */

import { CryptoUtils } from './crypto-utils';
import { AuditLogger } from './audit-logger';
import { LexatoError, ErrorCodes } from './errors';
import type {
  PISAConfig,
  PartialPISAConfig,
  PISAResult,
  ResultadoEtapaPISA,
  Stage0Data,
  Stage1Data,
  Stage2Data,
  Stage3Data,
  Stage4Data,
  SecureChannelResponse,
  AuthorizationResponse,
  PageLoadStatus,
  LockdownActivationResult,
} from '../types/pisa.types';
import type { IsolationResult, IsolationStatus } from '../types/isolation.types';

/**
 * Configuração padrão do PISA
 */
export const DEFAULT_PISA_CONFIG: PISAConfig = {
  timeouts: {
    pageLoad: 30000, // 30 segundos
    secureChannel: 30000, // 30 segundos
    stageTimeout: 10000, // 10 segundos por etapa
  },
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    jitter: 0.3, // 30% de variação
  },
};

/**
 * Separador usado na concatenação de hashes para HASH_CADEIA
 */
const HASH_SEPARATOR = '||';

/**
 * Parâmetro de cache-busting adicionado à URL
 */
const CACHE_BUST_PARAM = '_lexato_nocache';

/**
 * Callback para ativar isolamento de extensões
 * Requirement 6.1: Isolamento DEVE ser ativado ANTES de gerar H0
 */
export type IsolationActivator = (correlationId: string) => Promise<IsolationResult>;

/**
 * Callback para verificar status do isolamento
 * Requirement 6.2: Verificar isolamento ativo antes de cada etapa
 */
export type IsolationStatusChecker = () => IsolationStatus;

/**
 * Callback para desativar isolamento de extensões
 * Requirement 6.4: Restaurar extensões após captura
 */
export type IsolationDeactivator = () => Promise<void>;

/**
 * PISA - Processo de Inicialização Segura de Ambiente
 *
 * Cria cadeia de hashes que documenta cada etapa da inicialização,
 * garantindo rastreabilidade e eliminando manipulação prévia.
 *
 * Etapas:
 * - H0 (PRE_RELOAD): Captura estado antes do reload
 * - H1 (POST_RELOAD): Após reload forçado com cache-busting
 * - H2 (LOADED): Após verificação de carregamento completo
 * - H3 (SECURE_CHANNEL): Após estabelecimento de canal seguro
 * - H4 (LOCKDOWN): Após ativação do modo lockdown
 *
 * Integração com Isolamento (Requirements 6.1, 6.2, 6.7):
 * - Isolamento ativado ANTES de H0
 * - Hash do snapshot incluído em H0
 * - Verificação de isolamento antes de cada etapa
 */
export class PISAProcess {
  private logger: AuditLogger;
  private config: PISAConfig;
  private stages: ResultadoEtapaPISA[] = [];
  private startTime: number = 0;
  private aborted: boolean = false;
  
  /** Hash do snapshot de isolamento (Requirement 6.7) */
  private isolationSnapshotHash: string | undefined;
  /** IDs das extensões desativadas durante o processo */
  private disabledExtensionIds: string[] = [];
  /** Callbacks de isolamento */
  private isolationActivator: IsolationActivator | null = null;
  private isolationStatusChecker: IsolationStatusChecker | null = null;
  /** @internal Reservado para futuras implementações de desativação de isolamento */
  private _isolationDeactivator: IsolationDeactivator | null = null;

  /**
   * Cria nova instância do PISAProcess
   *
   * @param logger - Logger para auditoria
   * @param config - Configuração opcional (usa padrão se não fornecida)
   */
  constructor(logger: AuditLogger, config?: PartialPISAConfig) {
    this.logger = logger;
    this.config = {
      timeouts: {
        ...DEFAULT_PISA_CONFIG.timeouts,
        ...config?.timeouts,
      },
      retry: {
        ...DEFAULT_PISA_CONFIG.retry,
        ...config?.retry,
      },
    };
  }

  /**
   * Configura callbacks de isolamento de extensões
   * Requirement 6.1, 6.2, 6.4
   *
   * @param activator - Função para ativar isolamento
   * @param statusChecker - Função para verificar status do isolamento
   * @param deactivator - Função para desativar isolamento
   */
  setIsolationCallbacks(
    activator: IsolationActivator,
    statusChecker: IsolationStatusChecker,
    deactivator: IsolationDeactivator
  ): void {
    this.isolationActivator = activator;
    this.isolationStatusChecker = statusChecker;
    this._isolationDeactivator = deactivator;

    this.logger.info('PISA', 'ISOLATION_CALLBACKS_SET', {});
  }

  /**
   * Retorna o callback de desativação de isolamento
   * @internal Reservado para uso futuro na fase de cleanup
   */
  getIsolationDeactivator(): IsolationDeactivator | null {
    return this._isolationDeactivator;
  }

  /**
   * Executa o processo PISA completo
   *
   * Requirement 6.1: Isolamento ativado ANTES de gerar H0
   * Requirement 6.2: Verificação de isolamento antes de cada etapa
   * Requirement 6.7: Hash do snapshot incluído na cadeia PISA
   *
   * @param url - URL da página a ser capturada
   * @param tabId - ID da aba do Chrome
   * @returns Resultado do processo PISA
   */
  async execute(url: string, tabId: number): Promise<PISAResult> {
    this.startTime = Date.now();
    this.stages = [];
    this.aborted = false;
    this.isolationSnapshotHash = undefined;
    this.disabledExtensionIds = [];

    const correlationId = this.logger.getCorrelationId();

    this.logger.info('PISA', 'PROCESS_START', {
      url,
      tabId,
      config: this.config,
      hasIsolationCallbacks: !!this.isolationActivator,
    });

    try {
      // Requirement 6.1: Ativar isolamento ANTES de gerar H0
      if (this.isolationActivator) {
        const isolationResult = await this.activateIsolationBeforeH0(correlationId);
        if (!isolationResult.success) {
          throw new LexatoError(ErrorCodes.CAPTURE_FAILED, {
            customMessage: `Falha ao ativar isolamento: ${isolationResult.error ?? 'Erro desconhecido'}`,
          });
        }
        this.isolationSnapshotHash = isolationResult.snapshot?.hash;
        this.disabledExtensionIds = isolationResult.disabledExtensions;
      }

      // Etapa 0: Hash pré-reload (inclui hash do snapshot de isolamento)
      const h0 = await this.stage0_preReload(url);
      this.checkAborted();

      // Requirement 6.2: Verificar isolamento antes de cada etapa
      this.verifyIsolationActive('STAGE_1');

      // Etapa 1: Reload forçado com cache-busting
      const h1 = await this.stage1_forceReload(tabId, h0.hash);
      this.checkAborted();

      this.verifyIsolationActive('STAGE_2');

      // Etapa 2: Verificação de carregamento completo
      const h2 = await this.stage2_verifyLoaded(tabId, h1.hash);
      this.checkAborted();

      this.verifyIsolationActive('STAGE_3');

      // Etapa 3: Estabelecimento de canal seguro
      const h3 = await this.stage3_secureChannel(h2.hash);
      this.checkAborted();

      this.verifyIsolationActive('STAGE_4');

      // Etapa 4: Ativação do lockdown
      await this.stage4_activateLockdown(tabId, h3.hash);
      this.checkAborted();

      // Calcular HASH_CADEIA = Hash(H0 || H1 || H2 || H3 || H4)
      const hashCadeia = await this.calculateChainHash();

      // Obter autorização do servidor
      const authToken = await this.stage5_getAuthorization(hashCadeia);

      const totalDurationMs = Date.now() - this.startTime;

      this.logger.info('PISA', 'PROCESS_COMPLETE', {
        hashCadeia,
        stagesCount: this.stages.length,
        totalDurationMs,
        isolationSnapshotHash: this.isolationSnapshotHash,
        disabledExtensionsCount: this.disabledExtensionIds.length,
      });

      const result: PISAResult = {
        success: true,
        hashCadeia,
        stages: this.stages,
        authorizationToken: authToken,
        totalDurationMs,
      };

      // Adicionar hash do snapshot apenas se definido
      if (this.isolationSnapshotHash) {
        result.isolationSnapshotHash = this.isolationSnapshotHash;
      }

      // Adicionar extensões desativadas apenas se houver
      if (this.disabledExtensionIds.length > 0) {
        result.disabledExtensionIds = this.disabledExtensionIds;
      }

      return result;
    } catch (error) {
      const totalDurationMs = Date.now() - this.startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.error(
        'PISA',
        'PROCESS_FAILED',
        {
          error: errorMessage,
          stagesCompleted: this.stages.length,
          totalDurationMs,
        },
        error instanceof Error ? error : undefined
      );

      const result: PISAResult = {
        success: false,
        hashCadeia: '',
        stages: this.stages,
        error: errorMessage,
        totalDurationMs,
      };

      // Adicionar hash do snapshot apenas se definido
      if (this.isolationSnapshotHash) {
        result.isolationSnapshotHash = this.isolationSnapshotHash;
      }

      // Adicionar extensões desativadas apenas se houver
      if (this.disabledExtensionIds.length > 0) {
        result.disabledExtensionIds = this.disabledExtensionIds;
      }

      return result;
    }
  }

  /**
   * Ativa isolamento de extensões antes de gerar H0
   * Requirement 6.1
   *
   * @param correlationId - ID de correlação da captura
   * @returns Resultado da ativação do isolamento
   */
  private async activateIsolationBeforeH0(correlationId: string): Promise<IsolationResult> {
    if (!this.isolationActivator) {
      return {
        success: false,
        snapshot: null,
        disabledExtensions: [],
        nonDisableableExtensions: [],
        error: 'Callback de isolamento não configurado',
        elapsedMs: 0,
      };
    }

    this.logger.info('PISA', 'ISOLATION_ACTIVATION_START', { correlationId });

    const result = await this.isolationActivator(correlationId);

    if (result.success) {
      this.logger.info('PISA', 'ISOLATION_ACTIVATION_SUCCESS', {
        snapshotHash: result.snapshot?.hash,
        disabledCount: result.disabledExtensions.length,
        nonDisableableCount: result.nonDisableableExtensions.length,
      });
    } else {
      this.logger.error('PISA', 'ISOLATION_ACTIVATION_FAILED', {
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Verifica se isolamento está ativo antes de cada etapa
   * Requirement 6.2
   *
   * @param stageName - Nome da etapa para log
   * @throws LexatoError se isolamento não estiver ativo
   */
  private verifyIsolationActive(stageName: string): void {
    if (!this.isolationStatusChecker) {
      // Sem callback configurado, pular verificação
      return;
    }

    const status = this.isolationStatusChecker();

    if (!status.isActive) {
      this.logger.error('PISA', 'ISOLATION_NOT_ACTIVE', {
        stageName,
        status,
      });
      throw new LexatoError(ErrorCodes.CAPTURE_FAILED, {
        customMessage: `Isolamento não está ativo antes de ${stageName}`,
      });
    }

    this.logger.info('PISA', 'ISOLATION_VERIFIED', {
      stageName,
      disabledCount: status.disabledCount,
    });
  }

  /**
   * Aborta o processo PISA em andamento
   */
  abort(): void {
    this.aborted = true;
    this.logger.warn('PISA', 'PROCESS_ABORTED', {
      stagesCompleted: this.stages.length,
    });
  }

  /**
   * Verifica se o processo foi abortado
   */
  private checkAborted(): void {
    if (this.aborted) {
      throw new LexatoError(ErrorCodes.CAPTURE_FAILED, {
        customMessage: 'Processo PISA abortado pelo usuário',
      });
    }
  }

  /**
   * Etapa 0: Captura estado pré-reload
   *
   * Gera H0 com URL atual e timestamp do clique antes de qualquer ação
   * Requirement 6.7: Inclui hash do snapshot de isolamento
   */
  private async stage0_preReload(url: string): Promise<ResultadoEtapaPISA> {
    const timestamp = Date.now();

    this.logger.info('PISA', 'STAGE_0_START', { 
      url,
      isolationSnapshotHash: this.isolationSnapshotHash,
    });

    const data: Stage0Data = {
      url,
      timestamp,
      userAgent: navigator.userAgent,
      extensionVersion: this.getExtensionVersion(),
    };

    // Requirement 6.7: Incluir hash do snapshot de isolamento apenas se definido
    if (this.isolationSnapshotHash) {
      data.isolationSnapshotHash = this.isolationSnapshotHash;
    }

    const hash = await CryptoUtils.hash(data);

    const result: ResultadoEtapaPISA = {
      stage: 0,
      name: 'PRE_RELOAD',
      hash,
      timestamp,
      data,
    };

    this.stages.push(result);

    this.logger.info('PISA', 'STAGE_0_COMPLETE', {
      hash,
      elapsedMs: Date.now() - this.startTime,
      isolationSnapshotHash: this.isolationSnapshotHash,
    });

    return result;
  }

  /**
   * Etapa 1: Força reload com cache-busting
   *
   * Recarrega a página com parâmetro _lexato_nocache para eliminar manipulações prévias
   */
  private async stage1_forceReload(tabId: number, previousHash: string): Promise<ResultadoEtapaPISA> {
    const timestamp = Date.now();

    this.logger.info('PISA', 'STAGE_1_START', { tabId, previousHash });

    // Obter URL atual da aba
    const tab = await this.getTab(tabId);
    if (!tab.url) {
      throw new LexatoError(ErrorCodes.CAPTURE_PAGE_LOAD_FAILED, {
        customMessage: 'URL da aba não disponível',
      });
    }

    // Adicionar parâmetro de cache-busting
    const url = new URL(tab.url);
    url.searchParams.set(CACHE_BUST_PARAM, timestamp.toString());
    const reloadedUrl = url.toString();

    // Recarregar página
    await this.reloadTab(tabId, reloadedUrl);

    // Aguardar load event
    await this.waitForPageLoad(tabId, this.config.timeouts.pageLoad);

    const data: Stage1Data = {
      previousHash,
      timestamp,
      reloadedUrl,
    };

    // Hash vinculado ao anterior: Hash(previousHash + dados)
    const hash = await CryptoUtils.hash(previousHash + CryptoUtils.stringifyOrdered(data));

    const result: ResultadoEtapaPISA = {
      stage: 1,
      name: 'POST_RELOAD',
      hash,
      timestamp,
      data,
    };

    this.stages.push(result);

    this.logger.info('PISA', 'STAGE_1_COMPLETE', {
      hash,
      reloadedUrl,
      elapsedMs: Date.now() - this.startTime,
    });

    return result;
  }

  /**
   * Etapa 2: Verifica carregamento completo
   *
   * Aguarda readyState === 'complete', imagens e fontes carregarem
   */
  private async stage2_verifyLoaded(tabId: number, previousHash: string): Promise<ResultadoEtapaPISA> {
    const timestamp = Date.now();

    this.logger.info('PISA', 'STAGE_2_START', { tabId, previousHash });

    // Verificar readyState, imagens e fontes via content script
    const loadStatus = await this.sendMessageToTab<PageLoadStatus>(tabId, {
      type: 'VERIFY_PAGE_LOADED',
      timeout: this.config.timeouts.pageLoad,
    });

    if (!loadStatus.imagesLoaded || !loadStatus.fontsLoaded) {
      this.logger.warn('PISA', 'STAGE_2_INCOMPLETE_LOAD', {
        imagesLoaded: loadStatus.imagesLoaded,
        fontsLoaded: loadStatus.fontsLoaded,
        totalImages: loadStatus.totalImages,
        loadedImages: loadStatus.loadedImages,
      });
    }

    const data: Stage2Data = {
      previousHash,
      timestamp,
      readyState: loadStatus.readyState,
      imagesLoaded: loadStatus.imagesLoaded,
      fontsLoaded: loadStatus.fontsLoaded,
      totalImages: loadStatus.totalImages,
      loadedImages: loadStatus.loadedImages,
    };

    // Hash vinculado ao anterior
    const hash = await CryptoUtils.hash(previousHash + CryptoUtils.stringifyOrdered(data));

    const result: ResultadoEtapaPISA = {
      stage: 2,
      name: 'LOADED',
      hash,
      timestamp,
      data,
    };

    this.stages.push(result);

    this.logger.info('PISA', 'STAGE_2_COMPLETE', {
      hash,
      readyState: loadStatus.readyState,
      elapsedMs: Date.now() - this.startTime,
    });

    return result;
  }

  /**
   * Etapa 3: Estabelece canal seguro com servidor
   *
   * Gera par de chaves ECDH P-256 e troca nonces anti-replay
   */
  private async stage3_secureChannel(previousHash: string): Promise<ResultadoEtapaPISA> {
    const timestamp = Date.now();

    this.logger.info('PISA', 'STAGE_3_START', { previousHash });

    // Gerar par de chaves ECDH P-256
    const keyPair = await this.generateECDHKeyPair();

    // Exportar chave pública
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBase64 = CryptoUtils.arrayBufferToBase64(publicKeyRaw);

    // Gerar nonce (mínimo 128 bits = 16 bytes)
    const clientNonce = CryptoUtils.generateNonce(16);
    const clientNonceBase64 = CryptoUtils.uint8ArrayToBase64(clientNonce);

    // Trocar com servidor
    const serverResponse = await this.exchangeWithServer({
      publicKey: publicKeyBase64,
      nonce: clientNonceBase64,
      previousHash,
    });

    // Calcular hashes para registro (não expor valores reais)
    const publicKeyHash = await CryptoUtils.hash(publicKeyBase64);
    const clientNonceHash = await CryptoUtils.hash(clientNonceBase64);
    const serverNonceHash = await CryptoUtils.hash(serverResponse.serverNonce);

    const data: Stage3Data = {
      previousHash,
      timestamp,
      publicKeyHash,
      clientNonceHash,
      serverNonceHash,
    };

    // Hash vinculado ao anterior
    const hash = await CryptoUtils.hash(previousHash + CryptoUtils.stringifyOrdered(data));

    const result: ResultadoEtapaPISA = {
      stage: 3,
      name: 'SECURE_CHANNEL',
      hash,
      timestamp,
      data,
    };

    this.stages.push(result);

    this.logger.info('PISA', 'STAGE_3_COMPLETE', {
      hash,
      elapsedMs: Date.now() - this.startTime,
    });

    return result;
  }

  /**
   * Etapa 4: Ativa modo lockdown
   *
   * Ativa todas as proteções de segurança antes de iniciar a captura
   */
  private async stage4_activateLockdown(tabId: number, previousHash: string): Promise<ResultadoEtapaPISA> {
    const timestamp = Date.now();

    this.logger.info('PISA', 'STAGE_4_START', { tabId, previousHash });

    // Ativar lockdown via content script
    const lockdownResult = await this.sendMessageToTab<LockdownActivationResult>(tabId, {
      type: 'ACTIVATE_LOCKDOWN',
    });

    if (!lockdownResult.success) {
      throw new LexatoError(ErrorCodes.CAPTURE_LOCKDOWN_FAILED, {
        customMessage: lockdownResult.error ?? 'Falha ao ativar modo lockdown',
      });
    }

    const data: Stage4Data = {
      previousHash,
      timestamp,
      protectionsActive: lockdownResult.protections,
      baselineSnapshot: lockdownResult.baselineSnapshot,
    };

    // Hash vinculado ao anterior
    const hash = await CryptoUtils.hash(previousHash + CryptoUtils.stringifyOrdered(data));

    const result: ResultadoEtapaPISA = {
      stage: 4,
      name: 'LOCKDOWN',
      hash,
      timestamp,
      data,
    };

    this.stages.push(result);

    this.logger.info('PISA', 'STAGE_4_COMPLETE', {
      hash,
      protectionsCount: lockdownResult.protections.length,
      elapsedMs: Date.now() - this.startTime,
    });

    return result;
  }

  /**
   * Calcula HASH_CADEIA = Hash(H0 || H1 || H2 || H3 || H4)
   */
  async calculateChainHash(): Promise<string> {
    if (this.stages.length !== 5) {
      throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
        customMessage: `Esperado 5 etapas, encontrado ${this.stages.length}`,
      });
    }

    const concatenated = this.stages.map((s) => s.hash).join(HASH_SEPARATOR);
    const hashCadeia = await CryptoUtils.hash(concatenated);

    this.logger.info('PISA', 'CHAIN_HASH_CALCULATED', {
      hashCadeia,
      stagesHashes: this.stages.map((s) => ({ stage: s.stage, hash: s.hash })),
    });

    return hashCadeia;
  }

  /**
   * Etapa 5: Obtém autorização do servidor
   *
   * Envia HASH_CADEIA para servidor e verifica assinatura do token
   */
  private async stage5_getAuthorization(hashCadeia: string): Promise<string> {
    this.logger.info('PISA', 'AUTHORIZATION_REQUEST', { hashCadeia });

    // Solicitar autorização ao servidor
    const response = await this.requestAuthorization(hashCadeia);

    // Verificar assinatura do token
    const isValid = await this.verifyServerSignature(response.token, response.signature);

    if (!isValid) {
      throw new LexatoError(ErrorCodes.VALIDATION_SIGNATURE_INVALID, {
        customMessage: 'Assinatura do servidor inválida',
      });
    }

    this.logger.info('PISA', 'AUTHORIZATION_RECEIVED', {
      tokenHash: await CryptoUtils.hash(response.token),
      expiresAt: new Date(response.expiresAt).toISOString(),
    });

    return response.token;
  }

  /**
   * Obtém versão da extensão do manifest
   */
  private getExtensionVersion(): string {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Obtém informações da aba
   */
  private async getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return chrome.tabs.get(tabId);
  }

  /**
   * Recarrega a aba com nova URL
   */
  private async reloadTab(tabId: number, url: string): Promise<void> {
    await chrome.tabs.update(tabId, { url });
  }

  /**
   * Aguarda carregamento da página
   */
  private async waitForPageLoad(tabId: number, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(
          new LexatoError(ErrorCodes.CAPTURE_TIMEOUT, {
            customMessage: `Timeout aguardando carregamento da página (${timeout}ms)`,
          })
        );
      }, timeout);

      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Envia mensagem para content script da aba
   */
  private async sendMessageToTab<T>(tabId: number, message: unknown): Promise<T> {
    return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
  }

  /**
   * Gera par de chaves ECDH P-256
   */
  private async generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  }

  /**
   * Troca informações com servidor para canal seguro
   *
   * @param data - Dados para enviar ao servidor
   * @returns Resposta do servidor
   */
  private async exchangeWithServer(data: {
    publicKey: string;
    nonce: string;
    previousHash: string;
  }): Promise<SecureChannelResponse> {
    // TODO: Implementar chamada real à API
    // Por enquanto, retorna mock para desenvolvimento
    this.logger.info('PISA', 'SECURE_CHANNEL_EXCHANGE', {
      publicKeyLength: data.publicKey.length,
      nonceLength: data.nonce.length,
    });

    // Simular resposta do servidor
    const serverNonce = CryptoUtils.generateNonce(16);
    const serverKeyPair = await this.generateECDHKeyPair();
    const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey);

    return {
      serverNonce: CryptoUtils.uint8ArrayToBase64(serverNonce),
      serverPublicKey: CryptoUtils.arrayBufferToBase64(serverPublicKeyRaw),
      serverTimestamp: Date.now(),
    } satisfies SecureChannelResponse;
  }

  /**
   * Solicita autorização ao servidor
   *
   * @param hashCadeia - Hash da cadeia PISA
   * @returns Resposta de autorização
   */
  private async requestAuthorization(hashCadeia: string): Promise<AuthorizationResponse> {
    // TODO: Implementar chamada real à API
    // Por enquanto, retorna mock para desenvolvimento
    this.logger.info('PISA', 'AUTHORIZATION_REQUEST_SENT', {
      hashCadeiaLength: hashCadeia.length,
    });

    // Simular resposta do servidor
    const token = CryptoUtils.arrayToHex(CryptoUtils.generateNonce(32));
    const signature = await CryptoUtils.hash(token + hashCadeia);

    return {
      token,
      signature,
      expiresAt: Date.now() + 3600000, // 1 hora
    };
  }

  /**
   * Verifica assinatura do servidor
   *
   * @param token - Token recebido
   * @param signature - Assinatura do token
   * @returns Se a assinatura é válida
   */
  private async verifyServerSignature(token: string, signature: string): Promise<boolean> {
    // TODO: Implementar verificação real de assinatura
    // Por enquanto, aceita qualquer assinatura para desenvolvimento
    this.logger.info('PISA', 'SIGNATURE_VERIFICATION', {
      tokenLength: token.length,
      signatureLength: signature.length,
    });

    return token.length > 0 && signature.length > 0;
  }

  /**
   * Obtém as etapas completadas
   */
  getStages(): ResultadoEtapaPISA[] {
    return [...this.stages];
  }

  /**
   * Obtém o correlationId do logger
   */
  getCorrelationId(): string {
    return this.logger.getCorrelationId();
  }

  /**
   * Obtém o hash do snapshot de isolamento
   * Requirement 6.7
   */
  getIsolationSnapshotHash(): string | undefined {
    return this.isolationSnapshotHash;
  }

  /**
   * Obtém IDs das extensões desativadas
   * Requirement 6.3
   */
  getDisabledExtensionIds(): string[] {
    return [...this.disabledExtensionIds];
  }
}

export default PISAProcess;
