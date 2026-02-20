/**
 * Serviço de Coleta de HTML
 *
 * Gerencia a coleta de snapshots HTML durante capturas de vídeo.
 * Captura HTML em três momentos:
 * 1. Inicial - Antes de iniciar a gravação
 * 2. Navegações - Cada vez que o usuário navega ou recarrega
 * 3. Final - Ao parar a gravação
 *
 * @module HtmlCollectionService
 * @see Requirements 7.9, 7.10
 */

import { calcularHashSHA256, calcularMerkleRoot } from './crypto-helper';
import type { HtmlSnapshot, HtmlCollection } from './types';
import { addBreadcrumb } from '../sentry';

function debugLog(step: string, data?: Record<string, unknown>): void {
  addBreadcrumb({
    category: 'html-collection',
    message: step,
    level: 'info',
    ...(data ? { data } : {}),
  });
}

function debugError(step: string, error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
   
  addBreadcrumb({
    category: 'html-collection',
    message: `${step}: ${errorMsg}`,
    level: 'error',
  });
}

/**
 * Serviço de coleta de HTML para evidências de vídeo
 *
 * Monitora navegações durante a gravação e captura snapshots HTML
 * em momentos críticos para garantir rastreabilidade completa.
 */
export class HtmlCollectionService {
  private tabId: number;
  private isCollecting = false;
  private initialSnapshot: HtmlSnapshot | null = null;
  private navigationSnapshots: HtmlSnapshot[] = [];
  private navigationListener: ((details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => void) | null = null;
  private navigationSequence = 0;

  constructor(tabId: number) {
    debugLog('CONSTRUCTOR_CALLED', { tabId });
    this.tabId = tabId;
    debugLog('CONSTRUCTOR_COMPLETE');
  }

  /**
   * Inicia a coleta de HTML
   * Captura o HTML inicial e começa a monitorar navegações
   */
  async startCollection(): Promise<HtmlSnapshot> {
    debugLog('START_COLLECTION_CALLED', { 
      tabId: this.tabId, 
      isCollecting: this.isCollecting 
    });

    if (this.isCollecting) {
      debugLog('START_COLLECTION_ALREADY_COLLECTING');
      throw new Error('Coleta de HTML já está em andamento');
    }

    this.isCollecting = true;
    this.navigationSnapshots = [];
    this.navigationSequence = 0;
    debugLog('START_COLLECTION_STATE_INITIALIZED');

    // Capturar HTML inicial
    debugLog('START_COLLECTION_CAPTURING_INITIAL_HTML');
    try {
      this.initialSnapshot = await this.captureHtmlSnapshot('initial');
      debugLog('START_COLLECTION_INITIAL_HTML_CAPTURED', {
        url: this.initialSnapshot.url,
        sizeBytes: this.initialSnapshot.sizeBytes,
        hashPrefix: this.initialSnapshot.hash.substring(0, 16),
      });
    } catch (error) {
      debugError('START_COLLECTION_INITIAL_HTML_FAILED', error);
      this.isCollecting = false;
      throw error;
    }

    // Iniciar monitoramento de navegações
    debugLog('START_COLLECTION_SETTING_UP_NAVIGATION_LISTENER');
    this.setupNavigationListener();
    debugLog('START_COLLECTION_COMPLETE');

    return this.initialSnapshot;
  }

  /**
   * Para a coleta e retorna todos os HTMLs capturados
   */
  async stopCollection(): Promise<HtmlCollection> {
    debugLog('STOP_COLLECTION_CALLED', {
      isCollecting: this.isCollecting,
      navigationCount: this.navigationSnapshots.length,
    });

    if (!this.isCollecting) {
      debugLog('STOP_COLLECTION_NOT_COLLECTING');
      throw new Error('Coleta de HTML não está em andamento');
    }

    // Remover listener de navegação
    debugLog('STOP_COLLECTION_REMOVING_LISTENER');
    this.removeNavigationListener();

    // Capturar HTML final
    debugLog('STOP_COLLECTION_CAPTURING_FINAL_HTML');
    let finalSnapshot: HtmlSnapshot;
    try {
      finalSnapshot = await this.captureHtmlSnapshot('final');
      debugLog('STOP_COLLECTION_FINAL_HTML_CAPTURED', {
        url: finalSnapshot.url,
        sizeBytes: finalSnapshot.sizeBytes,
      });
    } catch (error) {
      debugError('STOP_COLLECTION_FINAL_HTML_FAILED', error);
      throw error;
    }

    if (!this.initialSnapshot) {
      debugLog('STOP_COLLECTION_NO_INITIAL_SNAPSHOT');
      throw new Error('Snapshot inicial não disponível');
    }

    // Calcular hash combinado (Merkle Root de todos os HTMLs)
    debugLog('STOP_COLLECTION_CALCULATING_MERKLE_ROOT');
    const allHashes = [
      this.initialSnapshot.hash,
      ...this.navigationSnapshots.map(s => s.hash),
      finalSnapshot.hash,
    ];
    const combinedHash = await calcularMerkleRoot(allHashes);
    debugLog('STOP_COLLECTION_MERKLE_ROOT_CALCULATED', {
      hashCount: allHashes.length,
      combinedHashPrefix: combinedHash.substring(0, 16),
    });

    // Calcular tamanho total
    const totalSizeBytes =
      this.initialSnapshot.sizeBytes +
      this.navigationSnapshots.reduce((sum, s) => sum + s.sizeBytes, 0) +
      finalSnapshot.sizeBytes;

    this.isCollecting = false;
    debugLog('STOP_COLLECTION_COMPLETE', { totalSizeBytes });

    return {
      initial: this.initialSnapshot,
      final: finalSnapshot,
      navigations: this.navigationSnapshots,
      combinedHash,
      totalSizeBytes,
    };
  }

  /**
   * Cancela a coleta sem retornar resultados
   */
  cancel(): void {
    debugLog('CANCEL_CALLED', { isCollecting: this.isCollecting });
    this.removeNavigationListener();
    this.isCollecting = false;
    this.initialSnapshot = null;
    this.navigationSnapshots = [];
    debugLog('CANCEL_COMPLETE');
  }

  /**
   * Verifica se está coletando
   */
  isActive(): boolean {
    return this.isCollecting;
  }

  /**
   * Retorna o número de navegações capturadas
   */
  getNavigationCount(): number {
    return this.navigationSnapshots.length;
  }

  // ==========================================================================
  // Métodos Privados
  // ==========================================================================

  /**
   * Captura um snapshot HTML da aba atual
   */
  private async captureHtmlSnapshot(type: HtmlSnapshot['type']): Promise<HtmlSnapshot> {
    debugLog('CAPTURE_HTML_SNAPSHOT_START', { type, tabId: this.tabId });
    const capturedAt = new Date().toISOString();

    // Obter informações da aba
    debugLog('CAPTURE_HTML_SNAPSHOT_GETTING_TAB_INFO');
    let tab: chrome.tabs.Tab;
    try {
      tab = await chrome.tabs.get(this.tabId);
      debugLog('CAPTURE_HTML_SNAPSHOT_TAB_INFO_OBTAINED', {
        url: tab.url,
        title: tab.title,
        status: tab.status,
      });
    } catch (error) {
      debugError('CAPTURE_HTML_SNAPSHOT_TAB_INFO_FAILED', error);
      throw error;
    }

    const url = tab.url ?? '';
    const title = tab.title ?? '';

    // Executar script para capturar HTML
    debugLog('CAPTURE_HTML_SNAPSHOT_EXECUTING_SCRIPT', { tabId: this.tabId });
    let results: chrome.scripting.InjectionResult<string>[];
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: () => document.documentElement.outerHTML,
      });
      debugLog('CAPTURE_HTML_SNAPSHOT_SCRIPT_EXECUTED', {
        resultsCount: results.length,
        hasResult: !!results[0]?.result,
        resultLength: results[0]?.result?.length ?? 0,
      });
    } catch (error) {
      debugError('CAPTURE_HTML_SNAPSHOT_SCRIPT_EXECUTION_FAILED', error);
      throw error;
    }

    const content = results[0]?.result ?? '';
    if (!content) {
      debugLog('CAPTURE_HTML_SNAPSHOT_EMPTY_CONTENT');
    }

    const sizeBytes = new Blob([content]).size;
    debugLog('CAPTURE_HTML_SNAPSHOT_CALCULATING_HASH', { sizeBytes });
    
    const hash = await calcularHashSHA256(content);
    debugLog('CAPTURE_HTML_SNAPSHOT_HASH_CALCULATED', {
      hashPrefix: hash.substring(0, 16),
    });

    const snapshot: HtmlSnapshot = {
      type,
      url,
      title,
      content,
      hash,
      sizeBytes,
      capturedAt,
    };

    // Adicionar sequência para navegações
    if (type === 'navigation') {
      this.navigationSequence++;
      snapshot.sequence = this.navigationSequence;
      debugLog('CAPTURE_HTML_SNAPSHOT_NAVIGATION_SEQUENCE', {
        sequence: this.navigationSequence,
      });
    }

    debugLog('CAPTURE_HTML_SNAPSHOT_COMPLETE', { type, url, sizeBytes });
    return snapshot;
  }

  /**
   * Configura listener para detectar navegações
   * 
   * NOTA: Requer permissão 'webNavigation' no manifest.json
   * Se a API não estiver disponível, o monitoramento de navegações é desabilitado
   * mas a coleta de HTML inicial/final continua funcionando.
   */
  private setupNavigationListener(): void {
    debugLog('SETUP_NAVIGATION_LISTENER_START');
    
    // Verificar se a API webNavigation está disponível
    // Pode não estar se a permissão não foi declarada no manifest
    if (!chrome.webNavigation?.onCompleted) {
      debugLog('SETUP_NAVIGATION_LISTENER_API_UNAVAILABLE', {
        reason: 'chrome.webNavigation.onCompleted não disponível',
        hint: 'Adicionar permissão "webNavigation" ao manifest.json',
      });
      // Continuar sem monitoramento de navegações - não é crítico
      return;
    }
    
    this.navigationListener = async (details) => {
      debugLog('NAVIGATION_LISTENER_TRIGGERED', {
        tabId: details.tabId,
        frameId: details.frameId,
        url: details.url,
        isTargetTab: details.tabId === this.tabId,
        isMainFrame: details.frameId === 0,
        isCollecting: this.isCollecting,
      });

      // Ignorar se não for a aba monitorada
      if (details.tabId !== this.tabId) {
        debugLog('NAVIGATION_LISTENER_IGNORED_WRONG_TAB');
        return;
      }

      // Ignorar sub-frames
      if (details.frameId !== 0) {
        debugLog('NAVIGATION_LISTENER_IGNORED_SUBFRAME');
        return;
      }

      // Ignorar se não estiver coletando
      if (!this.isCollecting) {
        debugLog('NAVIGATION_LISTENER_IGNORED_NOT_COLLECTING');
        return;
      }

      // Aguardar página carregar completamente
      debugLog('NAVIGATION_LISTENER_WAITING_PAGE_LOAD');
      await this.waitForPageLoad();

      // Capturar HTML da nova página
      try {
        debugLog('NAVIGATION_LISTENER_CAPTURING_HTML');
        const snapshot = await this.captureHtmlSnapshot('navigation');
        this.navigationSnapshots.push(snapshot);
        debugLog('NAVIGATION_LISTENER_HTML_CAPTURED', {
          url: snapshot.url,
          totalNavigations: this.navigationSnapshots.length,
        });
      } catch (error) {
        debugError('NAVIGATION_LISTENER_CAPTURE_FAILED', error);
      }
    };

    // Registrar listener para navegações completas
    chrome.webNavigation.onCompleted.addListener(this.navigationListener);
    debugLog('SETUP_NAVIGATION_LISTENER_COMPLETE');
  }

  /**
   * Remove listener de navegação
   */
  private removeNavigationListener(): void {
    debugLog('REMOVE_NAVIGATION_LISTENER_START', {
      hasListener: !!this.navigationListener,
    });
    
    if (this.navigationListener && chrome.webNavigation?.onCompleted) {
      chrome.webNavigation.onCompleted.removeListener(this.navigationListener);
      this.navigationListener = null;
      debugLog('REMOVE_NAVIGATION_LISTENER_REMOVED');
    }
    
    debugLog('REMOVE_NAVIGATION_LISTENER_COMPLETE');
  }

  /**
   * Aguarda a página carregar completamente
   */
  private async waitForPageLoad(): Promise<void> {
    debugLog('WAIT_FOR_PAGE_LOAD_START');
    return new Promise((resolve) => {
      // Aguardar um pouco para garantir que a página carregou
      setTimeout(() => {
        debugLog('WAIT_FOR_PAGE_LOAD_COMPLETE');
        resolve();
      }, 500);
    });
  }
}

/**
 * Cria uma instância do serviço de coleta de HTML
 */
export function createHtmlCollectionService(tabId: number): HtmlCollectionService {
  return new HtmlCollectionService(tabId);
}
