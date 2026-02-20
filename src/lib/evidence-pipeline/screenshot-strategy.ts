/**
 * Estratégia de Captura de Screenshot (Página Completa)
 *
 * Implementa o padrão Strategy para captura de screenshots via stitching
 * de múltiplos viewports. Integra com ForensicCollector para coleta de
 * metadados e calcula hashes SHA-256 + Merkle Root.
 *
 * Fluxo de captura:
 * 1. Calcula dimensões totais da página
 * 2. Divide em viewports de tamanho fixo
 * 3. Captura cada viewport sequencialmente
 * 4. Combina em imagem PNG única
 * 5. Coleta metadados forenses
 * 6. Calcula hashes e Merkle Root
 *
 * @module ScreenshotStrategy
 * @see Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */

import { BaseCaptureStrategy } from './base-capture-strategy';
import { calcularHashSHA256, calcularMerkleRoot, gerarUUIDv4 } from './crypto-helper';
import { captureException } from '../../lib/sentry';
import type {
  CaptureType,
  CaptureConfig,
  CaptureResult,
  PipelineProgressCallback,
  EvidenceStatus,
} from './types';
import type { ForensicMetadata } from '../../types/forensic-metadata.types';

// ============================================================================
// Tipos Internos
// ============================================================================

/**
 * Resposta do content script para captura PISA
 */
interface PisaCaptureResponse {
  success: boolean;
  error?: string;
  data?: {
    status: string;
    imageData?: string;
    imageHash?: string;
    htmlContent?: string;
    htmlHash?: string;
    metadata?: ForensicMetadata;
    metadataHash?: string;
    pageInfo?: {
      url: string;
      title: string;
    };
  };
}

/**
 * Informações da aba ativa
 */
interface TabInfo {
  id: number;
  url: string;
  title: string;
  windowId: number;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Timeout padrão para captura de screenshot (10 minutos)
 * Aumentado para suportar páginas com infinite scroll que precisam de mais tempo
 * para detectar, scrollar e capturar múltiplos viewports
 */
const CAPTURE_TIMEOUT_MS = 600000;

/**
 * Timeout para obter informações da aba (5 segundos)
 */
const TAB_INFO_TIMEOUT_MS = 5000;

// ============================================================================
// ScreenshotStrategy
// ============================================================================

/**
 * Estratégia de captura de screenshot (página completa)
 *
 * Captura página completa via stitching de múltiplos viewports em PNG.
 * Integra com ForensicCollector para coleta de metadados forenses e
 * calcula hashes SHA-256 de todos os artefatos.
 *
 * @example
 * ```typescript
 * const strategy = new ScreenshotStrategy();
 *
 * const result = await strategy.execute(config, (progress) => {
 *   console.log(`[${progress.phase}] ${progress.percent}% - ${progress.message}`);
 * });
 *
 * console.log('Merkle Root:', result.merkleRoot);
 * ```
 */
export class ScreenshotStrategy extends BaseCaptureStrategy {
  readonly type: CaptureType = 'screenshot';

  /**
   * Executa captura de screenshot de página completa
   *
   * Fluxo:
   * 1. Transiciona status: INITIALIZING → CAPTURING
   * 2. Envia mensagem START_PISA para content script
   * 3. Content script faz stitching de viewports
   * 4. Recebe imagem PNG, HTML e metadados
   * 5. Calcula hashes SHA-256 de todos os artefatos
   * 6. Calcula Merkle Root
   * 7. Transiciona status: CAPTURING → CAPTURED
   *
   * @param config - Configuração da captura (tabId, windowId, etc)
   * @param onProgress - Callback opcional para reportar progresso
   * @returns Resultado da captura com hashes e Merkle Root
   * @throws Error se captura falhar ou for cancelada
   *
   * @see Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
   */
  async execute(
    config: CaptureConfig,
    onProgress?: PipelineProgressCallback
  ): Promise<CaptureResult> {
    // Iniciar captura (valida se não há captura em andamento)
    this.iniciarCaptura();

    const evidenceId = gerarUUIDv4();
    const startedAt = new Date().toISOString();

    try {
      // Status: INITIALIZING
      this.emitirProgresso(onProgress, evidenceId, 'INITIALIZING', 0, 'Inicializando captura...');

      // Obter informações da aba
      const tabInfo = await this.obterInfoAba(config.tabId);

      // Verificar se foi cancelada
      if (this.foiCancelada()) {
        throw new Error('Captura cancelada pelo usuário');
      }

      // Status: CAPTURING
      this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 10, 'Capturando página...');

      // Executar captura via content script (PISA)
      const pisaResult = await this.executarCapturaPisa(config.tabId, evidenceId, onProgress);

      // Verificar se foi cancelada
      if (this.foiCancelada()) {
        throw new Error('Captura cancelada pelo usuário');
      }

      // Processar resultado e calcular hashes - com progresso detalhado
      this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 22, 'Processando imagem capturada...');

      const result = await this.processarResultadoComProgresso(
        evidenceId,
        tabInfo,
        pisaResult,
        config,
        startedAt,
        onProgress
      );

      // Status: CAPTURED - captura vai até 30%
      this.emitirProgresso(onProgress, evidenceId, 'CAPTURED', 30, 'Captura concluída!');

      return result;
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido na captura';
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ScreenshotStrategy', operation: 'execute' },
        evidenceId,
      });

      // Emitir progresso de erro
      this.emitirProgresso(
        onProgress,
        evidenceId,
        'CAPTURE_FAILED',
        0,
        `Falha na captura: ${mensagemErro}`
      );

      throw error;
    } finally {
      this.finalizarCaptura();
    }
  }

  // ==========================================================================
  // Métodos Privados
  // ==========================================================================

  /**
   * Obtém informações da aba ativa
   *
   * @param tabId - ID da aba
   * @returns Informações da aba
   * @throws Error se aba não for encontrada ou inacessível
   */
  private async obterInfoAba(tabId: number): Promise<TabInfo> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao obter informações da aba'));
      }, TAB_INFO_TIMEOUT_MS);

      chrome.tabs.get(tabId, (tab) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          reject(new Error(`Erro ao acessar aba: ${chrome.runtime.lastError.message}`));
          return;
        }

        if (!tab?.url) {
          reject(new Error('Aba não encontrada ou URL inacessível'));
          return;
        }

        resolve({
          id: tab.id ?? tabId,
          url: tab.url,
          title: tab.title ?? '',
          windowId: tab.windowId ?? 0,
        });
      });
    });
  }

  /**
   * Executa captura via content script (processo PISA)
   *
   * Envia mensagem START_PISA para o content script que executa:
   * - Ativação de lockdown
   * - Scroll e captura de viewports
   * - Stitching da imagem final
   * - Coleta de HTML e metadados forenses
   *
   * @param tabId - ID da aba
   * @param captureId - ID da captura
   * @param onProgress - Callback de progresso
   * @returns Resposta do content script
   * @throws Error se captura falhar
   */
  private async executarCapturaPisa(
    tabId: number,
    captureId: string,
    onProgress?: PipelineProgressCallback
  ): Promise<PisaCaptureResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout na captura de screenshot'));
      }, CAPTURE_TIMEOUT_MS);

      // Listener para progresso do content script
      const progressListener = (
        message: { type: string; payload?: { percent?: number; message?: string } },
        _sender: chrome.runtime.MessageSender,
        _sendResponse: (response?: unknown) => void
      ) => {
        if (message.type === 'CAPTURE_PROGRESS' && message.payload) {
          const percent = message.payload.percent ?? 0;
          const msg = message.payload.message ?? 'Capturando...';

          // Mapear progresso do content script (0-100) para faixa do pipeline (5-25)
          // Captura vai de 5% a 25% (20% do total)
          const mappedPercent = 5 + Math.round((percent / 100) * 20);

          this.emitirProgresso(onProgress, captureId, 'CAPTURING', mappedPercent, msg);
        }
      };

      // Registrar listener de progresso
      chrome.runtime.onMessage.addListener(progressListener);

      // Preparar payload com dados de isolamento
      const isolation = (this as any).config?.isolation; // TODO: Melhorar tipagem ao passar config para este mÃ©todo
      
      const pisaPayload: any = {
        captureId,
        captureType: 'screenshot',
      };

      // Adicionar dados de isolamento se disponÃ­veis
      if (isolation) {
        pisaPayload.isolationSnapshotHash = isolation.snapshotHash;
        pisaPayload.disabledExtensionIds = isolation.disabledExtensions;
        
        // Calcular modo e metadados
        let mode = 'none';
        if (isolation.disabledExtensions && isolation.disabledExtensions.length > 0) {
          mode = isolation.nonDisabledExtensions && isolation.nonDisabledExtensions.length > 0
            ? 'partial'
            : 'full';
        }

        pisaPayload.isolationMetadata = {
          mode,
          disabledCount: isolation.disabledExtensions?.length ?? 0,
          nonDisabledExtensions: isolation.nonDisabledExtensions ?? [],
          warning: mode === 'partial'
            ? 'Algumas extensÃµes nÃ£o puderam ser desativadas durante a captura'
            : undefined
        };
      }

      // Enviar mensagem para content script
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'START_PISA',
          payload: pisaPayload,
        },
        (response: PisaCaptureResponse | undefined) => {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(progressListener);

          if (chrome.runtime.lastError) {
            reject(new Error(`Erro na comunicaÃ§Ã£o com content script: ${chrome.runtime.lastError.message}`));
            return;
          }

          if (!response) {
            reject(new Error('Resposta vazia do content script'));
            return;
          }

          if (!response.success) {
            reject(new Error(response.error ?? 'Falha na captura PISA'));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  /**
   * Processa resultado da captura e calcula hashes COM progresso detalhado
   *
   * Emite atualizações de progresso durante cada etapa para feedback visual contínuo.
   *
   * @param evidenceId - ID da evidência
   * @param tabInfo - Informações da aba
   * @param pisaResult - Resultado do content script
   * @param config - Configuração da captura
   * @param startedAt - Timestamp de início
   * @param onProgress - Callback de progresso
   * @returns CaptureResult completo
   */
  private async processarResultadoComProgresso(
    evidenceId: string,
    tabInfo: TabInfo,
    pisaResult: PisaCaptureResponse,
    config: CaptureConfig,
    startedAt: string,
    onProgress?: PipelineProgressCallback
  ): Promise<CaptureResult> {
    const data = pisaResult.data;

    if (!data) {
      throw new Error('Dados da captura não disponíveis');
    }

    // Etapa 1: Converter imagem
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 23, 'Convertendo imagem para formato binário...');
    const mediaBlob = await this.base64ToBlob(data.imageData ?? '', 'image/png');

    // Etapa 2: Hash da imagem
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 24, 'Calculando hash SHA-256 da imagem...');
    const mediaHash = data.imageHash ?? (await calcularHashSHA256(await mediaBlob.arrayBuffer()));

    // Etapa 3: Hash do HTML
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 25, 'Calculando hash SHA-256 do HTML...');
    const htmlContent = data.htmlContent ?? '';
    const htmlHash = data.htmlHash ?? (await calcularHashSHA256(htmlContent));

    // Etapa 4: Hash dos metadados
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 26, 'Calculando hash dos metadados forenses...');
    const forensicMetadata = data.metadata ?? this.criarMetadadosPadrao(evidenceId, tabInfo);
    const metadataJson = JSON.stringify(forensicMetadata);
    const metadataHash = data.metadataHash ?? (await calcularHashSHA256(metadataJson));

    // Etapa 5: Merkle Root
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 27, 'Calculando Merkle Root da evidência...');
    const merkleRoot = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);

    // Etapa 6: Finalizando
    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 28, 'Montando pacote de evidência...');

    // Timestamps
    const endedAt = new Date().toISOString();
    const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

    // Montar resultado
    const result: CaptureResult = {
      evidenceId,
      type: 'screenshot',
      url: tabInfo.url,
      title: tabInfo.title,
      media: {
        blob: mediaBlob,
        hash: mediaHash,
        mimeType: 'image/png',
        sizeBytes: mediaBlob.size,
      },
      html: {
        content: htmlContent,
        hash: htmlHash,
        sizeBytes: new TextEncoder().encode(htmlContent).length,
      },
      forensicMetadata,
      metadataHash,
      merkleRoot,
      timestamps: {
        startedAt,
        endedAt,
        durationMs,
      },
      isolation: this.extrairDadosIsolamento(forensicMetadata, config),
    };

    this.emitirProgresso(onProgress, evidenceId, 'CAPTURING', 29, 'Verificando integridade dos hashes...');

    return result;
  }

  /**
   * Converte string base64 para Blob
   *
   * @param base64 - String base64 (pode incluir prefixo data:)
   * @param mimeType - Tipo MIME do blob
   * @returns Blob com os dados
   */
  private async base64ToBlob(base64: string, mimeType: string): Promise<Blob> {
    // Remover prefixo data: se presente
    const base64Data = base64.includes(',') ? base64.split(',')[1] ?? '' : base64;

    if (!base64Data) {
      // Retornar blob vazio se não houver dados
      return new Blob([], { type: mimeType });
    }

    // Decodificar base64
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Cria metadados forenses padrão quando não fornecidos pelo content script
   *
   * @param captureId - ID da captura
   * @param tabInfo - Informações da aba
   * @returns Metadados forenses básicos
   */
  private criarMetadadosPadrao(captureId: string, tabInfo: TabInfo): ForensicMetadata {
    return {
      schemaVersion: '2.0.0',
      captureId,
      collectionTimestamp: new Date().toISOString(),
      collectionDurationMs: 0,
      url: tabInfo.url,
      title: tabInfo.title,
      userAgent: navigator.userAgent,
      extensionVersion: this.obterVersaoExtensao(),
      viewport: {
        width: 0,
        height: 0,
      },
      pageSize: {
        width: 0,
        height: 0,
      },
      viewportsCaptured: 0,
      hashes: {},
    };
  }

  /**
   * Extrai dados de isolamento dos metadados ou config
   *
   * @param _metadata - Metadados forenses (reservado para uso futuro)
   * @param _config - Configuração da captura
   * @returns Dados de isolamento
   */
  private extrairDadosIsolamento(
    _metadata: ForensicMetadata,
    _config: CaptureConfig
  ): CaptureResult['isolation'] {
    // Tentar extrair do metadata se disponível
    // Por enquanto, retornar valores padrão
    return {
      mode: 'none',
      disabledExtensions: [],
      nonDisabledExtensions: [],
    };
  }

  /**
   * Obtém versão da extensão
   *
   * @returns Versão da extensão ou '0.0.0' se não disponível
   */
  private obterVersaoExtensao(): string {
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
   * Emite evento de progresso
   *
   * @param callback - Callback de progresso
   * @param evidenceId - ID da evidência
   * @param status - Status atual
   * @param percent - Percentual de progresso (0-100)
   * @param message - Mensagem descritiva
   */
  private emitirProgresso(
    callback: PipelineProgressCallback | undefined,
    evidenceId: string,
    status: EvidenceStatus,
    percent: number,
    message: string
  ): void {
    if (!callback) {
      return;
    }

    callback({
      evidenceId,
      status,
      phase: 1,
      phaseName: 'capture',
      percent,
      message,
      updatedAt: new Date().toISOString(),
    });
  }
}

export default ScreenshotStrategy;
