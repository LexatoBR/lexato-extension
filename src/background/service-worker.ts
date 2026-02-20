/**
 * Service Worker da Extensão Chrome Lexato (Manifest V3)
 *
 * Gerencia autenticação, comunicação com API e orquestração de capturas.
 * Executa em background como ES module (type: 'module').
 *
 * Requisitos atendidos:
 * - 3.1: Gerenciamento de tokens de autenticação
 * - 3.2: Refresh automático de tokens antes da expiração
 * - 3.4: Orquestração do fluxo de captura
 * - 3.5: Gerenciamento de mensagens entre popup e content scripts
 * - 3.6: Persistência de estado para recuperação
 * - 3.7: Retry com backoff exponencial e jitter (30%)
 * - 3.8: Handler global para unhandledRejection
 * - 3.9: Geração de correlationId único para rastreabilidade
 * - 3.10: Renovação automática de token durante captura
 *
 * @module ServiceWorker
 */

// ============================================================================
// IMPORTAÇÃO CRÍTICA: Polyfills devem ser carregados PRIMEIRO
// ============================================================================
// Este import aplica polyfills necessários para compatibilidade com bibliotecas
// que acessam APIs do DOM (como Axios que acessa document.cookie).
// NUNCA mova esta importação para depois de outras importações!
// ============================================================================
import './service-worker-polyfills';

// ============================================================================
// SENTRY: Monitoramento de erros (deve ser inicializado cedo)
// ============================================================================
import { initSentry, captureException, addBreadcrumb, setUser } from '../lib/sentry';

// Inicializa Sentry para o Service Worker
initSentry({
  context: 'service-worker',
  additionalTags: {
    manifest_version: '3',
  },
});

import { AuditLogger } from '../lib/audit-logger';
import { RetryHandler } from '../lib/retry-handler';
import { ErrorCodes, fromError } from '../lib/errors';
import { verificarUrlBloqueada } from '../lib/blocked-urls';
// NOTA: cognito.service usa AWS SDK que não funciona em service workers (document is not defined)
// Usar imports dinâmicos apenas quando necessário, ou preferir API HTTP via backend

import { ExtensionIsolationManager } from './extension-isolation-manager';
import { getNotificationManager } from './notification-manager';
import { UploadHandler, createUploadHandler } from './upload-handler';
import { getAuthManager } from './auth-manager-export';
import type { UploadFile, UploadProgress } from './upload-handler';
import { APIClient, getAPIClient, initSupabaseFunctionsClient } from './api-client';
import { getSupabaseClient } from '../lib/supabase/client';
import { getApiUrl } from '../config/environment';
import { encrypt, decrypt, isEncrypted } from '../lib/crypto/storage-encryption';
import type {
  Message,
  MessageResponse,
  MessageType,
  StartCapturePayload,
  LoginPayload,
  CaptureState,
  PersistedCaptureState,
  AuthStatusResponse,
} from '../types/api.types';
import type { AuthTokens, AuthUser } from '../types/auth.types';
import type {
  StorageType,
  CaptureStatus,
  CaptureMetadata,
  CaptureData as _CaptureData
} from '../types/capture.types';
import { calcularMerkleRoot } from '../lib/evidence-pipeline/crypto-helper';
import type { TimestampResult as _TimestampResult } from '../lib/evidence-pipeline/types';

import { createEvidencePipeline, ensureAPIClientInitialized, isAPIClientInitialized } from '../lib/evidence-pipeline';
import type { StorageConfig } from '../lib/evidence-pipeline/types';
import { TimestampService } from '../lib/evidence-pipeline/timestamp-service';

// Importar módulos refatorados
import {
  STORAGE_KEYS,
  AUTH_CONFIG,
  FRONTEND_URL,
  PREVIEW_ALARM_CONFIG,
  BADGE_CONFIG,
} from './utils/constants';
import { supabase } from '../lib/supabase';
// Nota: Os módulos abaixo estão disponíveis para refatoração futura do startCapture
// import { getErrorMessage, createErrorDetails } from './utils/error-helpers';
import { refreshState } from './state/service-worker-state';
import { startCaptureFlow, type CaptureFlowDependencies } from './handlers/capture.handler';
import { isOriginAllowed } from './origin-validation';

// Badge progress para indicador de progresso no ícone da extensão
// Requirements 20.1-20.5
import {
  updateBadgeProgress,
  blinkBadgeOnComplete,
  clearBadgeProgress,
  setBadgeError,
} from './badge-progress';

// Handler de notificacoes (Supabase Realtime)
import { notificationHandler } from './handlers/notification.handler';

// RecordingStateManager - import estático para evitar erro de dynamic import em Service Worker
// Service Workers MV3 não suportam import() dinâmico
import { getRecordingStateManager } from './recording-state-manager';

// Realtime para mudancas de status de evidencias (postgres_changes)
import {
  EvidenceRealtimeClient,
  createEvidenceRealtimeClient,
  getStatusNotificationTitle,
  getStatusNotificationMessage,
} from '../lib/notifications/evidence-realtime-client';
import type { EvidenceRecord, EvidenceStatus } from '../lib/notifications/evidence-realtime-client';

// Verificacao de versao da extensao via tabela extension_versions
import {
  checkExtensionVersionStatus,
  clearVersionCheckCache,
} from '../lib/notifications/version-check-client';

// ============================================================================
// Variáveis de Estado (mantidas para compatibilidade)
// ============================================================================

/**
 * Logger global do Service Worker
 */
let globalLogger: AuditLogger | null = null;

/**
 * Estado de captura em andamento
 */
let currentCaptureState: CaptureState | null = null;

/**
 * Instância global do APIClient para comunicação com backend
 */
let apiClientInstance: APIClient | null = null;

/**
 * Instância global do UploadHandler para uploads S3
 */
let uploadHandlerInstance: UploadHandler | null = null;

/**
 * Flag para indicar se refresh está em andamento
 */
let isRefreshing = false;

/**
 * Instância global do ExtensionIsolationManager
 * Gerencia isolamento de extensões durante captura
 */
let isolationManager: ExtensionIsolationManager | null = null;

/**
 * Instancia global do EvidenceRealtimeClient
 * Monitora mudancas de status de evidencias via Supabase Realtime
 */
let evidenceRealtimeClient: EvidenceRealtimeClient | null = null;

/**
 * Nome do alarme de verificacao periodica de versao
 */
const VERSION_CHECK_ALARM_NAME = 'lexato_version_check';

/**
 * Nome do alarme de auto-stop de gravação de vídeo (30 minutos)
 * Usa chrome.alarms para sobreviver ao restart do service worker no MV3
 */
const VIDEO_AUTO_STOP_ALARM_NAME = 'lexato_video_auto_stop';

/**
 * Stream ID pré-capturado via tabCapture no momento do clique no ícone.
 *
 * O chrome.tabCapture.getMediaStreamId() requer user gesture (equivalente a activeTab).
 * O Side Panel NÃO concede esse gesto, mas o clique no ícone da extensão SIM.
 * Pré-capturamos o streamId no onClicked e guardamos para uso posterior
 * quando o usuário iniciar a captura de vídeo no Side Panel.
 *
 * Se o streamId estiver expirado ou a aba tiver mudado, o offscreen faz
 * fallback para getDisplayMedia({ preferCurrentTab: true }).
 */
let preCapturedStreamId: { streamId: string; tabId: number; timestamp: number } | null = null;

/**
 * Intervalo de verificacao de versao em minutos (1 hora)
 */
const VERSION_CHECK_INTERVAL_MINUTES = 60;

/**
 * Obtém ou cria instância do ExtensionIsolationManager
 */
function getIsolationManager(logger?: AuditLogger): ExtensionIsolationManager {
  if (!isolationManager) {
    const managerLogger = logger ?? getLogger();
    isolationManager = new ExtensionIsolationManager(managerLogger);
  }
  return isolationManager;
}

/**
 * Instância do Pipeline de Evidências (Novo Orquestrador)
 * Usa lazy initialization para evitar erro de APIClient não inicializado
 */
let _evidencePipeline: ReturnType<typeof createEvidencePipeline> | null = null;

/**
 * Pipeline ativo atual para permitir cancelamento
 * Armazena referência ao pipeline em execução para que possa ser cancelado via CAPTURE_CANCEL
 */
let _activePipeline: ReturnType<typeof createEvidencePipeline> | null = null;

/**
 * Obtém ou cria instância do EvidencePipeline (lazy initialization)
 *
 * IMPORTANTE: Garante que o APIClient está inicializado antes de criar o pipeline.
 * Isso sincroniza os dois sistemas de inicialização (getAPIClientInstance e ensureAPIClientInitialized).
 */
export function getEvidencePipeline(): ReturnType<typeof createEvidencePipeline> {
  if (!_evidencePipeline) {
    // Garantir que o APIClient do pipeline está inicializado com a mesma config
    // que o getAPIClientInstance() usa
    if (!isAPIClientInitialized()) {
      ensureAPIClientInitialized({
        baseURL: getApiUrl(),
        getTokens: getStoredTokens,
        refreshToken: async () => {
          const logger = getLogger();
          return await refreshAccessToken(logger);
        },
        getCorrelationId: generateCorrelationId,
        logger: getLogger(),
      });
    }

    _evidencePipeline = createEvidencePipeline();
  }
  return _evidencePipeline;
}

/**
 * Define o pipeline ativo atual
 * Usado para permitir cancelamento via CAPTURE_CANCEL
 */
export function setActivePipeline(pipeline: ReturnType<typeof createEvidencePipeline> | null): void {
  _activePipeline = pipeline;
}

/**
 * Obtém o pipeline ativo atual
 * Usado para cancelar captura em andamento
 */
export function getActivePipeline(): ReturnType<typeof createEvidencePipeline> | null {
  return _activePipeline;
}

export {
  isolationManager, // Exportar para uso em testes
};
import { getSidePanelHandler } from './sidepanel-handler';
import { getTabIsolationManager, getExtensionIsolationManager } from './managers/isolation-managers';

// ============================================================================
// Listeners Top-Level para Tab Isolation
// DEVEM ser registrados sincrornamente no início do script
// ============================================================================

// Listener para fechar novas abas se isolamento estiver ativo
chrome.tabs.onCreated.addListener(async (tab) => {
  const manager = getTabIsolationManager();

  // Se isolamento não estiver ativo, ignorar
  if (!manager.isActive()) {
    return;
  }

  const startTime = performance.now();
  const state = manager.getState();

  // Verificar se é a aba de gravação (permitida)
  if (tab.id === state.recordingTabId) {
    return;
  }

  // Fechar aba imediatamente
  if (tab.id) {
    try {
      await chrome.tabs.remove(tab.id);

      const reactionTime = performance.now() - startTime;

      // Registrar tentativa
      // chrome://newtab/ geralmente é atalho de teclado
      const isShortcut = tab.pendingUrl === 'chrome://newtab/' || tab.url === 'chrome://newtab/';

      await manager.logBlockedAttempt({
        type: isShortcut ? 'keyboard_shortcut_probable' : 'new_tab',
        attemptedUrl: tab.pendingUrl ?? tab.url ?? 'unknown',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: reactionTime,
      });

      // Notificar overlay (se implementado)
      chrome.runtime.sendMessage({
        type: 'TAB_BLOCKED_NOTIFICATION',
        message: 'Aba bloqueada pelo modo forense',
      }).catch(() => {
        // Ignorar erro se não houver listener (overlay fechado)
      });

    } catch (error) {
      console.error('[TabIsolation] Falha ao fechar aba:', error);
      captureException(error, { context: 'tab_isolation_close' });
    }
  }
});

// Listener para fechar novas janelas se isolamento estiver ativo
chrome.windows.onCreated.addListener(async (window) => {
  const manager = getTabIsolationManager();

  if (!manager.isActive()) {
    return;
  }

  const startTime = performance.now();
  const state = manager.getState();

  // Verificar se é a janela de gravação
  if (window.id === state.recordingWindowId) {
    return;
  }

  // Fechar janela imediatamente
  if (window.id) {
    try {
      await chrome.windows.remove(window.id);

      const reactionTime = performance.now() - startTime;

      await manager.logBlockedAttempt({
        type: 'new_window',
        timestamp: new Date().toISOString(),
        action: 'closed',
        reactionTimeMs: reactionTime,
      });

    } catch (error) {
      console.error('[TabIsolation] Falha ao fechar janela:', error);
      captureException(error, { context: 'window_isolation_close' });
    }
  }
});

/**
 * Inicializa o ExtensionIsolationManager e verifica snapshots pendentes
 * Chamado no startup do Service Worker
 * Requirement 8.2
 */
async function initializeIsolationManager(): Promise<void> {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  try {
    const manager = getIsolationManager(logger);
    await manager.checkPendingSnapshots();
    logger.info('ISOLATION', 'MANAGER_INITIALIZED', {
      correlationId,
    });
  } catch (error) {
    logger.error('ISOLATION', 'MANAGER_INIT_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

// ============================================================================
// Inicializacao do Evidence Realtime Client
// ============================================================================

/**
 * Inicializa o cliente Realtime para monitorar mudancas de status de evidencias
 * Deve ser chamado apos autenticacao bem-sucedida
 */
async function initializeEvidenceRealtime(): Promise<void> {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  try {
    // Desconectar cliente anterior se existir
    await disconnectEvidenceRealtime();

    // Obter usuario autenticado
    const supabaseClient = getSupabaseClient();
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user?.id) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Usuario nao autenticado, pulando inicializacao do Evidence Realtime',
        level: 'warning',
      });
      return;
    }

    addBreadcrumb({
      category: 'evidence-realtime',
      message: `Inicializando Evidence Realtime para usuario ${user.id}`,
      level: 'info',
    });

    // Criar cliente
    evidenceRealtimeClient = createEvidenceRealtimeClient({ userId: user.id });

    // Registrar callback para mudancas de status
    evidenceRealtimeClient.onStatusChange(
      (oldRecord: Partial<EvidenceRecord>, newRecord: EvidenceRecord) => {
        handleEvidenceStatusChange(oldRecord, newRecord);
      }
    );

    // Subscrever ao canal
    await evidenceRealtimeClient.subscribe();

    logger.info('GENERAL', 'EVIDENCE_REALTIME_INITIALIZED', {
      userId: user.id,
    });
  } catch (error) {
    // Realtime eh opcional, nao deve bloquear a extensao
    logger.error('GENERAL', 'EVIDENCE_REALTIME_INIT_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    captureException(error);
  }
}

/**
 * Desconecta o cliente Realtime de evidencias
 * Deve ser chamado no logout
 */
async function disconnectEvidenceRealtime(): Promise<void> {
  if (evidenceRealtimeClient) {
    addBreadcrumb({
      category: 'evidence-realtime',
      message: 'Desconectando Evidence Realtime',
      level: 'info',
    });

    await evidenceRealtimeClient.unsubscribe();
    evidenceRealtimeClient = null;
  }
}

/**
 * Processa mudanca de status de evidencia recebida via Realtime
 * Atualiza badge e envia notificacao ao usuario
 */
function handleEvidenceStatusChange(
  oldRecord: Partial<EvidenceRecord>,
  newRecord: EvidenceRecord
): void {
  const oldStatus = oldRecord.status as EvidenceStatus | undefined;
  const newStatus = newRecord.status;

  // Ignorar se o status nao mudou
  if (oldStatus === newStatus) {
    return;
  }

  addBreadcrumb({
    category: 'evidence-realtime',
    message: `Status de evidencia mudou: ${oldStatus ?? 'desconhecido'} -> ${newStatus}`,
    level: 'info',
    data: {
      evidenceId: newRecord.id,
      oldStatus,
      newStatus,
      type: newRecord.type,
    },
  });

  // Enviar notificacao via NotificationManager
  const notificationManager = getNotificationManager();
  const title = getStatusNotificationTitle(newStatus);
  const message = getStatusNotificationMessage(newStatus);

  // Determinar tipo de notificacao baseado no status
  if (newStatus === 'certified') {
    notificationManager.notifyCertificationReady(newRecord.id).catch((err) => {
      captureException(err);
    });
  } else if (newStatus === 'error') {
    notificationManager.notifyError(title, message, newRecord.id).catch((err) => {
      captureException(err);
    });
  } else if (newStatus === 'expired' || newStatus === 'discarded') {
    notificationManager.notifyWarning(title, message).catch((err) => {
      captureException(err);
    });
  } else {
    notificationManager.notifyInfo(title, message).catch((err) => {
      captureException(err);
    });
  }
}

// ============================================================================
// Verificacao de Versao da Extensao
// ============================================================================

/**
 * Executa verificacao de versao da extensao e toma acoes apropriadas
 * - deprecated: Exibe aviso ao usuario
 * - revoked: Bloqueia capturas
 */
async function executeVersionCheck(): Promise<void> {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  try {
    const result = await checkExtensionVersionStatus();

    addBreadcrumb({
      category: 'version-check',
      message: `Resultado da verificacao de versao: ${result.status}`,
      level: 'info',
      data: { status: result.status },
    });

    if (result.status === 'deprecated') {
      logger.warn('GENERAL', 'EXTENSION_VERSION_DEPRECATED', {
        message: result.message,
      });

      // Exibir aviso ao usuario
      const notificationManager = getNotificationManager();
      await notificationManager.notifyWarning(
        'Versao Depreciada',
        result.message ?? 'Atualize a extensao para a versao mais recente.'
      );

      // Salvar status no storage para que popup/sidepanel possam exibir aviso
      await chrome.storage.local.set({
        'lexato:version-status': result,
      });
    } else if (result.status === 'revoked') {
      logger.error('GENERAL', 'EXTENSION_VERSION_REVOKED', {
        message: result.message,
        reason: result.revocationReason,
      });

      // Exibir erro ao usuario
      const notificationManager = getNotificationManager();
      await notificationManager.notifyError(
        'Versao Revogada',
        result.message ?? 'Esta versao da extensao foi revogada. Atualize imediatamente.'
      );

      // Salvar status no storage para bloquear capturas
      await chrome.storage.local.set({
        'lexato:version-status': result,
      });
    } else {
      // Versao ativa - limpar status anterior se existir
      await chrome.storage.local.remove('lexato:version-status');
    }
  } catch (error) {
    logger.error('GENERAL', 'VERSION_CHECK_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    captureException(error);
  }
}

/**
 * Configura alarme para verificacao periodica de versao (a cada 1 hora)
 */
async function setupVersionCheckAlarm(): Promise<void> {
  try {
    await chrome.alarms.create(VERSION_CHECK_ALARM_NAME, {
      delayInMinutes: 1, // Primeira verificacao em 1 minuto
      periodInMinutes: VERSION_CHECK_INTERVAL_MINUTES,
    });

    addBreadcrumb({
      category: 'version-check',
      message: `Alarme de verificacao de versao configurado (a cada ${VERSION_CHECK_INTERVAL_MINUTES} min)`,
      level: 'info',
    });
  } catch (error) {
    captureException(error);
  }
}

/**
 * Verifica se uma string tem formato JWT válido
 * JWT válido tem 3 partes separadas por ponto e começa com "eyJ"
 * @param token - String a ser validada
 * @returns true se parece ser um JWT válido
 */
function isValidJwtFormat(token: string | undefined | null): boolean {
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

  // Token JWT típico tem mais de 100 caracteres
  if (token.length < 100) {
    return false;
  }

  return true;
}

/**
 * Inicializa o handler de notificações
 * Só inicializa se houver tokens válidos para evitar erro 403
 */
async function initializeNotificationHandler(): Promise<void> {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  try {
    // Verificar se há tokens válidos antes de inicializar
    const tokens = await getStoredTokens();
    const hasValidToken = isValidJwtFormat(tokens?.idToken) || isValidJwtFormat(tokens?.accessToken);

    if (!hasValidToken) {
      logger.info('GENERAL', 'SKIP_NOTIFICATION_HANDLER_NO_AUTH', {
        hasIdToken: !!tokens?.idToken,
        hasAccessToken: !!tokens?.accessToken,
        idTokenLength: tokens?.idToken?.length ?? 0,
        idTokenPrefix: tokens?.idToken?.substring(0, 20) ?? 'N/A',
      });
      return;
    }

    // Inicializa handler de notificacoes via Supabase Realtime
    await notificationHandler.initialize();
    logger.info('GENERAL', 'NOTIFICATION_HANDLER_INITIALIZED', {
      reason: 'Sistema migrado para Supabase Realtime',
    });
  } catch (error) {
    logger.error('GENERAL', 'INIT_NOTIFICATION_HANDLER_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    captureException(error);
  }
}

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Gera um correlationId único para rastreabilidade
 * Formato: UUID v4
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Obtém ou cria logger global
 */
function getLogger(correlationId?: string): AuditLogger {
  if (!globalLogger || correlationId) {
    globalLogger = new AuditLogger(correlationId);
  }
  return globalLogger;
}

/**
 * Obtém ou cria instância do APIClient
 * Configura cliente para comunicação com backend Lexato
 */
function getAPIClientInstance(): APIClient {
  // Reutilizar instância existente se já foi criada
  if (apiClientInstance) {
    return apiClientInstance;
  }
  
  // Inicializar singleton global do APIClient
  apiClientInstance = getAPIClient({
    baseURL: getApiUrl(),
    getTokens: getStoredTokens,
    refreshToken: async () => {
      const logger = getLogger();
      return await refreshAccessToken(logger);
    },
    getCorrelationId: generateCorrelationId,
    logger: getLogger(),
  });
  return apiClientInstance;
}

// Inicializar SupabaseFunctionsClient para chamadas a Edge Functions
// Usa import estatico do getSupabaseClient (Service Workers MV3 nao suportam import dinamico)
initSupabaseFunctionsClient(getSupabaseClient);

/**
 * Obtém ou cria instância do UploadHandler
 * Configura handler para uploads S3 via presigned URLs
 */
function getUploadHandlerInstance(): UploadHandler {
  uploadHandlerInstance ??= createUploadHandler({
    apiClient: getAPIClientInstance(),
    logger: getLogger(),
    maxRetries: 3,
    uploadTimeout: 120000,
  });
  return uploadHandlerInstance;
}

/**
 * Resultado do upload de captura
 */
interface UploadCapturaResult {
  /** Se o upload foi bem-sucedido */
  success: boolean;
  /** URL do screenshot no S3 */
  screenshotUrl?: string | undefined;
  /** 
   * URL do HTML no S3 (compatibilidade)
   * Para vídeos, use htmlUrls para estrutura completa
   */
  htmlUrl?: string | undefined;
  /**
   * URLs dos HTMLs capturados (vídeos)
   * Estrutura completa com inicial, final e navegações
   */
  htmlUrls?: {
    initial: string;
    final: string;
    navigations: string[];
  };
  /** URL dos metadados no S3 */
  metadataUrl?: string | undefined;
  /** Mensagem de erro (se falha) */
  error?: string | undefined;
}

/**
 * Dados da captura para upload
 */
interface DadosCapturaUpload {
  /** Dados da imagem em Base64 */
  imageData?: string;
  /** Hash da imagem */
  imageHash?: string;
  /** Conteúdo HTML da página */
  htmlContent?: string;
  /** Hash do HTML */
  htmlHash?: string;
  /** Metadados da captura */
  metadata?: CaptureMetadata;
  /** Hash dos metadados */
  metadataHash?: string;

  // Campos para preview
  /** URL original capturada */
  originalUrl?: string;
  /** Título da página capturada */
  pageTitle?: string;
  /** Tipo de captura */
  captureType?: 'SCREENSHOT' | 'VIDEO';
}

/**
 * Executa upload dos arquivos de captura para S3
 * 
 * Fluxo:
 * 1. Solicita presigned URLs para cada arquivo
 * 2. Faz upload via PUT para S3
 * 3. Notifica backend após conclusão
 * 
 * @param captureId - ID único da captura
 * @param storageType - Tipo de armazenamento (standard, premium_5y, etc.)
 * @param dados - Dados da captura (imagem, HTML, metadados)
 * @param logger - Logger para auditoria
 * @returns Resultado do upload com URLs dos arquivos
 */
async function executarUploadCaptura(
  captureId: string,
  storageType: StorageType,
  dados: DadosCapturaUpload,
  logger: AuditLogger
): Promise<UploadCapturaResult> {
  addBreadcrumb({
    category: 'service-worker',
    message: 'executarUploadCaptura iniciado',
    level: 'info',
    data: { captureId, storageType, temImagem: !!dados.imageData, temHtml: !!dados.htmlContent, temMetadados: !!dados.metadata },
  });

  logger.info('UPLOAD', 'UPLOAD_CAPTURA_INICIADO', {
    captureId,
    storageType,
    temImagem: !!dados.imageData,
    temHtml: !!dados.htmlContent,
    temMetadados: !!dados.metadata,
  });

  try {
    addBreadcrumb({ category: 'service-worker', message: 'Obtendo instancia do UploadHandler', level: 'info' });
    const uploadHandler = getUploadHandlerInstance();
    addBreadcrumb({ category: 'service-worker', message: 'UploadHandler obtido', level: 'info' });

    const arquivosParaUpload: UploadFile[] = [];

    // Preparar arquivo de screenshot
    // PNG para integridade forense (compressão sem perdas, validade jurídica)
    if (dados.imageData) {
      addBreadcrumb({ category: 'service-worker', message: 'Preparando arquivo de screenshot', level: 'info' });
      arquivosParaUpload.push({
        type: 'screenshot',
        data: dados.imageData,
        contentType: 'image/png',
        fileName: `${captureId}-screenshot.png`,
      });
    }

    // Preparar arquivo HTML
    if (dados.htmlContent) {
      addBreadcrumb({ category: 'service-worker', message: 'Preparando arquivo HTML', level: 'info' });
      arquivosParaUpload.push({
        type: 'html',
        data: dados.htmlContent,
        contentType: 'text/html; charset=utf-8',
        fileName: `${captureId}-page.html`,
      });
    }

    // Preparar arquivo de metadados
    if (dados.metadata) {
      addBreadcrumb({ category: 'service-worker', message: 'Preparando arquivo de metadados', level: 'info' });
      const metadataJson = JSON.stringify({
        ...dados.metadata,
        captureId,
        storageType,
        hashes: {
          imageHash: dados.imageHash,
          htmlHash: dados.htmlHash,
          metadataHash: dados.metadataHash,
        },
      }, null, 2);

      arquivosParaUpload.push({
        type: 'metadata',
        data: metadataJson,
        contentType: 'application/json',
        fileName: `${captureId}-metadata.json`,
      });
    }

    addBreadcrumb({ category: 'service-worker', message: `Arquivos preparados: ${arquivosParaUpload.length}`, level: 'info' });

    if (arquivosParaUpload.length === 0) {
      addBreadcrumb({ category: 'service-worker', message: 'Nenhum arquivo para upload', level: 'warning' });
      logger.warn('UPLOAD', 'NENHUM_ARQUIVO_PARA_UPLOAD', { captureId });
      return {
        success: false,
        error: 'Nenhum arquivo disponível para upload',
      };
    }

    logger.info('UPLOAD', 'ARQUIVOS_PREPARADOS', {
      captureId,
      totalArquivos: arquivosParaUpload.length,
      tipos: arquivosParaUpload.map(a => a.type),
    });

    // Callback de progresso para atualizar estado da captura
    const onProgress = async (progress: UploadProgress) => {
      addBreadcrumb({
        category: 'service-worker',
        message: `Upload progresso: ${progress.fileType} ${progress.percent}%`,
        level: 'info',
      });

      logger.info('UPLOAD', 'PROGRESSO_UPLOAD', {
        captureId,
        fileType: progress.fileType,
        percent: progress.percent,
        message: progress.message,
        attempt: progress.attempt,
      });

      // Atualizar estado da captura com progresso
      if (currentCaptureState) {
        const baseProgress = 70; // Captura já está em 70%
        const uploadProgress = Math.round((progress.percent / 100) * 25); // Upload é 25% do total
        currentCaptureState.progress = baseProgress + uploadProgress;
        currentCaptureState.progressMessage = `Enviando ${progress.fileType}: ${progress.percent}%`;
        await persistCaptureState(currentCaptureState);
      }
    };

    addBreadcrumb({ category: 'service-worker', message: 'Chamando uploadHandler.uploadFiles()', level: 'info' });

    // Executar upload em batch
    const batchResult = await uploadHandler.uploadFiles(
      captureId,
      storageType,
      arquivosParaUpload,
      onProgress
    );

    addBreadcrumb({
      category: 'service-worker',
      message: 'Batch upload resultado',
      level: 'info',
      data: {
        success: batchResult.success,
        successCount: batchResult.successCount,
        failedCount: batchResult.failedCount,
        error: batchResult.error,
      },
    });

    logger.info('UPLOAD', 'BATCH_UPLOAD_RESULTADO', {
      captureId,
      success: batchResult.success,
      totalFiles: batchResult.totalFiles,
      successCount: batchResult.successCount,
      failedCount: batchResult.failedCount,
    });

    // Extrair URLs dos resultados
    const screenshotResult = batchResult.results.find(r => r.fileType === 'screenshot');
    const htmlResult = batchResult.results.find(r => r.fileType === 'html');
    const metadataResult = batchResult.results.find(r => r.fileType === 'metadata');

    addBreadcrumb({
      category: 'service-worker',
      message: 'Resultados individuais de upload',
      level: 'info',
      data: {
        screenshotOk: screenshotResult?.success,
        htmlOk: htmlResult?.success,
        metadataOk: metadataResult?.success,
      },
    });

    // Notificar backend sobre conclusão do upload
    if (batchResult.successCount > 0) {
      addBreadcrumb({ category: 'service-worker', message: 'Notificando backend sobre upload', level: 'info' });

      const arquivosEnviados = batchResult.results
        .filter((r): r is typeof r & { objectKey: string; downloadUrl: string } =>
          r.success && typeof r.objectKey === 'string' && typeof r.downloadUrl === 'string')
        .map(r => ({
          type: r.fileType,
          objectKey: r.objectKey,
          downloadUrl: r.downloadUrl,
          contentType: arquivosParaUpload.find(a => a.type === r.fileType)?.contentType ?? 'application/octet-stream',
          sizeBytes: 0, // TODO: Calcular tamanho real
        }));

      try {
        // Monta objeto de notificação para o backend
        // Usa construção condicional para evitar problemas com exactOptionalPropertyTypes
        const notification: Parameters<typeof uploadHandler.notifyUploadComplete>[0] = {
          captureId,
          storageType,
          files: arquivosEnviados,
          completedAt: new Date().toISOString(),
        };

        // Adiciona campos opcionais apenas se definidos
        if (dados.originalUrl) {
          notification.originalUrl = dados.originalUrl;
        }
        if (dados.pageTitle) {
          notification.pageTitle = dados.pageTitle;
        }
        if (dados.captureType) {
          notification.captureType = dados.captureType;
        } else {
          notification.captureType = 'SCREENSHOT';
        }
        if (dados.imageHash) {
          notification.contentHash = dados.imageHash;
        }
        if (dados.metadata?.viewport) {
          notification.dimensions = {
            width: dados.metadata.viewport.width,
            height: dados.metadata.viewport.height,
          };
        }

        const notificado = await uploadHandler.notifyUploadComplete(notification);

        if (notificado) {
          addBreadcrumb({ category: 'service-worker', message: 'Backend notificado com sucesso', level: 'info' });
          logger.info('UPLOAD', 'BACKEND_NOTIFICADO', {
            captureId,
            arquivosEnviados: arquivosEnviados.length,
            hasPreviewData: !!(dados.originalUrl && dados.pageTitle),
          });
        } else {
          addBreadcrumb({ category: 'service-worker', message: 'Falha ao notificar backend (sem excecao)', level: 'warning' });
          logger.warn('UPLOAD', 'BACKEND_NAO_NOTIFICADO', {
            captureId,
            arquivosEnviados: arquivosEnviados.length,
            hasPreviewData: !!(dados.originalUrl && dados.pageTitle),
          });
        }
      } catch (notifyError) {
        addBreadcrumb({ category: 'service-worker', message: 'Falha ao notificar backend', level: 'warning' });
        // Falha na notificação não deve falhar o upload
        logger.warn('UPLOAD', 'FALHA_NOTIFICACAO_BACKEND', {
          captureId,
          error: notifyError instanceof Error ? notifyError.message : 'Erro desconhecido',
        });
      }
    }

    addBreadcrumb({
      category: 'service-worker',
      message: 'executarUploadCaptura finalizado',
      level: 'info',
      data: { success: batchResult.success },
    });

    return {
      success: batchResult.success,
      screenshotUrl: screenshotResult?.downloadUrl,
      htmlUrl: htmlResult?.downloadUrl,
      metadataUrl: metadataResult?.downloadUrl,
      error: batchResult.error,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';

    captureException(error, { context: 'executarUploadCaptura', captureId });

    logger.error('UPLOAD', 'UPLOAD_CAPTURA_ERRO', {
      captureId,
      error: errorMsg,
    });

    return {
      success: false,
      error: `Falha no upload: ${errorMsg}`,
    };
  }
}

/**
 * Executa função com retry usando RetryHandler
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  serviceType: string,
  logger: AuditLogger
): Promise<T> {
  const retryHandler = new RetryHandler(serviceType);

  return retryHandler.execute(fn, (info) => {
    logger.warn('GENERAL', 'RETRY_ATTEMPT', {
      attempt: info.attempt,
      maxAttempts: info.maxAttempts,
      delayMs: info.delayMs,
      error: info.error?.message,
    });
  });
}

/**
 * Configuração de reload da página
 */
const RELOAD_CONFIG = {
  /** Timeout máximo para aguardar carregamento da página (60 segundos) */
  PAGE_LOAD_TIMEOUT_MS: 60000,
  /** Delay adicional após status 'complete' para garantir estabilidade (500ms) */
  POST_LOAD_DELAY_MS: 500,
};

/**
 * Verifica se temos permissões de host permanentes para a URL
 * 
 * No MV3, host_permissions são permanentes e não são revogadas após reload,
 * diferente do activeTab que é temporário. Porém, o usuário pode ter
 * restringido as permissões para "On click" ou sites específicos.
 * 
 * @param url - URL da página a ser capturada
 * @param logger - Logger para auditoria
 * @returns Objeto com status da permissão e detalhes
 */
async function verificarPermissaoHost(
  url: string,
  logger: AuditLogger
): Promise<{
  temPermissao: boolean;
  origem: string;
  detalhes: {
    permissaoOrigem: boolean;
    permissaoHttpsWildcard: boolean;
    permissaoHttpWildcard: boolean;
  };
}> {
  try {
    const urlObj = new URL(url);
    const origem = urlObj.origin;

    // Verificar permissões em paralelo
    const [permissaoOrigem, permissaoHttpsWildcard, permissaoHttpWildcard] = await Promise.all([
      chrome.permissions.contains({ origins: [`${origem}/*`] }),
      chrome.permissions.contains({ origins: ['https://*/*'] }),
      chrome.permissions.contains({ origins: ['http://*/*'] }),
    ]);

    // Determinar se temos permissão efetiva
    const temPermissao = permissaoOrigem ||
      (urlObj.protocol === 'https:' && permissaoHttpsWildcard) ||
      (urlObj.protocol === 'http:' && permissaoHttpWildcard);

    logger.info('CAPTURE', 'HOST_PERMISSION_CHECK', {
      url,
      origem,
      temPermissao,
      permissaoOrigem,
      permissaoHttpsWildcard,
      permissaoHttpWildcard,
    });

    return {
      temPermissao,
      origem,
      detalhes: {
        permissaoOrigem,
        permissaoHttpsWildcard,
        permissaoHttpWildcard,
      },
    };
  } catch (error) {
    logger.error('CAPTURE', 'HOST_PERMISSION_CHECK_ERROR', {
      url,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    return {
      temPermissao: false,
      origem: '',
      detalhes: {
        permissaoOrigem: false,
        permissaoHttpsWildcard: false,
        permissaoHttpWildcard: false,
      },
    };
  }
}

/**
 * Solicita permissão de host ao usuário se necessário
 * 
 * Esta função deve ser chamada em resposta a um gesto do usuário (clique).
 * Se o usuário já concedeu permissão, retorna true imediatamente.
 * 
 * @param url - URL para a qual solicitar permissão
 * @param logger - Logger para auditoria
 * @returns true se permissão foi concedida, false caso contrário
 */
async function solicitarPermissaoHost(
  url: string,
  logger: AuditLogger
): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origem = urlObj.origin;

    logger.info('CAPTURE', 'HOST_PERMISSION_REQUEST_START', { origem });

    // Solicitar permissão para a origem específica
    const concedida = await chrome.permissions.request({
      origins: [`${origem}/*`],
    });

    logger.info('CAPTURE', 'HOST_PERMISSION_REQUEST_RESULT', {
      origem,
      concedida,
    });

    return concedida;
  } catch (error) {
    logger.error('CAPTURE', 'HOST_PERMISSION_REQUEST_ERROR', {
      url,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return false;
  }
}

/**
 * Recarrega a página com cache-busting e aguarda carregamento completo
 * Garante integridade do DOM antes da captura
 *
 * @param tabId - ID da aba a ser recarregada
 * @param logger - Logger para auditoria
 * @returns Promise que resolve quando a página está completamente carregada
 * @throws Error se timeout ou falha no reload
 */
async function reloadPageAndWaitForComplete(
  tabId: number,
  logger: AuditLogger
): Promise<void> {
  logger.info('CAPTURE', 'PAGE_RELOAD_START', {
    tabId,
    bypassCache: true,
    timeoutMs: RELOAD_CONFIG.PAGE_LOAD_TIMEOUT_MS,
  });

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let listenerRemoved = false;

    /**
     * Remove listener e limpa timeout
     */
    const cleanup = () => {
      if (!listenerRemoved) {
        listenerRemoved = true;
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    /**
     * Listener para monitorar status da aba
     */
    const onUpdatedListener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      // Ignorar eventos de outras abas
      if (updatedTabId !== tabId) {
        return;
      }

      logger.info('CAPTURE', 'PAGE_RELOAD_STATUS_UPDATE', {
        tabId: updatedTabId,
        status: changeInfo.status,
        url: changeInfo.url,
      });

      // Aguardar status 'complete'
      if (changeInfo.status === 'complete') {
        cleanup();

        logger.info('CAPTURE', 'PAGE_RELOAD_COMPLETE', {
          tabId,
          postLoadDelayMs: RELOAD_CONFIG.POST_LOAD_DELAY_MS,
        });

        // Delay adicional para garantir estabilidade do DOM
        setTimeout(() => {
          resolve();
        }, RELOAD_CONFIG.POST_LOAD_DELAY_MS);
      }
    };

    // Configurar timeout
    timeoutId = setTimeout(() => {
      cleanup();
      const errorMsg = `Timeout ao aguardar carregamento da página (${RELOAD_CONFIG.PAGE_LOAD_TIMEOUT_MS}ms)`;
      logger.error('CAPTURE', 'PAGE_RELOAD_TIMEOUT', {
        tabId,
        timeoutMs: RELOAD_CONFIG.PAGE_LOAD_TIMEOUT_MS,
      });
      reject(new Error(errorMsg));
    }, RELOAD_CONFIG.PAGE_LOAD_TIMEOUT_MS);

    // Registrar listener ANTES de iniciar reload
    chrome.tabs.onUpdated.addListener(onUpdatedListener);

    // Iniciar reload com bypassCache para garantir conteúdo fresco
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
      if (chrome.runtime.lastError) {
        cleanup();
        const errorMsg = chrome.runtime.lastError.message ?? 'Erro desconhecido ao recarregar página';
        logger.error('CAPTURE', 'PAGE_RELOAD_FAILED', {
          tabId,
          error: errorMsg,
        });
        reject(new Error(errorMsg));
      } else {
        logger.info('CAPTURE', 'PAGE_RELOAD_INITIATED', {
          tabId,
        });
      }
    });
  });
}

// ============================================================================
// Gerenciamento de Tokens (Requisito 3.1)
// ============================================================================

/**
 * Armazena tokens de autenticação de forma segura
 */
async function storeTokens(tokens: AuthTokens): Promise<void> {
  addBreadcrumb({
    category: 'service-worker',
    message: 'storeTokens chamado',
    level: 'info',
    data: {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      hasIdToken: !!tokens.idToken,
    },
  });

  // Criptografar tokens JWT com AES-256-GCM antes de armazenar
  const encryptedAccessToken = await encrypt(tokens.accessToken);
  const encryptedRefreshToken = await encrypt(tokens.refreshToken);

  const storageData: Record<string, string | number> = {
    [STORAGE_KEYS.ACCESS_TOKEN]: encryptedAccessToken,
    [STORAGE_KEYS.REFRESH_TOKEN]: encryptedRefreshToken,
    [STORAGE_KEYS.EXPIRES_AT]: tokens.expiresAt,
    [STORAGE_KEYS.OBTAINED_AT]: tokens.obtainedAt,
  };

  // Só armazena idToken se existir e não for vazio
  if (tokens.idToken !== undefined && tokens.idToken !== '') {
    storageData[STORAGE_KEYS.ID_TOKEN] = await encrypt(tokens.idToken);
    addBreadcrumb({ category: 'service-worker', message: 'idToken armazenado (criptografado)', level: 'info' });
  } else {
    addBreadcrumb({ category: 'service-worker', message: 'idToken não armazenado - valor ausente ou vazio', level: 'warning' });
  }

  await chrome.storage.local.set(storageData);
  
  // Verificar se foi armazenado corretamente
  const verification = await chrome.storage.local.get([STORAGE_KEYS.ID_TOKEN]);
  addBreadcrumb({
    category: 'service-worker',
    message: 'Verificação pós-armazenamento idToken',
    level: 'info',
    data: { stored: !!verification[STORAGE_KEYS.ID_TOKEN], length: verification[STORAGE_KEYS.ID_TOKEN]?.length ?? 0 },
  });
}

/**
 * Obtém tokens armazenados
 */
async function getStoredTokens(): Promise<AuthTokens | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.ID_TOKEN,
    STORAGE_KEYS.EXPIRES_AT,
    STORAGE_KEYS.OBTAINED_AT,
  ]);

  // Diagnóstico de recuperação de tokens via Sentry breadcrumb
  addBreadcrumb({
    category: 'service-worker',
    message: 'getStoredTokens resultado',
    level: 'info',
    data: {
      hasAccessToken: !!result[STORAGE_KEYS.ACCESS_TOKEN],
      hasRefreshToken: !!result[STORAGE_KEYS.REFRESH_TOKEN],
      hasIdToken: !!result[STORAGE_KEYS.ID_TOKEN],
    },
  });

  if (!result[STORAGE_KEYS.ACCESS_TOKEN] || !result[STORAGE_KEYS.REFRESH_TOKEN]) {
    addBreadcrumb({ category: 'service-worker', message: 'getStoredTokens retornando null - tokens obrigatórios ausentes', level: 'warning' });
    return null;
  }

  // Descriptografar tokens com migração transparente:
  // isEncrypted() diferencia tokens antigos (JWT começa com "ey") de criptografados (base64 AES-GCM)
  const rawAccessToken = result[STORAGE_KEYS.ACCESS_TOKEN] as string;
  const rawRefreshToken = result[STORAGE_KEYS.REFRESH_TOKEN] as string;
  const rawIdToken = result[STORAGE_KEYS.ID_TOKEN] as string | undefined;

  const accessToken = isEncrypted(rawAccessToken) ? await decrypt(rawAccessToken) : rawAccessToken;
  const refreshToken = isEncrypted(rawRefreshToken) ? await decrypt(rawRefreshToken) : rawRefreshToken;
  const idToken = rawIdToken
    ? (isEncrypted(rawIdToken) ? await decrypt(rawIdToken) : rawIdToken)
    : undefined;

  // Se tokens estavam em texto plano, re-criptografar para migração gradual
  if (!isEncrypted(rawAccessToken) || !isEncrypted(rawRefreshToken)) {
    addBreadcrumb({ category: 'service-worker', message: 'Migrando tokens legados para formato criptografado', level: 'info' });
    const migrationTokens: AuthTokens = {
      accessToken,
      refreshToken,
      expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
      obtainedAt: result[STORAGE_KEYS.OBTAINED_AT],
    };
    if (idToken !== undefined) {
      migrationTokens.idToken = idToken;
    }
    await storeTokens(migrationTokens);
  }

  const returnTokens: AuthTokens = {
    accessToken,
    refreshToken,
    expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
    obtainedAt: result[STORAGE_KEYS.OBTAINED_AT],
  };
  if (idToken !== undefined) {
    returnTokens.idToken = idToken;
  }

  return returnTokens;
}

/**
 * Armazena dados do usuário
 */
async function storeUser(user: AuthUser): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.USER]: user,
  });
}

/**
 * Obtém dados do usuário armazenados
 */
async function getStoredUser(): Promise<AuthUser | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.USER]);
  return result[STORAGE_KEYS.USER] ?? null;
}

/**
 * Limpa todos os dados de autenticação
 */
async function clearAuthData(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.ID_TOKEN,
    STORAGE_KEYS.EXPIRES_AT,
    STORAGE_KEYS.OBTAINED_AT,
    STORAGE_KEYS.USER,
  ]);
}

/**
 * Verifica se token está próximo de expirar
 */
function isTokenExpiringSoon(expiresAt: number): boolean {
  const now = Date.now();
  const timeUntilExpiry = expiresAt - now;
  return timeUntilExpiry <= AUTH_CONFIG.REFRESH_BEFORE_EXPIRY_MS;
}

/**
 * Verifica se token já expirou
 */
function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

// ============================================================================
// Refresh de Tokens (Requisito 3.2, 3.10)
// ============================================================================

/**
 * Trata sessão expirada - limpa dados e notifica usuário
 * Requisitos 3.2, 3.3: Tratamento de erros de refresh
 * 
 * @param logger - Logger para auditoria
 * @param correlationId - ID de correlação para rastreabilidade
 */
async function handleSessionExpired(
  logger: AuditLogger,
  correlationId: string
): Promise<void> {
  logger.warn('AUTH', 'SESSION_EXPIRED', {
    correlationId,
    failureCount: refreshState.failureCount,
  });

  // Limpar todos os dados de autenticação
  await clearAuthData();

  // Resetar contador de falhas
  refreshState.resetFailures();

  // Notificar popup sobre necessidade de re-login
  try {
    await chrome.runtime.sendMessage({
      type: 'AUTH_SESSION_EXPIRED',
      payload: {
        correlationId,
        message: 'Sua sessão expirou. Faça login novamente.',
      },
    });
  } catch {
    // Popup pode não estar aberto - ignorar erro silenciosamente
  }

  // Mostrar notificação visual ao usuário
  try {
    const notificationManager = getNotificationManager(logger);
    await notificationManager.notifyWarning(
      'Sessão Expirada',
      'Sua sessão expirou. Abra a extensão para fazer login novamente.'
    );
  } catch (notifyError) {
    logger.error('AUTH', 'SESSION_EXPIRED_NOTIFICATION_FAILED', {
      correlationId,
      error: notifyError instanceof Error ? notifyError.message : 'Erro desconhecido',
    });
  }
}

/**
 * Verifica se o refresh token está dentro do limite de idade
 * Requisito 4.1, 4.2: Validação de idade do refresh token
 * 
 * @param obtainedAt - Timestamp de quando o token foi obtido
 * @returns true se token ainda é válido, false se expirou
 */
function isRefreshTokenValid(obtainedAt: number): boolean {
  const tokenAge = Date.now() - obtainedAt;
  return tokenAge <= AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS;
}

/**
 * Realiza refresh do token de acesso via API HTTP
 * Usa chamadas HTTP para evitar erro "document is not defined" do AWS SDK em service workers
 * 
 * Requisitos atendidos:
 * - 1.1: Integração com backend para refresh
 * - 1.2: Armazenamento de novos tokens
 * - 3.1: Tratamento de falhas consecutivas
 * - 3.2: Refresh automático antes da expiração
 * - 3.10: Renovação automática durante captura
 * - 4.1, 4.2: Validação de idade do refresh token
 * 
 * @param logger - Logger para auditoria
 * @returns true se refresh bem-sucedido, false caso contrário
 */
async function refreshAccessToken(logger: AuditLogger): Promise<boolean> {
  if (isRefreshing) {
    logger.info('AUTH', 'REFRESH_ALREADY_IN_PROGRESS', {});
    return false;
  }

  isRefreshing = true;
  const correlationId = generateCorrelationId();

  try {
    const tokens = await getStoredTokens();

    if (!tokens?.refreshToken) {
      logger.warn('AUTH', 'NO_REFRESH_TOKEN', { correlationId });
      return false;
    }

    // Requisito 4.1, 4.2: Verificar se refresh token não expirou (máximo 2 horas)
    if (!isRefreshTokenValid(tokens.obtainedAt)) {
      const tokenAge = Date.now() - tokens.obtainedAt;
      logger.warn('AUTH', 'REFRESH_TOKEN_EXPIRED', {
        correlationId,
        ageMs: tokenAge,
        maxAgeMs: AUTH_CONFIG.REFRESH_TOKEN_MAX_AGE_MS,
      });
      await handleSessionExpired(logger, correlationId);
      return false;
    }

    logger.info('AUTH', 'REFRESH_TOKEN_START', { correlationId });

    // Refresh via Supabase diretamente (não usa endpoint do backend)
    const authManager = getAuthManager();
    const refreshResult = await authManager.refreshTokens();

    if (!refreshResult.success || !refreshResult.tokens) {
      logger.error('AUTH', 'REFRESH_TOKEN_SUPABASE_FAILED', {
        correlationId,
        error: refreshResult.error,
      });

      // Requisito 3.1: Incrementar contador de falhas
      const failureCount = refreshState.incrementFailure();

      logger.warn('AUTH', 'REFRESH_FAILURE_COUNT', {
        correlationId,
        failureCount,
        maxAttempts: AUTH_CONFIG.MAX_REFRESH_ATTEMPTS,
      });

      // Requisito 3.1: Invalidar sessão após MAX_REFRESH_ATTEMPTS falhas
      if (refreshState.hasExceededMaxAttempts()) {
        await handleSessionExpired(logger, correlationId);
      }

      return false;
    }

    // Os tokens já foram armazenados pelo AuthManager.refreshTokens()
    // Apenas atualizar nosso estado local se necessário
    const newTokens = refreshResult.tokens;

    // Resetar contador de falhas após sucesso
    refreshState.resetFailures();

    // Verificar validade da data antes de converter
    const refreshExpDate = new Date(newTokens.expiresAt);
    const isRefreshExpValid = !isNaN(refreshExpDate.getTime());
    logger.info('AUTH', 'REFRESH_TOKEN_SUCCESS', {
      correlationId,
      expiresAt: isRefreshExpValid ? refreshExpDate.toISOString() : `INVALID (raw: ${newTokens.expiresAt})`,
    });

    return true;
  } catch (error) {
    logger.error('AUTH', 'REFRESH_TOKEN_FAILED', {
      correlationId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    // Requisito 3.1: Incrementar contador de falhas em caso de exceção
    const failureCount = refreshState.incrementFailure();

    logger.warn('AUTH', 'REFRESH_FAILURE_COUNT', {
      correlationId,
      failureCount,
      maxAttempts: AUTH_CONFIG.MAX_REFRESH_ATTEMPTS,
    });

    if (refreshState.hasExceededMaxAttempts()) {
      await handleSessionExpired(logger, correlationId);
    }

    return false;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Verifica e renova token se necessário
 */
async function checkAndRefreshToken(logger: AuditLogger): Promise<void> {
  const tokens = await getStoredTokens();

  if (!tokens) {
    return;
  }

  if (isTokenExpired(tokens.expiresAt)) {
    logger.warn('AUTH', 'TOKEN_EXPIRED', {});
    await refreshAccessToken(logger);
  } else if (isTokenExpiringSoon(tokens.expiresAt)) {
    // Verificar validade da data antes de converter
    const expDate = new Date(tokens.expiresAt);
    const isValid = !isNaN(expDate.getTime());
    logger.info('AUTH', 'TOKEN_EXPIRING_SOON', {
      expiresAt: isValid ? expDate.toISOString() : `INVALID (raw: ${tokens.expiresAt})`,
      timeUntilExpiry: tokens.expiresAt - Date.now(),
    });
    await refreshAccessToken(logger);
  }
}

/**
 * Configura alarme para verificação periódica de token
 */
async function setupTokenRefreshAlarm(): Promise<void> {
  // Limpar alarme existente
  await chrome.alarms.clear(AUTH_CONFIG.REFRESH_ALARM_NAME);

  // Criar novo alarme
  chrome.alarms.create(AUTH_CONFIG.REFRESH_ALARM_NAME, {
    periodInMinutes: AUTH_CONFIG.CHECK_INTERVAL_MS / 60000,
  });
}

// ============================================================================
// Persistência de Estado (Requisito 3.6)
// ============================================================================

/**
 * Persiste estado de captura para recuperação
 */
async function persistCaptureState(state: CaptureState): Promise<void> {
  const persistedState: PersistedCaptureState = {
    ...state,
    lastUpdatedAt: Date.now(),
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.CAPTURE_STATE]: persistedState,
  });
}

/**
 * Recupera estado de captura persistido
 */
async function recoverCaptureState(): Promise<PersistedCaptureState | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.CAPTURE_STATE]);
  return result[STORAGE_KEYS.CAPTURE_STATE] ?? null;
}

/**
 * Limpa estado de captura persistido
 */
async function clearCaptureState(): Promise<void> {
  currentCaptureState = null;
  await chrome.storage.local.remove([STORAGE_KEYS.CAPTURE_STATE]);
}

/**
 * Atualiza estado de captura
 */
async function updateCaptureState(updates: Partial<CaptureState>): Promise<void> {
  if (currentCaptureState) {
    currentCaptureState = { ...currentCaptureState, ...updates };
    await persistCaptureState(currentCaptureState);
  }
}

// ============================================================================
// Orquestração de Captura (Requisito 3.4)
// ============================================================================

/**
 * Flag para indicar se isolamento está ativo durante captura
 */
let isIsolationActiveForCapture = false;

/**
 * Garante restauração do isolamento em qualquer cenário
 * Requirements 5.8, 6.4, 6.5, 7.7, 8.7
 *
 * @param logger - Logger para auditoria
 */
async function ensureIsolationRestored(logger: AuditLogger): Promise<void> {
  if (!isIsolationActiveForCapture) {
    return;
  }

  const notificationManager = getNotificationManager(logger);

  try {
    const manager = getIsolationManager(logger);
    const status = manager.getIsolationStatus();

    if (status.isActive) {
      logger.info('ISOLATION', 'ENSURING_RESTORATION', {
        disabledCount: status.disabledCount,
      });

      const result = await manager.deactivateIsolation();

      if (result.success) {
        logger.info('ISOLATION', 'RESTORATION_SUCCESS', {
          restoredCount: result.restoredExtensions.length,
        });

        // Requisito 7.7: Notificar restauração bem-sucedida
        if (result.restoredExtensions.length > 0) {
          await notificationManager.notifyExtensionsRestored(result.restoredExtensions.length);
        }
      } else {
        logger.error('ISOLATION', 'RESTORATION_FAILED', {
          error: result.error,
          failedCount: result.failedExtensions.length,
        });

        // Requisito 8.7: Notificar falha com instruções de retry manual
        if (result.failedExtensions.length > 0) {
          const failedNames = result.failedExtensions.map((ext) => ext.name);
          await notificationManager.notifyExtensionsRestoreFailed(
            result.failedExtensions.length,
            failedNames
          );
        }
      }
    }
  } catch (error) {
    logger.error('ISOLATION', 'RESTORATION_ERROR', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    // Tentar forceRestore como fallback
    try {
      const manager = getIsolationManager(logger);
      const forceResult = await manager.forceRestore();

      if (!forceResult.success && forceResult.failedExtensions.length > 0) {
        // Requisito 8.7: Notificar falha mesmo após forceRestore
        const failedNames = forceResult.failedExtensions.map((ext) => ext.name);
        await notificationManager.notifyExtensionsRestoreFailed(
          forceResult.failedExtensions.length,
          failedNames
        );
      }
    } catch (forceError) {
      logger.critical('ISOLATION', 'FORCE_RESTORATION_FAILED', {
        error: forceError instanceof Error ? forceError.message : 'Erro desconhecido',
      });

      // Requisito 8.7: Notificar falha crítica
      await notificationManager.notifyExtensionsRestoreFailed(
        1,
        ['Falha crítica na restauração. Verifique manualmente em chrome://extensions']
      );
    }
  } finally {
    isIsolationActiveForCapture = false;

    // Fallback: também restaurar via singleton compartilhado do módulo managers
    // O video-capture-handler usa essa instância, que pode ter estado diferente
    try {
      const { getExtensionIsolationManager: getSharedExtMgr } = await import('./managers/isolation-managers');
      const sharedMgr = getSharedExtMgr(logger);
      await sharedMgr.forceRestore();
    } catch {
      // Ignorar erro - é apenas fallback de segurança
    }
  }
}

/**
 * Garante que o content script está carregado na aba antes de enviar mensagens
 * Tenta injetar o script se não estiver presente
 *
 * @param tabId - ID da aba
 * @param logger - Logger para auditoria
 * @returns true se content script está disponível
 */
async function ensureContentScriptLoaded(tabId: number, logger: AuditLogger): Promise<boolean> {
  // Obter informações da aba para verificar URL
  let tabUrl = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab.url ?? '';

    // Verificar se é uma URL onde content scripts não podem ser injetados
    if (tabUrl.startsWith('chrome://') ||
      tabUrl.startsWith('chrome-extension://') ||
      tabUrl.startsWith('about:') ||
      tabUrl.startsWith('edge://') ||
      tabUrl.startsWith('brave://')) {
      logger.warn('CAPTURE', 'CONTENT_SCRIPT_BLOCKED_URL', { tabId, url: tabUrl });
      return false;
    }
  } catch (error) {
    logger.error('CAPTURE', 'TAB_INFO_FAILED', {
      tabId,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
    return false;
  }

  // Tentar enviar PING para verificar se content script está carregado
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (response?.success) {
      logger.info('CAPTURE', 'CONTENT_SCRIPT_READY', { tabId });
      return true;
    }
  } catch {
    // Content script não está carregado, tentar injetar
    logger.info('CAPTURE', 'CONTENT_SCRIPT_NOT_LOADED', { tabId, url: tabUrl });
  }

  // Tentar injetar content script programaticamente
  // Obter o caminho do content script do manifest
  try {
    logger.info('CAPTURE', 'ATTEMPTING_SCRIPT_INJECTION', { tabId });

    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts?.[0]?.js;

    if (contentScripts && contentScripts.length > 0) {
      logger.info('CAPTURE', 'INJECTING_CONTENT_SCRIPT', {
        tabId,
        scripts: contentScripts
      });

      // Injetar os scripts do manifest
      await chrome.scripting.executeScript({
        target: { tabId },
        files: contentScripts,
      });

      // Aguardar um momento para o script inicializar
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verificar novamente se está funcionando
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        if (response?.success) {
          logger.info('CAPTURE', 'CONTENT_SCRIPT_INJECTED_SUCCESS', { tabId });
          return true;
        }
      } catch {
        logger.warn('CAPTURE', 'CONTENT_SCRIPT_INJECTED_BUT_NOT_RESPONDING', { tabId });
      }
    } else {
      logger.error('CAPTURE', 'NO_CONTENT_SCRIPTS_IN_MANIFEST', {});
    }

    // Se ainda não está disponível, informar que a página precisa ser recarregada
    logger.warn('CAPTURE', 'CONTENT_SCRIPT_NOT_RESPONDING', {
      tabId,
      url: tabUrl,
      hint: 'Tente recarregar a página (F5) e tentar novamente'
    });

  } catch (error) {
    logger.error('CAPTURE', 'CONTENT_SCRIPT_INJECTION_FAILED', {
      tabId,
      url: tabUrl,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }

  return false;
}

/**
 * Inicia processo de captura
 * Requirement 6.4, 6.5: Garante restauração de extensões em finally
 * Requirement 6.6: Fallback para isolamento parcial
 */
import {
  startVideoCaptureWithPipeline,
  stopVideoCaptureWithPipeline,
  cancelVideoCaptureWithPipeline,
  isVideoCaptureActive,
  resolveBridgeStreamId,
  rejectBridgeStreamId,
} from './video-capture-handler';

// NOTA: VideoCaptureHandler legado foi removido em favor do EvidencePipeline unificado
// O novo fluxo usa startVideoCaptureWithPipeline/stopVideoCaptureWithPipeline que:
// 1. Coleta HTML inicial/final/navegações
// 2. Coleta metadados forenses completos
// 3. Aplica timestamp ICP-Brasil
// 4. Faz upload de TODOS os artefatos (video, HTML, metadata, integrity, timestamp)

/**
 * Inicia o processo de captura (Screenshot ou Vídeo)
 *
 * @param payload - Dados para iniciar a captura
 * @param logger - Logger para auditoria
 * @returns Promise com estado inicial da captura
 *
 * Requirement 3.4: Orquestração
 * Requirement 6.4, 6.5: Garante restauração de extensões em finally
 * Requirement 6.6: Fallback para isolamento parcial
 */
/**
 * Helper para recarregar a página e aguardar conclusão
 */


async function startCapture(
  payload: StartCapturePayload,
  _sender: chrome.runtime.MessageSender,
  logger: AuditLogger
): Promise<MessageResponse<CaptureState>> {
  addBreadcrumb({ category: 'service-worker', message: 'startCapture chamado', level: 'info', data: { type: payload?.type } });
  logger.info('CAPTURE', 'START_CAPTURE_REQUEST', {
    payload,
    timestamp: new Date().toISOString(),
  });

  // Verificar e limpar estados stale antes de checar se há captura em andamento
  // Estados em 'initializing' por mais de 30s são considerados stale
  // Estados em outros status por mais de 5min são considerados stale
  if (currentCaptureState && currentCaptureState.status !== 'completed' && currentCaptureState.status !== 'failed') {
    const stateAge = Date.now() - (currentCaptureState.startedAt ?? 0);
    const isInitializing = currentCaptureState.status === 'initializing';
    const staleTimeoutMs = isInitializing ? 30 * 1000 : 5 * 60 * 1000; // 30s para initializing, 5min para outros
    
    if (stateAge > staleTimeoutMs) {
      logger.warn('CAPTURE', 'STALE_CAPTURE_STATE_CLEARED_ON_START', {
        captureId: currentCaptureState.id,
        status: currentCaptureState.status,
        ageMs: stateAge,
        timeoutMs: staleTimeoutMs,
        message: 'Estado de captura stale detectado e limpo antes de nova captura',
      });
      await clearCaptureState();
    }
  }

  // Verificar se já há captura em andamento (após limpeza de estados stale)
  if (currentCaptureState && currentCaptureState.status !== 'completed' && currentCaptureState.status !== 'failed') {
    logger.warn('CAPTURE', 'CAPTURE_ALREADY_IN_PROGRESS', {
      currentCaptureId: currentCaptureState.id,
      currentStatus: currentCaptureState.status,
    });
    return {
      success: false,
      error: 'Já existe uma captura em andamento',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  // Verificar autenticação
  logger.info('CAPTURE', 'CHECKING_AUTH', {});
  const tokens = await getStoredTokens();
  if (!tokens) {
    logger.error('CAPTURE', 'AUTH_REQUIRED', {});
    return {
      success: false,
      error: 'Usuário não autenticado',
      errorCode: ErrorCodes.AUTH_TOKEN_INVALID,
    };
  }
  // Diagnostico de expiresAt via Sentry breadcrumb
  addBreadcrumb({ category: 'service-worker', message: 'tokens.expiresAt diagnostico', level: 'info', data: { valor: tokens.expiresAt, tipo: typeof tokens.expiresAt } });

  // Verificar se expiresAt é válido antes de converter para ISO
  const expiresAtDate = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
  const isValidDate = expiresAtDate && !isNaN(expiresAtDate.getTime());

  logger.info('CAPTURE', 'AUTH_VALID', {
    tokenExpiresAt: isValidDate ? expiresAtDate.toISOString() : `INVALID (raw: ${tokens.expiresAt})`,
  });

  // Se expiresAt é inválido, os tokens estão corrompidos - limpar e pedir re-login
  if (!isValidDate) {
    logger.error('CAPTURE', 'INVALID_EXPIRES_AT', { raw: tokens.expiresAt });
    return {
      success: false,
      error: 'Sessão inválida. Por favor, faça logout e login novamente.',
      errorCode: ErrorCodes.AUTH_TOKEN_INVALID,
    };
  }

  // Verificar se token precisa de refresh
  if (isTokenExpiringSoon(tokens.expiresAt)) {
    logger.info('CAPTURE', 'TOKEN_REFRESH_NEEDED', {});
    await refreshAccessToken(logger);
  }

  // Obter aba ativa - preferir tabId do payload se disponível
  // Isso evita race condition quando popup abre Side Panel antes de enviar START_CAPTURE
  logger.info('CAPTURE', 'GETTING_ACTIVE_TAB', { payloadTabId: payload.tabId });

  let activeTab: chrome.tabs.Tab | undefined;

  if (payload.tabId) {
    // Usar tabId do payload - mais confiável pois foi capturado antes do Side Panel abrir
    try {
      activeTab = await chrome.tabs.get(payload.tabId);
      logger.info('CAPTURE', 'TAB_FROM_PAYLOAD', {
        tabId: activeTab?.id,
        url: activeTab?.url,
      });
    } catch (err) {
      logger.warn('CAPTURE', 'TAB_FROM_PAYLOAD_FAILED', {
        payloadTabId: payload.tabId,
        error: String(err),
      });
      // Fallback para query se tab do payload não existe mais
    }
  }

  if (!activeTab) {
    // Fallback: query aba ativa (menos confiável após Side Panel abrir)
    const [queriedTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = queriedTab;
    logger.info('CAPTURE', 'TAB_FROM_QUERY', {
      tabId: activeTab?.id,
      url: activeTab?.url,
    });
  }

  logger.info('CAPTURE', 'ACTIVE_TAB_INFO', {
    tabId: activeTab?.id,
    url: activeTab?.url,
    title: activeTab?.title,
    status: activeTab?.status,
    sourceTabId: payload.tabId ? 'payload' : 'query',
  });

  if (!activeTab?.id || !activeTab.url) {
    logger.error('CAPTURE', 'TAB_ACCESS_FAILED', {
      hasId: !!activeTab?.id,
      hasUrl: !!activeTab?.url,
      payloadTabId: payload.tabId,
    });
    return {
      success: false,
      error: 'Não foi possível acessar a aba atual',
      errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
    };
  }

  // Verificar se URL está bloqueada para captura
  const verificacaoUrl = verificarUrlBloqueada(activeTab.url);
  if (verificacaoUrl.bloqueada) {
    logger.warn('CAPTURE', 'URL_BLOQUEADA', {
      url: activeTab.url,
      motivo: verificacaoUrl.motivo,
      categoria: verificacaoUrl.categoria,
    });
    return {
      success: false,
      error: verificacaoUrl.motivo ?? 'Esta página não pode ser capturada',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  // Criar estado inicial da captura
  const captureId = generateCorrelationId();
  // tabId garantido pelo guard acima (!activeTab?.id retorna early)
  const tabId = activeTab.id;

  if (payload.type === 'video') {
    // Verificar se já existe uma captura de vídeo ativa para evitar dupla execução
    // (race condition no App.tsx pode enviar START_CAPTURE duas vezes)
    if (currentCaptureState?.type === 'video' && 
        (currentCaptureState.status === 'lockdown_active' || 
         currentCaptureState.status === 'initializing' || 
         currentCaptureState.status === 'capturing')) {
      logger.warn('CAPTURE', 'VIDEO_CAPTURE_ALREADY_ACTIVE', {
        existingId: currentCaptureState.id,
        existingStatus: currentCaptureState.status,
      });
      return {
        success: true,
        data: currentCaptureState,
      };
    }

    currentCaptureState = {
      id: captureId,
      type: 'video',
      storageType: payload.storageType,
      status: 'lockdown_active', // Iniciando modo de isolamento
      tabId: tabId,
      windowId: activeTab.windowId,
      url: activeTab.url,
      title: activeTab.title ?? 'Unknown',
      startedAt: Date.now(),
      progress: 0,
      progressMessage: 'Preparando ambiente seguro...',
    };

    // Persistir estado inicial
    await persistCaptureState(currentCaptureState);

    // Iniciar fluxo de preparação de vídeo
    try {
      // 1. Ativar Isolamento de Abas
      const tabIsolation = getTabIsolationManager();
      await tabIsolation.activate(tabId, activeTab.windowId);

      // 2. Aguardar Side Panel abrir (foi aberto pelo popup via user gesture)
      // O popup abre o Side Panel de forma assíncrona antes de enviar START_CAPTURE
      // Aguardamos um breve momento para garantir que o Side Panel esteja visível
      // antes de recarregar a página (melhor UX)
      logger.info('CAPTURE', 'WAITING_SIDEPANEL_OPEN', { windowId: activeTab.windowId });
      await new Promise(r => setTimeout(r, 500)); // 500ms para Side Panel abrir
      
      // 2.1 Enviar estado inicial para o Side Panel
      // IMPORTANTE: Status deve ser 'preparing' até que o countdown termine
      // O timer só deve iniciar após VIDEO_RECORDING_STARTED
      const sidePanelHandler = getSidePanelHandler({ logger });
      const initialRecordingState = {
        status: 'preparing' as const,  // NÃO 'recording' - aguardando countdown
        startTime: 0,  // Será definido quando gravação realmente iniciar
        elapsedMs: 0,
        maxDurationMs: 30 * 60 * 1000, // 30 minutos
        stats: {
          pagesVisited: 1,
          clickCount: 0,
          keystrokeCount: 0,
          scrollCount: 0,
          formsInteracted: 0,
        },
        navigationHistory: [{
          videoTimestamp: 0,
          formattedTime: '00:00',
          url: activeTab.url?.substring(0, 50) || 'Página inicial',
          fullUrl: activeTab.url || '',
          type: 'initial' as const,
          htmlHash: '',
        }],
        forensicContext: null,
        alerts: [],
        uploadProgress: {
          chunksUploaded: 0,
          chunksTotal: 0,
          bytesUploaded: 0,
          bytesTotal: 0,
          status: 'idle' as const,
        },
      };
      
      await sidePanelHandler.sendRecordingStateUpdate(initialRecordingState);
      logger.info('CAPTURE', 'SIDEPANEL_STATE_SENT', { status: 'preparing' });

      // 3. Recarregar Página (Requisito Forense)
      // O reload garante estado limpo da página para integridade da evidência.
      // NOTA: O reload invalida qualquer streamId pré-capturado pelo popup.
      // Um novo streamId será obtido via chrome.tabCapture.getMediaStreamId()
      // no service worker após a preparação forense (como no fluxo original).
      logger.info('CAPTURE', 'RELOADING_PAGE', { tabId: activeTab.id });
      await reloadPageAndWaitForComplete(tabId, logger);

      // Invalidar streamId pré-capturado (reload o tornou inválido)
      preCapturedStreamId = null;
      try {
        await chrome.storage.session.remove('lexato_video_stream_id');
      } catch { /* ignorar */ }

      // Atualizar status para countdown
      currentCaptureState.status = 'initializing';
      await persistCaptureState(currentCaptureState);

      // 4. Notificar Overlay para iniciar preparação forense (opcional)
      // O overlay é apenas visual — a preparação real é gerenciada pelo SidePanel.tsx
      // Aguardar breve momento para garantir injeção do content script pós-reload
      await new Promise(r => setTimeout(r, 1000));

      try {
        await chrome.tabs.sendMessage(tabId, { 
          type: 'START_CAPTURE', 
          payload: { type: 'video' } 
        });
      } catch (overlayErr) {
        // Não abortar o fluxo — overlay é complementar, não essencial
        logger.warn('CAPTURE', 'OVERLAY_NOTIFY_FAILED', { 
          error: String(overlayErr),
          note: 'Preparação forense continua via SidePanel' 
        });
      }

      return {
        success: true,
        data: currentCaptureState
      };

    } catch (error) {
      logger.error('CAPTURE', 'VIDEO_PREP_ERROR', { error: String(error) });
      currentCaptureState.status = 'failed';
      currentCaptureState.error = String(error);

      // Notificar SidePanel sobre a falha para que não fique preso na preparação
      try {
        await chrome.runtime.sendMessage({
          type: 'PIPELINE_ERROR',
          payload: {
            error: String(error),
            code: 'VIDEO_PREP_FAILED',
            isRecoverable: true,
            phase: 'preparation',
          },
        });
      } catch { /* ignorar erro de notificação */ }

      // Tentar desativar isolamento em caso de erro
      try {
        await getTabIsolationManager().deactivate();
      } catch { /* ignorar erro de cleanup */ }

      // Limpar estado para permitir nova tentativa
      currentCaptureState = null;

      return {
        success: false,
        error: String(error),
        errorCode: ErrorCodes.CAPTURE_FAILED
      };
    }
  }

  // ========================================================================
  // FEATURE FLAG: Use new unified capture pipeline
  // Set to true to enable the new EvidencePipeline-based capture flow
  // ========================================================================
  const USE_NEW_CAPTURE_PIPELINE = true; // Ativado para usar SSO no preview

  if (USE_NEW_CAPTURE_PIPELINE && payload.type === 'screenshot') {
    logger.info('CAPTURE', 'USING_NEW_PIPELINE', { captureId });

    // CRÍTICO: Inicializar currentCaptureState ANTES de chamar startCaptureFlow
    // Isso é necessário porque handlers como CAPTURE_VIEWPORT dependem do estado global
    // para encontrar o tabId durante a captura.
    currentCaptureState = {
      id: captureId,
      type: payload.type,
      storageType: payload.storageType,
      status: 'initializing',
      tabId: payload.tabId ?? activeTab.id,
      url: activeTab.url,
      title: activeTab.title ?? '',
      startedAt: Date.now(),
      progress: 0,
      progressMessage: 'Inicializando captura...',
    };

    // Persistir estado inicial
    await persistCaptureState(currentCaptureState);

    logger.info('CAPTURE', 'CAPTURE_STATE_INITIALIZED_FOR_NEW_PIPELINE', {
      captureId,
      type: payload.type,
      storageType: payload.storageType,
      url: activeTab.url,
      tabId: currentCaptureState.tabId,
    });

    // Wrap isolation manager to adapt to expected interface
    const isolationManagerWrapper = {
      activateIsolation: async (correlationId: string) => {
        const manager = getIsolationManager(logger);
        const result = await manager.activateIsolation(correlationId);
        return {
          success: result.success,
          error: result.error,
          disabledExtensions: result.disabledExtensions,
          nonDisableableExtensions: result.nonDisableableExtensions,
          snapshot: result.snapshot ? { hash: result.snapshot.hash } : undefined,
        };
      }
    };

    // NOTA: Passamos null para currentState nas dependências para que a validação
    // em validateCapturePrerequisites não pense que já existe uma captura em andamento.
    // O estado GLOBAL currentCaptureState já foi inicializado acima para que handlers
    // como CAPTURE_VIEWPORT possam encontrar o tabId.
    const dependencies: CaptureFlowDependencies = {
      pipeline: getEvidencePipeline(),
      currentState: null, // Passamos null para validação, mas o estado global está setado
      getStoredTokens,
      isTokenExpiringSoon,
      refreshAccessToken,
      isolationManager: isolationManagerWrapper as CaptureFlowDependencies['isolationManager'],
      verificarPermissaoHost,
      solicitarPermissaoHost,
      reloadPageAndWaitForComplete,
      ensureContentScriptLoaded,
      persistCaptureState: async (state: CaptureState) => {
        // Sincronizar estado local do flow com estado global
        currentCaptureState = state;
        await persistCaptureState(state);
      },
      generateCorrelationId,
      logger,
    };

    const result = await startCaptureFlow(payload, dependencies);

    // Atualizar estado global com resultado final
    if (result.success && result.data) {
      currentCaptureState = result.data;
    } else if (!result.success && currentCaptureState) {
      // Em caso de erro, atualizar estado com falha
      currentCaptureState.status = 'failed';
      if (result.error) {
        currentCaptureState.error = result.error;
      }
      await persistCaptureState(currentCaptureState);
    }

    return result;
  }

  // Legacy: Fallback para Screenshot (código existente)
  // @deprecated - será removido quando USE_NEW_CAPTURE_PIPELINE=true for estável
  currentCaptureState = {
    id: captureId,
    type: payload.type,
    storageType: payload.storageType,
    status: 'initializing',
    tabId: payload.tabId ?? activeTab.id,
    url: activeTab.url,
    title: activeTab.title ?? '',
    startedAt: Date.now(),
    progress: 0,
    progressMessage: 'Inicializando captura...',
  };

  // Persistir estado
  await persistCaptureState(currentCaptureState);

  logger.info('CAPTURE', 'CAPTURE_STATE_CREATED', {
    captureId,
    type: payload.type,
    storageType: payload.storageType,
    url: activeTab.url,
    tabId: currentCaptureState.tabId,
  });

  // Requirement 6.1: Ativar isolamento ANTES de iniciar PISA
  // Requirement 6.4, 6.5: Usar try/finally para garantir restauração
  // Requirement 6.6: Fallback para isolamento parcial
  try {
    // Ativar isolamento de extensões
    const manager = getIsolationManager(logger);
    const isolationResult = await manager.activateIsolation(captureId);

    // Variáveis para metadados de isolamento parcial
    let isolationMode: 'full' | 'partial' | 'none' = 'none';
    let nonDisabledExtensionNames: string[] = [];

    if (!isolationResult.success) {
      // Requirement 6.6: Continuar captura mesmo sem isolamento completo
      // Extrair nomes das extensões não desativáveis
      nonDisabledExtensionNames = isolationResult.nonDisableableExtensions.map((ext) => ext.name);

      logger.warn('CAPTURE', 'ISOLATION_ACTIVATION_FAILED', {
        error: isolationResult.error,
        nonDisableableExtensions: nonDisabledExtensionNames,
        // Continuar captura em modo degradado
      });

      // Verificar se houve isolamento parcial
      if (isolationResult.disabledExtensions.length > 0) {
        isolationMode = 'partial';
        isIsolationActiveForCapture = true;

        logger.warn('CAPTURE', 'PARTIAL_ISOLATION_MODE', {
          disabledCount: isolationResult.disabledExtensions.length,
          nonDisableableCount: isolationResult.nonDisableableExtensions.length,
          nonDisableableExtensions: nonDisabledExtensionNames,
        });
      } else {
        // Nenhuma extensão foi desativada - modo sem isolamento
        isolationMode = 'none';
        logger.warn('CAPTURE', 'NO_ISOLATION_MODE', {
          reason: isolationResult.error,
        });
      }
    } else {
      isIsolationActiveForCapture = true;
      isolationMode = 'full';

      // Mesmo em sucesso, pode haver extensões não desativáveis (admin)
      if (isolationResult.nonDisableableExtensions.length > 0) {
        nonDisabledExtensionNames = isolationResult.nonDisableableExtensions.map((ext) => ext.name);
      }

      logger.info('CAPTURE', 'ISOLATION_ACTIVATED', {
        disabledCount: isolationResult.disabledExtensions.length,
        snapshotHash: isolationResult.snapshot?.hash,
      });
    }

    // ========================================================================
    // IMPORTANTE: Verificar permissões de host ANTES do reload
    // No MV3, host_permissions são permanentes e não são revogadas após reload,
    // diferente do activeTab que é temporário. Porém, o usuário pode ter
    // restringido as permissões para "On click" ou sites específicos.
    // ========================================================================

    addBreadcrumb({ category: 'service-worker', message: 'Verificando permissoes de host', level: 'info' });

    const verificacaoPermissao = await verificarPermissaoHost(activeTab.url, logger);

    if (!verificacaoPermissao.temPermissao) {
      addBreadcrumb({ category: 'service-worker', message: 'Sem host_permissions - tentando solicitar', level: 'warning' });

      // Tentar solicitar permissão (funciona porque estamos em resposta a gesto do usuário)
      const permissaoConcedida = await solicitarPermissaoHost(activeTab.url, logger);

      if (!permissaoConcedida) {
        addBreadcrumb({ category: 'service-worker', message: 'Permissao de host negada pelo usuario', level: 'warning' });

        logger.error('CAPTURE', 'HOST_PERMISSION_DENIED', {
          url: activeTab.url,
          origem: verificacaoPermissao.origem,
        });

        currentCaptureState.status = 'failed';
        currentCaptureState.error = 'Permissão de captura negada para este site';
        await persistCaptureState(currentCaptureState);

        return {
          success: false,
          error: 'Permissão de captura necessária. Por favor, permita o acesso ao site quando solicitado, ou clique com botão direito no ícone da extensão → "Pode ler e alterar dados do site" → "Em todos os sites".',
          errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
        };
      }

      addBreadcrumb({ category: 'service-worker', message: 'Permissao de host concedida pelo usuario', level: 'info' });
    } else {
      addBreadcrumb({ category: 'service-worker', message: 'Host permission ja concedida', level: 'info' });
    }

    // Recarregar página com cache-busting para garantir integridade do DOM
    // Agora temos host_permissions permanentes, então captureVisibleTab funcionará após reload
    addBreadcrumb({ category: 'service-worker', message: 'Iniciando reload da pagina para integridade', level: 'info', data: { tabId: currentCaptureState.tabId, url: activeTab.url } });

    logger.info('CAPTURE', 'RELOADING_PAGE_FOR_INTEGRITY', {
      tabId: currentCaptureState.tabId,
      url: activeTab.url,
      hostPermissionVerified: true,
    });

    await updateCaptureState({
      progress: 5,
      progressMessage: 'Sincronizando conteúdo...',
    });

    try {
      addBreadcrumb({ category: 'service-worker', message: 'Chamando reloadPageAndWaitForComplete', level: 'info' });
      await reloadPageAndWaitForComplete(currentCaptureState.tabId, logger);
      addBreadcrumb({ category: 'service-worker', message: 'Reload concluido com sucesso', level: 'info' });
      logger.info('CAPTURE', 'PAGE_RELOAD_SUCCESS', {
        tabId: currentCaptureState.tabId,
      });

      // IMPORTANTE: Após o reload, precisamos aguardar um pouco mais
      // para garantir que a página está totalmente estável e que
      // o content script foi reinjetado
      addBreadcrumb({ category: 'service-worker', message: 'Aguardando estabilizacao pos-reload (2s)', level: 'info' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      addBreadcrumb({ category: 'service-worker', message: 'Estabilizacao concluida', level: 'info' });
    } catch (reloadError) {
      const errorMsg = reloadError instanceof Error ? reloadError.message : 'Erro desconhecido';
      logger.error('CAPTURE', 'PAGE_RELOAD_ERROR', {
        tabId: currentCaptureState.tabId,
        error: errorMsg,
      });

      currentCaptureState.status = 'failed';
      currentCaptureState.error = `Falha ao recarregar página: ${errorMsg}`;
      await persistCaptureState(currentCaptureState);

      return {
        success: false,
        error: `Falha ao recarregar página para captura: ${errorMsg}`,
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    await updateCaptureState({
      progress: 15,
      progressMessage: 'Preparando captura...',
    });

    // Garantir que content script está carregado após reload
    logger.info('CAPTURE', 'CHECKING_CONTENT_SCRIPT', {
      tabId: currentCaptureState.tabId,
    });

    const contentScriptReady = await ensureContentScriptLoaded(currentCaptureState.tabId, logger);

    if (!contentScriptReady) {
      logger.error('CAPTURE', 'CONTENT_SCRIPT_UNAVAILABLE', {
        tabId: currentCaptureState.tabId,
        url: activeTab.url,
      });

      currentCaptureState.status = 'failed';
      currentCaptureState.error = 'Não foi possível inicializar captura nesta página';
      await persistCaptureState(currentCaptureState);

      return {
        success: false,
        error: 'Não foi possível inicializar a captura. Verifique se a página permite extensões (páginas chrome:// e extensões não são suportadas).',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    logger.info('CAPTURE', 'SENDING_START_PISA', {
      tabId: currentCaptureState.tabId,
      captureId,
      captureType: payload.type,
      isolationMode,
    });

    const pisaPayload = {
      captureId,
      captureType: payload.type,
      storageType: payload.storageType,
      isolationSnapshotHash: isolationResult.snapshot?.hash,
      disabledExtensionIds: isolationResult.disabledExtensions,
      // Requirement 6.6: Metadados de isolamento parcial
      isolationMetadata: {
        mode: isolationMode,
        disabledCount: isolationResult.disabledExtensions.length,
        nonDisabledExtensions: nonDisabledExtensionNames,
        warning: isolationMode === 'partial'
          ? 'Algumas extensões não puderam ser desativadas durante a captura'
          : isolationMode === 'none'
            ? 'Isolamento de extensões não disponível durante a captura'
            : undefined,
      },
    };

    logger.info('CAPTURE', 'START_PISA_PAYLOAD', {
      payload: pisaPayload,
    });

    const sendStartTime = Date.now();

    const pisaResponse = await chrome.tabs.sendMessage(currentCaptureState.tabId, {
      type: 'START_PISA',
      payload: pisaPayload,
    });

    const sendDuration = Date.now() - sendStartTime;

    logger.info('CAPTURE', 'START_PISA_RESPONSE', {
      response: pisaResponse,
      success: pisaResponse?.success,
      hasData: !!pisaResponse?.data,
      error: pisaResponse?.error,
      durationMs: sendDuration,
    });

    // ========================================================================
    // DEBUG EXTENSIVO - PISA RESPONSE
    // Diagnostico PISA response via Sentry breadcrumb
    addBreadcrumb({
      category: 'service-worker',
      message: 'PISA response recebido',
      level: 'info',
      data: {
        success: pisaResponse?.success,
        status: pisaResponse?.data?.status,
        hasImageData: !!pisaResponse?.data?.imageData,
        imageDataLength: pisaResponse?.data?.imageData?.length ?? 0,
        hasHtmlContent: !!pisaResponse?.data?.htmlContent,
        htmlContentLength: pisaResponse?.data?.htmlContent?.length ?? 0,
        hasMetadata: !!pisaResponse?.data?.metadata,
        error: pisaResponse?.error,
      },
    });

    if (!pisaResponse?.success) {
      addBreadcrumb({ category: 'service-worker', message: 'PISA falhou', level: 'warning', data: { error: pisaResponse?.error } });
      logger.error('CAPTURE', 'START_PISA_FAILED', {
        error: pisaResponse?.error,
        response: pisaResponse,
      });

      currentCaptureState.status = 'failed';
      currentCaptureState.error = pisaResponse?.error ?? 'Falha ao iniciar captura PISA';
      await persistCaptureState(currentCaptureState);

      return {
        success: false,
        error: pisaResponse?.error ?? 'Falha ao iniciar captura',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    addBreadcrumb({ category: 'service-worker', message: 'PISA retornou success=true', level: 'info', data: { status: pisaResponse.data?.status } });

    // Atualizar estado com dados da captura
    if (pisaResponse.data?.status === 'completed') {
      addBreadcrumb({
        category: 'service-worker',
        message: 'PISA status completed - iniciando upload',
        level: 'info',
        data: {
          hasImageData: !!pisaResponse.data?.imageData,
          imageDataLength: pisaResponse.data?.imageData?.length ?? 0,
          hasHtmlContent: !!pisaResponse.data?.htmlContent,
          hasMetadata: !!pisaResponse.data?.metadata,
        },
      });

      // Armazenar dados da captura no estado
      currentCaptureState.screenshotHash = pisaResponse.data?.imageHash;
      currentCaptureState.htmlHash = pisaResponse.data?.htmlHash;
      currentCaptureState.metadataHash = pisaResponse.data?.metadataHash;

      addBreadcrumb({
        category: 'service-worker',
        message: 'Hashes armazenados no estado',
        level: 'info',
        data: {
          screenshotHash: currentCaptureState.screenshotHash ?? 'N/A',
          htmlHash: currentCaptureState.htmlHash ?? 'N/A',
          metadataHash: currentCaptureState.metadataHash ?? 'N/A',
        },
      });

      logger.info('CAPTURE', 'CAPTURE_DATA_RECEIVED', {
        captureId,
        imageHash: pisaResponse.data?.imageHash,
        htmlHash: pisaResponse.data?.htmlHash,
        hasImageData: !!pisaResponse.data?.imageData,
        imageDataLength: pisaResponse.data?.imageData?.length ?? 0,
        hasHtmlContent: !!pisaResponse.data?.htmlContent,
        htmlContentLength: pisaResponse.data?.htmlContent?.length ?? 0,
        hasMetadata: !!pisaResponse.data?.metadata,
      });

      // ========================================================================
      // TIMESTAMP ICP-BRASIL (Fase 2)
      // CORRECAO: Usar TimestampService diretamente ao inves do EvidencePipeline
      // O EvidencePipeline.applyTimestamp() requer currentEvidenceId definido via startCapture(),
      // mas screenshots usam PISA diretamente sem passar pelo pipeline.
      // ========================================================================
      addBreadcrumb({ category: 'service-worker', message: 'Timestamp ICP-Brasil - inicio', level: 'info' });

      try {
        // Verificação de null antes de acessar estado (proteção contra race condition)
        if (!currentCaptureState) {
          logger.warn('CAPTURE', 'STATE_CLEARED_BEFORE_TIMESTAMP', { captureId });
          throw new Error('Estado de captura foi limpo durante operação assíncrona');
        }

        currentCaptureState.status = 'timestamping' as CaptureStatus; // Cast temporal até migração de tipos completa
        currentCaptureState.progressMessage = 'Solicitando carimbo de tempo ICP-Brasil...';
        await persistCaptureState(currentCaptureState);
        addBreadcrumb({ category: 'service-worker', message: 'Status atualizado para timestamping', level: 'info' });

        // 1. Calcular Merkle Root
        const hashes = [
          pisaResponse.data?.imageHash,
          pisaResponse.data?.htmlHash,
          pisaResponse.data?.metadataHash
        ].filter(h => !!h) as string[];

        const merkleRoot = await calcularMerkleRoot(hashes);
        addBreadcrumb({ category: 'service-worker', message: 'Merkle Root calculado', level: 'info' });

        // 2. Solicitar Timestamp usando TimestampService diretamente
        // NOTA: Não usar getEvidencePipeline().applyTimestamp() porque requer currentEvidenceId
        // que só é definido quando usamos pipeline.startCapture(), o que não ocorre para screenshots.
        logger.info('CAPTURE', 'REQUESTING_TIMESTAMP', { merkleRoot, captureId });
        addBreadcrumb({ category: 'service-worker', message: 'Criando TimestampService', level: 'info' });

        const timestampService = new TimestampService();
        addBreadcrumb({ category: 'service-worker', message: 'Chamando requestTimestamp()', level: 'info' });

        const timestampResult = await timestampService.requestTimestamp(merkleRoot);
        addBreadcrumb({
          category: 'service-worker',
          message: 'Timestamp obtido',
          level: 'info',
          data: { type: timestampResult.type, tsa: timestampResult.tsa, hasToken: !!timestampResult.tokenBase64, hasWarning: !!timestampResult.warning },
        });

        // 3. Salvar no estado (com verificacao de null apos operacao assincrona)
        if (currentCaptureState) {
          currentCaptureState.timestampResult = timestampResult;
          addBreadcrumb({ category: 'service-worker', message: 'timestampResult salvo no estado', level: 'info' });
        } else {
          logger.warn('CAPTURE', 'STATE_CLEARED_AFTER_TIMESTAMP', { captureId });
          addBreadcrumb({ category: 'service-worker', message: 'Estado foi limpo, timestampResult nao salvo', level: 'warning' });
        }

        logger.info('CAPTURE', 'TIMESTAMP_APPLIED', {
          type: timestampResult.type,
          tsa: timestampResult.tsa
        });
        addBreadcrumb({ category: 'service-worker', message: 'Timestamp aplicado com sucesso', level: 'info' });

      } catch (error) {
        logger.error('CAPTURE', 'TIMESTAMP_ERROR', { error: String(error), captureId });
        console.error('[ServiceWorker] Erro no timestamp:', error);
        // Não falha a captura, mas segue sem timestamp ICP-Brasil (terá apenas blockchain depois)
      }

      // ========================================================================
      // UPLOAD PARA S3
      // Apos captura bem-sucedida, fazer upload dos arquivos:
      // 1. Screenshot (imagem PNG para integridade forense)
      // 2. HTML (conteudo da pagina)
      // 3. Metadata (JSON com informacoes da captura)
      // ========================================================================
      addBreadcrumb({ category: 'service-worker', message: 'Atualizando status para uploading', level: 'info' });

      // Verificação de null antes de acessar estado (proteção contra race condition)
      if (!currentCaptureState) {
        logger.error('CAPTURE', 'STATE_CLEARED_BEFORE_UPLOAD', { captureId });
        throw new Error('Estado de captura foi limpo durante operação assíncrona');
      }

      currentCaptureState.status = 'uploading';
      currentCaptureState.progressMessage = 'Enviando arquivos para o servidor...';
      await persistCaptureState(currentCaptureState);
      addBreadcrumb({ category: 'service-worker', message: 'Estado persistido com status uploading', level: 'info' });

      try {
        addBreadcrumb({
          category: 'service-worker',
          message: 'Chamando executarUploadCaptura()',
          level: 'info',
          data: { captureId, storageType: currentCaptureState.storageType },
        });
        addBreadcrumb({
          category: 'service-worker',
          message: 'Dados preparados para upload',
          level: 'info',
          data: {
            hasImageData: !!pisaResponse.data?.imageData,
            hasHtmlContent: !!pisaResponse.data?.htmlContent,
            hasMetadata: !!pisaResponse.data?.metadata,
          },
        });

        const uploadStartTime = Date.now();
        addBreadcrumb({ category: 'service-worker', message: 'Iniciando upload', level: 'info' });

        const uploadResult = await executarUploadCaptura(
          captureId,
          currentCaptureState.storageType,
          {
            imageData: pisaResponse.data?.imageData,
            imageHash: pisaResponse.data?.imageHash,
            htmlContent: pisaResponse.data?.htmlContent,
            htmlHash: pisaResponse.data?.htmlHash,
            metadata: pisaResponse.data?.metadata,
            metadataHash: pisaResponse.data?.metadataHash,
            // Campos para preview
            originalUrl: currentCaptureState.url,
            pageTitle: currentCaptureState.title,
            captureType: currentCaptureState.type === 'video' ? 'VIDEO' : 'SCREENSHOT',
          },
          logger
        );

        const uploadDuration = Date.now() - uploadStartTime;
        addBreadcrumb({
          category: 'service-worker',
          message: 'Resultado do upload',
          level: 'info',
          data: {
            durationMs: uploadDuration,
            success: uploadResult.success,
            error: uploadResult.error ?? null,
            hasScreenshotUrl: !!uploadResult.screenshotUrl,
            hasHtmlUrl: !!uploadResult.htmlUrl,
            hasMetadataUrl: !!uploadResult.metadataUrl,
          },
        });
        addBreadcrumb({ category: 'service-worker', message: 'uploadResult completo', level: 'info' });

        if (uploadResult.success) {
          addBreadcrumb({ category: 'service-worker', message: 'Upload bem-sucedido', level: 'info' });
          currentCaptureState.status = 'completed';

          // Atribuir URLs apenas se definidas
          if (uploadResult.screenshotUrl) {
            currentCaptureState.screenshotUrl = uploadResult.screenshotUrl;
          }
          if (uploadResult.htmlUrl) {
            currentCaptureState.htmlUrl = uploadResult.htmlUrl;
          }
          if (uploadResult.metadataUrl) {
            currentCaptureState.metadataUrl = uploadResult.metadataUrl;
          }

          logger.info('CAPTURE', 'CAPTURE_UPLOAD_COMPLETED', {
            captureId,
            screenshotUrl: uploadResult.screenshotUrl,
            htmlUrl: uploadResult.htmlUrl,
            metadataUrl: uploadResult.metadataUrl,
            durationMs: uploadDuration,
          });

          // ========================================================================
          // FASE 4: DESBLOQUEAR ISOLAMENTO E ABRIR PREVIEW
          // CORREÇÃO: Adicionar etapas que estavam faltando no fluxo de screenshot
          // (Equivalente ao que o video-capture-handler.ts faz nas linhas 1101-1155)
          // ========================================================================
          addBreadcrumb({ category: 'service-worker', message: 'Fase 4: Desbloquear e abrir preview', level: 'info' });

          try {
            // 4.1. Enviar mensagem para content script limpar recursos (desbloquear botao direito, etc.)
            addBreadcrumb({ category: 'service-worker', message: 'Enviando CAPTURE_CLEANUP para content script', level: 'info' });
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]?.id) {
              await chrome.tabs.sendMessage(tabs[0].id, {
                type: 'CAPTURE_CLEANUP',
              }).catch((_cleanupErr) => {
                addBreadcrumb({ category: 'service-worker', message: 'CAPTURE_CLEANUP ignorado (tab sem content script)', level: 'info' });
              });
              addBreadcrumb({ category: 'service-worker', message: 'CAPTURE_CLEANUP enviado', level: 'info' });
            }

            // 4.2. Desativar isolamento de abas
            addBreadcrumb({ category: 'service-worker', message: 'Desativando isolamento de abas', level: 'info' });
            const tabIsolationMgr = getTabIsolationManager();
            await tabIsolationMgr.deactivateLockdown(false);
            addBreadcrumb({ category: 'service-worker', message: 'Isolamento de abas desativado', level: 'info' });
            logger.info('CAPTURE', 'TAB_ISOLATION_DEACTIVATED', { captureId });

            // 4.3. Restaurar extensoes desabilitadas
            addBreadcrumb({ category: 'service-worker', message: 'Restaurando extensoes desabilitadas', level: 'info' });
            const extensionIsolationMgr = getIsolationManager(logger);
            const restoreResult = await extensionIsolationMgr.forceRestore();
            addBreadcrumb({
              category: 'service-worker',
              message: 'Extensoes restauradas',
              level: 'info',
              data: { restoredCount: restoreResult.restoredExtensions.length, failedCount: restoreResult.failedExtensions.length },
            });
            logger.info('CAPTURE', 'EXTENSIONS_RESTORED', {
              captureId,
              restoredCount: restoreResult.restoredExtensions.length,
              failedCount: restoreResult.failedExtensions.length,
            });

          } catch (unlockError) {
            // Log mas não falha - preview pode ainda funcionar
            console.error('[ServiceWorker] [PHASE4-ERROR] Erro ao desbloquear isolamento:', unlockError);
            logger.warn('CAPTURE', 'UNLOCK_ERROR_BEFORE_PREVIEW', {
              captureId,
              error: unlockError instanceof Error ? unlockError.message : 'Erro desconhecido',
            });
          }

          // 4.4. Abrir página de preview
          try {
            addBreadcrumb({ category: 'service-worker', message: 'Abrindo pagina de preview', level: 'info' });
            const previewTabId = await openPreviewTab(captureId);
            addBreadcrumb({ category: 'service-worker', message: 'Preview aberto', level: 'info', data: { previewTabId } });
            logger.info('CAPTURE', 'PREVIEW_OPENED', {
              captureId,
              previewTabId,
            });

            // Atualizar status para pending_review
            currentCaptureState.status = 'pending_review' as CaptureStatus;
            await persistCaptureState(currentCaptureState);
            addBreadcrumb({ category: 'service-worker', message: 'Status atualizado para pending_review', level: 'info' });

          } catch (previewError) {
            console.error('[ServiceWorker] [PHASE4-ERROR] Erro ao abrir preview:', previewError);
            logger.error('CAPTURE', 'PREVIEW_OPEN_ERROR', {
              captureId,
              error: previewError instanceof Error ? previewError.message : 'Erro desconhecido',
            });
            // Não falha a captura - dados já foram salvos
          }

          addBreadcrumb({ category: 'service-worker', message: 'Fase 4 concluida com sucesso', level: 'info' });

        } else {
          addBreadcrumb({ category: 'service-worker', message: 'Upload falhou', level: 'warning', data: { error: uploadResult.error } });
          // Upload falhou, mas captura foi bem-sucedida
          // Marcar como completed mas com aviso
          currentCaptureState.status = 'completed';
          currentCaptureState.error = `Captura realizada, mas upload falhou: ${uploadResult.error}`;

          logger.warn('CAPTURE', 'CAPTURE_UPLOAD_FAILED', {
            captureId,
            error: uploadResult.error,
            durationMs: uploadDuration,
          });
        }
      } catch (uploadError) {
        captureException(uploadError, { context: 'upload_captura', captureId });

        // Erro no upload não deve falhar a captura inteira
        currentCaptureState.status = 'completed';
        currentCaptureState.error = `Captura realizada, mas upload falhou: ${uploadError instanceof Error ? uploadError.message : 'Erro desconhecido'}`;

        logger.error('CAPTURE', 'CAPTURE_UPLOAD_ERROR', {
          captureId,
          error: uploadError instanceof Error ? uploadError.message : 'Erro desconhecido',
        });
      }

      await persistCaptureState(currentCaptureState);
      addBreadcrumb({
        category: 'service-worker',
        message: 'Estado final persistido apos upload',
        level: 'info',
        data: {
          status: currentCaptureState.status,
          hasScreenshotUrl: !!currentCaptureState.screenshotUrl,
          hasTimestamp: !!currentCaptureState.timestampResult,
          error: currentCaptureState.error ?? null,
        },
      });
    } else {
      addBreadcrumb({
        category: 'service-worker',
        message: 'Status nao e completed - upload nao executado',
        level: 'warning',
        data: { status: pisaResponse.data?.status },
      });

      // Atualizar estado com o status recebido
      if (pisaResponse.data?.status) {
        currentCaptureState.status = pisaResponse.data.status as CaptureStatus;
        currentCaptureState.progressMessage = pisaResponse.data.progressMessage ?? 'Processando...';
        await persistCaptureState(currentCaptureState);
      }
    }

    addBreadcrumb({ category: 'service-worker', message: 'Retornando resultado final de startCapture()', level: 'info' });

    return {
      success: true,
      data: currentCaptureState,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('CAPTURE', 'CAPTURE_START_FAILED', {
      error: errorMessage,
      stack: errorStack,
      captureId: currentCaptureState?.id,
    });

    if (currentCaptureState) {
      currentCaptureState.status = 'failed';
      currentCaptureState.error = 'Falha ao iniciar captura';
      await persistCaptureState(currentCaptureState);
    }

    return {
      success: false,
      error: `Falha ao iniciar captura: ${errorMessage}`,
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  } finally {
    // Requirement 6.4, 6.5: Garantir restauração em qualquer cenário
    // Nota: A restauração real ocorre quando a captura termina (CAPTURE_COMPLETE/CANCEL)
    // Este finally garante restauração em caso de erro durante inicialização
    if (currentCaptureState?.status === 'failed') {
      await ensureIsolationRestored(logger);
      // Limpar estado após falha
      await clearCaptureState();
    } else if (currentCaptureState?.status === 'completed') {
      // Limpar estado após sucesso (upload concluído)
      // Aguardar um pouco para garantir que o popup recebeu os dados
      setTimeout(async () => {
        await clearCaptureState();
      }, 5000);
    }
  }
}

/**
 * Para captura em andamento
 * Requirement 6.4: Restaurar extensões após captura
 */
async function stopCapture(logger: AuditLogger): Promise<MessageResponse> {
  if (!currentCaptureState) {
    return {
      success: false,
      error: 'Nenhuma captura em andamento',
    };
  }

  try {
    // Lógica diferenciada para Vídeo e Screenshot
    if (currentCaptureState.type === 'video') {
         // Usar novo pipeline unificado que:
         // 1. Para a gravação e coleta HTML final
         // 2. Aplica timestamp ICP-Brasil
         // 3. Faz upload de TODOS os artefatos (video, HTML, metadata, integrity, timestamp)
         // 4. Abre preview automaticamente
         
         if (!isVideoCaptureActive()) {
             logger.error('CAPTURE', 'VIDEO_CAPTURE_NOT_ACTIVE', {});
             throw new Error('Nenhuma captura de vídeo ativa');
         }
         
         logger.info('CAPTURE', 'VIDEO_STOP_WITH_PIPELINE_START', { 
           captureId: currentCaptureState.id,
         });
         
         const result = await stopVideoCaptureWithPipeline(logger);
         
         if (!result.success) {
             logger.error('CAPTURE', 'VIDEO_PIPELINE_STOP_FAILED', { 
               error: result.error,
               errorCode: result.errorCode,
             });
             throw new Error(result.error ?? 'Falha ao parar captura de vídeo');
         }
         
         logger.info('CAPTURE', 'VIDEO_PIPELINE_STOP_COMPLETED', {
           captureId: currentCaptureState?.id,
           evidenceId: result.evidenceId,
           status: result.status,
         });

         // Verificação de null após operação assíncrona (proteção contra race condition)
         if (currentCaptureState) {
           // Atualizar estado para completed
           currentCaptureState.status = 'completed';
           currentCaptureState.progress = 100;
           currentCaptureState.progressMessage = 'Captura concluída! Todos os artefatos enviados.';
           if (result.evidenceId) {
             currentCaptureState.id = result.evidenceId;
           }
           await persistCaptureState(currentCaptureState);
         } else {
           logger.warn('CAPTURE', 'STATE_CLEARED_AFTER_VIDEO_STOP', {
             evidenceId: result.evidenceId,
           });
         }

         return { success: true, evidenceId: result.evidenceId };
         
    } else {
        // Lógica legada para Screenshot (que aparentemente usa TabCapture direto ou similar)
        // Enviar mensagem para content script parar
        await chrome.tabs.sendMessage(currentCaptureState.tabId, {
          type: 'STOP_CAPTURE',
        });
    
        logger.info('CAPTURE', 'CAPTURE_STOPPED', {
          captureId: currentCaptureState.id,
        });
    
        return { success: true };
    }

  } catch (error) {
    logger.error('CAPTURE', 'CAPTURE_STOP_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    return {
      success: false,
      error: 'Falha ao parar captura: ' + String(error),
    };
  } finally {
    // Requirement 6.4, 6.5: Garantir restauração de extensões
    // IMPORTANTE: Restaurar para TODOS os tipos de captura, incluindo vídeo em caso de erro
    // O video-capture-handler NÃO gerencia a restauração de isolamento em caminhos de erro
    const shouldRestore =
      // Sempre restaurar para não-vídeo
      currentCaptureState?.type !== 'video' ||
      // Para vídeo, restaurar se houve falha
      currentCaptureState?.status === 'failed';

    if (shouldRestore) {
      await ensureIsolationRestored(logger);
    }
  }
}

/**
 * Cancela captura em andamento
 * Requirement 6.4, 6.5: Restaurar extensões em qualquer cenário
 */
async function cancelCapture(logger: AuditLogger): Promise<MessageResponse> {
  if (!currentCaptureState) {
    return {
      success: false,
      error: 'Nenhuma captura em andamento',
    };
  }

  // Capturar tipo antes de modificar estado
  const captureType = currentCaptureState.type;

  try {
    // Para vídeo, usar o novo pipeline de cancelamento
    if (captureType === 'video' && isVideoCaptureActive()) {
      logger.info('CAPTURE', 'CANCELLING_VIDEO_WITH_PIPELINE', {
        captureId: currentCaptureState.id,
      });
      
      const result = await cancelVideoCaptureWithPipeline(logger);
      
      if (!result.success) {
        logger.warn('CAPTURE', 'VIDEO_CANCEL_PARTIAL', { error: result.error });
      }
    } else {
      // Enviar mensagem para content script cancelar (screenshot)
      await chrome.tabs.sendMessage(currentCaptureState.tabId, {
        type: 'CANCEL_CAPTURE',
      });
    }

    currentCaptureState.status = 'failed';
    currentCaptureState.error = 'Captura cancelada pelo usuário';
    await persistCaptureState(currentCaptureState);

    logger.info('CAPTURE', 'CAPTURE_CANCELLED', {
      captureId: currentCaptureState.id,
      type: captureType,
    });

    await clearCaptureState();

    // Limpar badge se era gravação de vídeo
    if (captureType === 'video') {
      await clearBadgeProgress();
      logger.info('CAPTURE', 'VIDEO_BADGE_CLEARED_ON_CANCEL', {});
      
      // Resetar RecordingStateManager para limpar estado no SidePanel
      const stateManager = getRecordingStateManager();
      stateManager.reset();
      logger.info('CAPTURE', 'RECORDING_STATE_RESET_ON_CANCEL', {});
      
      // Fechar SidePanel após cancelamento
      try {
        const sidePanelHandler = getSidePanelHandler({ logger });
        await sidePanelHandler.close();
      } catch {
        // Ignorar erro - SidePanel pode não estar aberto
      }
    }

    return { success: true };
  } catch (error) {
    logger.error('CAPTURE', 'CAPTURE_CANCEL_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    return {
      success: false,
      error: 'Falha ao cancelar captura',
    };
  } finally {
    // Requirement 6.4, 6.5: Garantir restauração de extensões
    await ensureIsolationRestored(logger);

    // Garantir restauração do isolamento de abas (tab lockdown)
    // O ensureIsolationRestored só restaura extensões, não o tab isolation
    try {
      const { getTabIsolationManager: getTabIsoMgr } = await import('./managers/isolation-managers');
      const tabIsoMgr = getTabIsoMgr(logger);
      await tabIsoMgr.deactivateLockdown(false);
      logger.info('CAPTURE', 'TAB_ISOLATION_RESTORED_ON_CANCEL_FINALLY', {});
    } catch (tabIsoError) {
      logger.warn('CAPTURE', 'TAB_ISOLATION_RESTORE_FAILED_ON_CANCEL', {
        error: tabIsoError instanceof Error ? tabIsoError.message : 'Erro desconhecido',
      });
    }
  }
}

// ============================================================================
// Funções de Preview e Confirmação (Requisito 12)
// ============================================================================

/**
 * Obtém contagem de evidências pendentes de confirmação do usuário
 * Requisito 12: Notificações de Pré-Visualização
 * 
 * @returns Número de evidências pendentes
 */
async function getPendingCount(): Promise<number> {
  const logger = getLogger();

  try {
    const sbClient = getSupabaseClient();
    const { data: { user } } = await sbClient.auth.getUser();

    if (!user) {
      logger.warn('PREVIEW', 'PENDING_COUNT_NO_AUTH', {});
      return 0;
    }

    // Busca contagem de evidencias pendentes via Supabase direto
    const { count, error } = await sbClient
      .from('evidences')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending_review');

    if (error) {
      logger.error('PREVIEW', 'PENDING_COUNT_QUERY_ERROR', {
        error: error.message,
      });
      return 0;
    }

    logger.info('PREVIEW', 'PENDING_COUNT_FETCHED', {
      total: count ?? 0,
    });

    return count ?? 0;
  } catch (error) {
    logger.error('PREVIEW', 'PENDING_COUNT_ERROR', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return 0;
  }
}

/**
 * Atualiza badge da extensão com contagem de evidências pendentes
 * Requisito 12: Notificações de Pré-Visualização
 * 
 * @param count - Número de evidências pendentes (opcional, busca automaticamente se não fornecido)
 */
async function updateBadgeWithPendingCount(count?: number): Promise<void> {
  const logger = getLogger();

  try {
    const pendingCount = count ?? await getPendingCount();

    if (pendingCount > 0) {
      await chrome.action.setBadgeText({ text: pendingCount.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.PENDING_COLOR });

      logger.info('PREVIEW', 'BADGE_UPDATED', {
        count: pendingCount,
        color: BADGE_CONFIG.PENDING_COLOR,
      });
    } else {
      // Limpar badge se não há pendentes
      await chrome.action.setBadgeText({ text: '' });

      logger.info('PREVIEW', 'BADGE_CLEARED', {});
    }
  } catch (error) {
    logger.error('PREVIEW', 'BADGE_UPDATE_ERROR', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Resposta do endpoint /api/auth/sso-link do frontend
 */
interface SSOLinkResponse {
  /** URL completa do callback SSO */
  ssoUrl: string;
  /** Timestamp de expiração do código (ISO 8601) */
  expiresAt: string;
}

/**
 * Gera link de preview com SSO (Single Sign-On)
 * Permite autenticação automática no frontend quando o usuário abre preview.
 *
 * O endpoint SSO está no frontend (não na API REST).
 * Fluxo: extensão -> POST /api/auth/sso-link -> recebe ssoUrl -> abre no browser
 *
 * @param evidenceId - ID da evidência para preview
 * @param refreshToken - Refresh token do Supabase
 * @param logger - Logger para auditoria
 * @returns URL com código de autenticação ou null se falhar
 */
async function generateSSOPreviewLink(
  evidenceId: string,
  refreshToken: string,
  logger: AuditLogger
): Promise<string | null> {
  try {
    logger.info('PREVIEW', 'SSO_PREVIEW_LINK_GENERATING', {
      evidenceId,
      hasRefreshToken: !!refreshToken,
    });

    // O endpoint SSO está no frontend, não na API REST
    const ssoEndpoint = `${FRONTEND_URL}/api/auth/sso-link`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(ssoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
        redirectPath: `/preview/${evidenceId}`,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.warn('PREVIEW', 'SSO_PREVIEW_LINK_FAILED', {
        evidenceId,
        status: response.status,
        error: (errorData as { error?: string }).error ?? 'Erro desconhecido',
      });
      return null;
    }

    const responseBody = await response.json() as {
      success: boolean;
      data: SSOLinkResponse;
    };

    const data = responseBody.data;

    logger.info('PREVIEW', 'SSO_PREVIEW_LINK_SUCCESS', {
      evidenceId,
      expiresAt: data.expiresAt,
    });

    // O sso-link retorna a URL completa com o callback SSO
    return data.ssoUrl;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    logger.error('PREVIEW', 'SSO_PREVIEW_LINK_ERROR', {
      evidenceId,
      isTimeout,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return null;
  }
}

/**
 * Abre página de preview em nova aba
 * Requisito 12: Notificações de Pré-Visualização
 *
 * Fluxo SSO:
 * 1. Verifica se usuário está autenticado (tem refresh token)
 * 2. Se sim, gera link com código SSO para autenticação automática
 * 3. Se não autenticado ou SSO falhar, abre URL normal
 *
 * @param evidenceId - ID da evidência para preview
 * @returns ID da aba criada ou null se falhou
 */
async function openPreviewTab(evidenceId: string): Promise<number | null> {
  const logger = getLogger();

  try {
    // 1. Verificar se usuário está autenticado
    const tokens = await getStoredTokens();
    let previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;

    // 2. Se autenticado, tentar gerar link com SSO
    if (tokens?.refreshToken) {
      logger.info('PREVIEW', 'SSO_ATTEMPT', {
        evidenceId,
        hasRefreshToken: true,
      });

      const ssoUrl = await generateSSOPreviewLink(
        evidenceId,
        tokens.refreshToken,
        logger
      );

      if (ssoUrl) {
        previewUrl = ssoUrl;
        logger.info('PREVIEW', 'SSO_URL_GENERATED', {
          evidenceId,
          hasSSOCode: previewUrl.includes('auth_code='),
        });
      } else {
        logger.warn('PREVIEW', 'SSO_FALLBACK_TO_NORMAL', {
          evidenceId,
          reason: 'SSO link generation failed',
        });
      }
    } else {
      logger.info('PREVIEW', 'NO_SSO_NOT_AUTHENTICATED', {
        evidenceId,
        reason: 'No refresh token available',
      });
    }

    // 3. Abrir aba com URL (com ou sem SSO)
    const tab = await chrome.tabs.create({
      url: previewUrl,
      active: true,
    });

    // 4. Fechar o Side Panel automaticamente após abrir o preview
    try {
      const sidePanelHandler = getSidePanelHandler({ logger });
      await sidePanelHandler.close();
    } catch {
      // Ignorar erro se Side Panel não estiver aberto
    }

    logger.info('PREVIEW', 'PREVIEW_TAB_OPENED', {
      evidenceId,
      tabId: tab.id,
      url: previewUrl,
      hasSSO: previewUrl.includes('auth_code='),
    });

    return tab.id ?? null;
  } catch (error) {
    logger.error('PREVIEW', 'PREVIEW_TAB_ERROR', {
      evidenceId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return null;
  }
}

/**
 * Agenda alarmes para notificações de lembrete e urgente
 * Requisito 12: Notificações de Pré-Visualização
 * 
 * @param evidenceId - ID da evidência
 */
async function schedulePreviewAlarms(evidenceId: string): Promise<void> {
  const logger = getLogger();

  try {
    // Alarme de lembrete (15 min antes de expirar = 45 min após captura)
    const reminderAlarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
    await chrome.alarms.create(reminderAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
    });

    // Alarme urgente (5 min antes de expirar = 55 min após captura)
    const urgentAlarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
    await chrome.alarms.create(urgentAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
    });

    // Alarme de expiração (24h após captura)
    const expirationAlarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;
    await chrome.alarms.create(expirationAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
    });

    logger.info('PREVIEW', 'ALARMS_SCHEDULED', {
      evidenceId,
      reminderAlarmName,
      reminderDelayMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
      urgentAlarmName,
      urgentDelayMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
      expirationAlarmName,
      expirationDelayMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
    });
  } catch (error) {
    logger.error('PREVIEW', 'ALARMS_SCHEDULE_ERROR', {
      evidenceId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Cancela alarmes de preview para uma evidência
 * Chamado quando evidência é confirmada, descartada ou expirada
 * 
 * @param evidenceId - ID da evidência
 */
async function cancelPreviewAlarms(evidenceId: string): Promise<void> {
  const logger = getLogger();

  try {
    const reminderAlarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
    const urgentAlarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
    const expirationAlarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;

    await chrome.alarms.clear(reminderAlarmName);
    await chrome.alarms.clear(urgentAlarmName);
    await chrome.alarms.clear(expirationAlarmName);

    logger.info('PREVIEW', 'ALARMS_CANCELLED', {
      evidenceId,
    });
  } catch (error) {
    logger.error('PREVIEW', 'ALARMS_CANCEL_ERROR', {
      evidenceId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Handler para alarmes de preview (lembrete e urgente)
 * Requisito 12: Notificações de Pré-Visualização
 * 
 * @param alarmName - Nome do alarme disparado
 */
async function handlePreviewAlarm(alarmName: string): Promise<void> {
  const logger = getLogger();

  try {
    const notificationManager = getNotificationManager(logger);

    if (alarmName.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX)) {
      // Alarme de lembrete (15 min antes)
      const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX, '');

      logger.info('PREVIEW', 'REMINDER_ALARM_TRIGGERED', {
        evidenceId,
        minutesRemaining: 15,
      });

      // Requisito 12.1: Notificação de lembrete
      await notificationManager.notifyPreviewReminder(evidenceId);

    } else if (alarmName.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX)) {
      // Alarme urgente (5 min antes)
      const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.URGENT_PREFIX, '');

      logger.info('PREVIEW', 'URGENT_ALARM_TRIGGERED', {
        evidenceId,
        minutesRemaining: 5,
      });

      // Requisito 12.2: Notificação urgente
      await notificationManager.notifyPreviewUrgent(evidenceId);

    } else if (alarmName.startsWith(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX)) {
      // Alarme de expiração
      const evidenceId = alarmName.replace(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX, '');

      logger.info('PREVIEW', 'EXPIRATION_ALARM_TRIGGERED', {
        evidenceId,
      });

      // Requisito 12.3: Notificação de expiração
      await notificationManager.notifyPreviewExpired(evidenceId);

      // Atualizar status no pipeline para EXPIRED
      await getEvidencePipeline().expire(evidenceId);

      // Atualizar badge após expiração
      await updateBadgeWithPendingCount();
    }
  } catch (error) {
    logger.error('PREVIEW', 'ALARM_HANDLER_ERROR', {
      alarmName,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Executa fluxo pós-captura para preview
 * Requisito 12: Notificações de Pré-Visualização
 * Requisito 13: Integração com Extensão Chrome
 * 
 * NÃO envia para fila de certificação automaticamente.
 * Abre página de preview para usuário confirmar ou descartar.
 * 
 * @param evidenceId - ID da evidência capturada
 * @param logger - Logger para auditoria
 */
async function executePostCapturePreviewFlow(
  evidenceId: string,
  logger: AuditLogger
): Promise<void> {
  logger.info('PREVIEW', 'POST_CAPTURE_FLOW_START', {
    evidenceId,
  });

  try {
    // 1. Atualizar badge com contagem de pendentes
    await updateBadgeWithPendingCount();

    // 2. Abrir página de preview em nova aba
    const tabId = await openPreviewTab(evidenceId);

    if (!tabId) {
      logger.warn('PREVIEW', 'PREVIEW_TAB_NOT_OPENED', {
        evidenceId,
      });
    }

    // 3. Agendar alarmes para notificações
    await schedulePreviewAlarms(evidenceId);

    logger.info('PREVIEW', 'POST_CAPTURE_FLOW_COMPLETE', {
      evidenceId,
      tabId,
    });
  } catch (error) {
    logger.error('PREVIEW', 'POST_CAPTURE_FLOW_ERROR', {
      evidenceId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Processa conclusão da captura (sucesso ou falha)
 * Garante que o isolamento seja desativado em qualquer cenário
 * 
 * MODIFICAÇÃO (Requisito 12): Após captura bem-sucedida, NÃO envia para
 * fila de certificação automaticamente. Em vez disso, executa fluxo de
 * preview para usuário confirmar ou descartar.
 *
 * @param success - Se a captura foi bem-sucedida
 * @param error - Mensagem de erro se falhou
 * @param logger - Logger para auditoria
 */
async function handleCaptureComplete(
  success: boolean,
  error: string | undefined,
  logger: AuditLogger
): Promise<MessageResponse> {
  logger.info('CAPTURE', 'CAPTURE_COMPLETE_HANDLER', {
    success,
    error,
    captureId: currentCaptureState?.id,
    currentStatus: currentCaptureState?.status,
    isIsolationActive: isIsolationActiveForCapture,
  });

  // IMPORTANTE: Este handler é chamado pelo content script quando a captura
  // de screenshot termina, MAS o service worker ainda precisa processar
  // a resposta e fazer upload. NÃO devemos limpar o estado aqui se
  // o status ainda é 'initializing' ou 'lockdown_active' ou 'capturing'.
  // O estado só deve ser limpo após o upload completo ou falha definitiva.

  const statusQuePermiteLimpeza = ['completed', 'failed', 'uploading'];
  const podeAtualizar = currentCaptureState &&
    !statusQuePermiteLimpeza.includes(currentCaptureState.status);

  // Capturar evidenceId e tipo antes de qualquer modificação de estado
  const evidenceId = currentCaptureState?.id;
  const captureType = currentCaptureState?.type;

  try {
    // Requirement 20.5: Badge pisca quando gravação de vídeo é finalizada
    if (captureType === 'video') {
      if (success) {
        // Piscar badge ao completar gravação com sucesso
        await blinkBadgeOnComplete(100);
        logger.info('CAPTURE', 'VIDEO_BADGE_BLINK_COMPLETE', {
          captureId: evidenceId,
        });
      } else {
        // Mostrar erro no badge se falhou
        await setBadgeError('!');
        logger.info('CAPTURE', 'VIDEO_BADGE_ERROR_SET', {
          captureId: evidenceId,
          error,
        });
        // Limpar badge de erro após 3 segundos
        setTimeout(() => {
          clearBadgeProgress().catch(() => {
            // Ignorar erros
          });
        }, 3000);
      }
    }

    if (currentCaptureState) {
      // Só atualiza status se ainda não foi marcado como completed/failed pelo fluxo principal
      if (podeAtualizar) {
        logger.info('CAPTURE', 'CAPTURE_COMPLETE_SKIP_STATUS_UPDATE', {
          reason: 'Status será atualizado pelo fluxo principal após upload',
          currentStatus: currentCaptureState.status,
        });
      } else if (currentCaptureState.status !== 'completed') {
        // Só atualiza se não foi marcado como completed pelo upload
        currentCaptureState.status = success ? 'completed' : 'failed';
        if (error) {
          currentCaptureState.error = error;
        }
        await persistCaptureState(currentCaptureState);
      }
    }

    // NOVO (Requisito 12): Executar fluxo de preview após captura bem-sucedida
    // NÃO envia para fila de certificação automaticamente
    if (success && evidenceId) {
      logger.info('PREVIEW', 'INITIATING_POST_CAPTURE_FLOW', {
        evidenceId,
        note: 'Captura bem-sucedida - iniciando fluxo de preview',
      });

      // Executar fluxo de preview de forma assíncrona (não bloqueia resposta)
      // O fluxo abre aba de preview, atualiza badge e agenda alarmes
      executePostCapturePreviewFlow(evidenceId, logger).catch((flowError) => {
        logger.error('PREVIEW', 'POST_CAPTURE_FLOW_ASYNC_ERROR', {
          evidenceId,
          error: flowError instanceof Error ? flowError.message : 'Erro desconhecido',
        });
      });
    }

    return { success: true };
  } finally {
    // SEMPRE restaurar isolamento quando captura termina
    await ensureIsolationRestored(logger);

    // NÃO limpar estado aqui - o fluxo principal (handleStartCapture) 
    // é responsável por limpar após upload completo ou falha definitiva.
    // Limpar aqui causa race condition onde currentCaptureState fica null
    // antes do service worker processar a resposta do PISA.
    logger.info('CAPTURE', 'CAPTURE_COMPLETE_HANDLER_DONE', {
      captureId: currentCaptureState?.id,
      finalStatus: currentCaptureState?.status,
    });
  }
}

/**
 * Força reset do estado de isolamento
 * Útil quando o estado fica inconsistente
 *
 * @param logger - Logger para auditoria
 */
async function forceResetIsolation(logger: AuditLogger): Promise<MessageResponse> {
  logger.info('ISOLATION', 'FORCE_RESET_REQUESTED', {
    isIsolationActive: isIsolationActiveForCapture,
  });

  try {
    const manager = getIsolationManager(logger);
    const status = manager.getIsolationStatus();

    if (status.isActive) {
      const result = await manager.forceRestore();
      logger.info('ISOLATION', 'FORCE_RESET_COMPLETE', {
        restoredCount: result.restoredExtensions.length,
        failedCount: result.failedExtensions.length,
      });
    }

    // Resetar flag local
    isIsolationActiveForCapture = false;

    // Limpar estado de captura se houver
    if (currentCaptureState) {
      currentCaptureState.status = 'failed';
      currentCaptureState.error = 'Captura interrompida por reset de isolamento';
      await persistCaptureState(currentCaptureState);
      await clearCaptureState();
    }

    return { success: true };
  } catch (error) {
    logger.error('ISOLATION', 'FORCE_RESET_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    // Mesmo em erro, resetar flag local
    isIsolationActiveForCapture = false;

    return {
      success: false,
      error: `Falha ao resetar isolamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
    };
  }
}

/**
 * Obtém status da captura atual
 */
async function getCaptureStatus(): Promise<MessageResponse<CaptureState | null>> {
  return {
    success: true,
    data: currentCaptureState,
  };
}

// ============================================================================
// Handlers de Autenticação
// ============================================================================

/**
 * Verifica status de autenticação do usuário
 */
async function getAuthStatus(): Promise<MessageResponse<AuthStatusResponse>> {
  try {
    const tokens = await getStoredTokens();
    const user = await getStoredUser();

    const isAuthenticated = !!(tokens?.accessToken && user && !isTokenExpired(tokens.expiresAt));

    const response: AuthStatusResponse = {
      isAuthenticated,
    };

    if (isAuthenticated && user) {
      // Re-busca dados frescos do Supabase (creditos, avatar, nome)
      try {
        const sbClient = getSupabaseClient();
        const { data: { user: authUser } } = await sbClient.auth.getUser();

        if (authUser) {
          // Busca perfil atualizado
          const { data: profile } = await sbClient
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', authUser.id)
            .single();

          if (profile) {
            user.name = profile.full_name ?? user.name;
            // Prioridade: avatar do app > avatar do Google > nenhum
            user.avatarUrl = profile.avatar_url
              ?? (authUser.user_metadata?.['avatar_url'] as string | undefined)
              ?? (authUser.user_metadata?.['picture'] as string | undefined)
              ?? user.avatarUrl;
          }

          // Busca creditos atualizados via RPC
          const { data: creditBalance } = await sbClient
            .rpc('get_user_credit_balance', { p_user_id: authUser.id });

          if (creditBalance !== null && creditBalance !== undefined) {
            user.credits = creditBalance;
          }

          // Atualiza storage com dados frescos
          await storeUser(user);
        }
      } catch (refreshError) {
        // Nao bloqueia - retorna dados do storage se falhar
        console.warn('[getAuthStatus] Erro ao atualizar dados do perfil:', refreshError);
      }

      response.user = user;
    }

    return {
      success: true,
      data: response,
    };
  } catch {
    return {
      success: false,
      error: 'Erro ao verificar status de autenticacao',
    };
  }
}

// Interface LoginAPIResponse removida - login migrado para Supabase Auth
// Tipos de resposta agora são gerenciados pelo AuthManagerSupabase

/**
 * Realiza login do usuário via Supabase Auth
 * Usa AuthManagerSupabase para autenticação
 */
async function handleLogin(
  payload: LoginPayload,
  logger: AuditLogger
): Promise<MessageResponse> {
  // Adiciona breadcrumb para rastrear login
  addBreadcrumb({
    category: 'auth',
    message: 'Login attempt com Supabase',
    level: 'info',
    data: { email: payload.email },
  });

  logger.info('AUTH', 'LOGIN_ATTEMPT_SUPABASE', {
    email: payload.email,
    hasPassword: !!payload.password,
    passwordLength: payload.password?.length ?? 0,
  });

  try {
    // Limpar tokens antigos antes do login
    await clearAuthData();
    logger.info('AUTH', 'CLEARED_OLD_TOKENS', {});

    // Obter AuthManager (Supabase)
    const authManager = getAuthManager({ logger });

    logger.info('AUTH', 'LOGIN_SUPABASE_START', {
      email: payload.email,
    });

    // Fazer login via Supabase
    const result = await authManager.login({
      email: payload.email,
      password: payload.password,
    });

    logger.info('AUTH', 'LOGIN_SUPABASE_RESPONSE', {
      success: result.success,
      hasUser: !!result.user,
      hasTokens: !!result.tokens,
      error: result.error,
    });

    // Verificar se login falhou
    if (!result.success || !result.user || !result.tokens) {
      logger.warn('AUTH', 'LOGIN_FAILED_SUPABASE', {
        email: payload.email,
        error: result.error,
      });

      return {
        success: false,
        error: result.error ?? 'Email ou senha inválidos',
        errorCode: ErrorCodes.AUTH_INVALID_CREDENTIALS,
      };
    }

    // Login bem-sucedido - dados já foram salvos no storage pelo AuthManager
    logger.info('AUTH', 'LOGIN_SUCCESS_SUPABASE', {
      userId: result.user.id,
      credits: result.user.credits,
      name: result.user.name,
    });

    // Define usuário no Sentry para rastreamento
    setUser({
      id: result.user.id,
      email: result.user.email,
      ...(result.user.name && { name: result.user.name }),
    });

    // Inicializa handler de notificações após login bem-sucedido
    await initializeNotificationHandler();

    // Inicializa Realtime para mudancas de status de evidencias
    await initializeEvidenceRealtime();

    // Verificar versao da extensao apos login
    executeVersionCheck().catch((err) => {
      captureException(err);
    });

    // Setup do alarme de refresh (Supabase já faz auto-refresh, mas mantemos por compatibilidade)
    await setupTokenRefreshAlarm();

    return {
      success: true,
      data: { user: result.user },
      tokens: result.tokens,
    };
  } catch (error) {
    // Captura exceção no Sentry
    captureException(error, {
      context: 'login-supabase',
      email: payload.email,
    });

    logger.error('AUTH', 'LOGIN_FAILED_SUPABASE', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao fazer login com Supabase',
      errorCode: ErrorCodes.AUTH_INVALID_CREDENTIALS,
    };
  }
}

/**
 * Realiza login via Google OAuth usando chrome.identity.launchWebAuthFlow
 *
 * Fluxo:
 * 1. Obtem URL de OAuth do Supabase com skipBrowserRedirect
 * 2. Abre janela de autenticacao Google via chrome.identity
 * 3. Extrai tokens do fragmento da URL de retorno
 * 4. Configura sessao no Supabase com os tokens obtidos
 * 5. Converte usuario e armazena dados
 */
async function handleGoogleLogin(logger: AuditLogger): Promise<MessageResponse> {
  addBreadcrumb({
    category: 'auth',
    message: 'Google native login attempt',
    level: 'info',
  });

  logger.info('AUTH', 'GOOGLE_LOGIN_ATTEMPT', {});
  const method = 'handleGoogleLogin';
  logger.info('AUTH', `${method}_START`, {});

  try {
    // 1. Limpar tokens antigos
    await clearAuthData();

    const authManager = getAuthManager({ logger });
    const supabase = authManager.getSupabaseClient();
    
    // 2. Configurar parâmetros OAuth2
    // client_id configurado via VITE_GOOGLE_CLIENT_ID no .env.local (veja .env.example)
    const clientId = import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '';
    const redirectUri = chrome.identity.getRedirectURL(); // https://<sw-id>.chromiumapp.org/
    const nonce = generateCorrelationId(); // Usar UUID como nonce seguro
    
    // Scopes OIDC necessários
    const scopes = ['openid', 'email', 'profile'];
    
    // URL de autorização Google
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'id_token'); // Pedir ID Token explicitamente
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account'); // Forçar seleção de conta para evitar loop se algo estiver errado

    logger.info('AUTH', 'LAUNCHING_WEB_AUTH_FLOW', { redirectUri });

    // 3. Iniciar fluxo Web Auth
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (chrome.runtime.lastError || !responseUrl) {
      throw new Error(chrome.runtime.lastError?.message ?? 'Login cancelado ou falhou');
    }

    // 4. Extrair ID Token da URL (fragmento)
    const url = new URL(responseUrl);
    const params = new URLSearchParams(url.hash.substring(1)); // Remove o # inicial
    const idToken = params.get('id_token');
    const error = params.get('error');

    if (error) {
      throw new Error(`Erro do Google OAuth: ${error}`);
    }

    if (!idToken) {
      throw new Error('ID Token não encontrado na resposta');
    }

    logger.info('AUTH', 'ID_TOKEN_OBTAINED', {});

    // 5. Autenticar no Supabase usando o ID Token
    // 5. Autenticar no Supabase usando o ID Token
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: nonce,
    });

    if (sessionError) {
      logger.error('AUTH', 'SUPABASE_SIGNIN_FAILED', { error: sessionError.message });
      throw sessionError;
    }

    if (!sessionData.session || !sessionData.user) {
      throw new Error('Sessão não criada pelo Supabase');
    }

    logger.info('AUTH', 'SUPABASE_SESSION_CREATED', { userId: sessionData.user.id });

    // 6. Persistir sessão usando AuthManager
    const result = await authManager.setSessionFromOAuth(sessionData.session);

    if (!result.success || !result.user) {
      throw new Error(result.error ?? 'Falha ao processar sessão OAuth');
    }

    const user = result.user;
    logger.info('AUTH', 'SUPABASE_SESSION_PROCESSED', { userId: user.id });

    // 7. Configurações pós-login
    if (user.email) {
      setUser({ email: user.email, id: user.id });
    }

    await initializeNotificationHandler();
    await initializeEvidenceRealtime();
    executeVersionCheck().catch(err => captureException(err));
    // O RefreshCheck já é iniciado dentro do setSessionFromOAuth

    // Notificar sucesso
    return { success: true, data: { user } };

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Erro desconhecido no login Google');
    logger.error('AUTH', 'GOOGLE_SIGNIN_FAILED', { error: err.message });
    
    return {
      success: false,
      error: ErrorCodes.AUTH_INVALID_CREDENTIALS, // Usando um código existente válido
      details: err.message,
    };
  }
}

/**
 * Realiza logout do usuário via API HTTP
 * Usa chamadas HTTP para evitar erro "document is not defined" do AWS SDK em service workers
 */
async function handleLogout(logger: AuditLogger): Promise<MessageResponse> {
  logger.info('AUTH', 'LOGOUT_ATTEMPT', {});

  try {
    // Desconectar Realtime de evidencias antes de limpar dados
    await disconnectEvidenceRealtime();

    // Com Supabase Auth, o logout é feito localmente
    // Não há necessidade de chamar endpoint no backend
    // Os tokens JWT expiram naturalmente e o Supabase gerencia sessões internamente
    await clearAuthData();
    await chrome.alarms.clear(AUTH_CONFIG.REFRESH_ALARM_NAME);

    // Limpar alarme de verificacao de versao
    await chrome.alarms.clear(VERSION_CHECK_ALARM_NAME);

    // Limpar cache de verificacao de versao
    await clearVersionCheckCache();

    // Limpar status de versao do storage
    await chrome.storage.local.remove('lexato:version-status');

    logger.info('AUTH', 'LOGOUT_SUCCESS', {});

    return { success: true };
  } catch (error) {
    logger.error('AUTH', 'LOGOUT_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });

    return {
      success: false,
      error: 'Falha ao fazer logout',
    };
  }
}

// ============================================================================
// Handlers de Eventos do Chrome
// ============================================================================

/**
 * Handler de instalação da extensão
 */
chrome.runtime.onInstalled.addListener((details) => {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  logger.info('GENERAL', 'EXTENSION_INSTALLED', {
    reason: details.reason,
    previousVersion: details.previousVersion,
  });

  // Configuração inicial
  if (details.reason === 'install') {
    chrome.storage.local.set({
      [STORAGE_KEYS.INSTALLED_AT]: new Date().toISOString(),
      [STORAGE_KEYS.VERSION]: chrome.runtime.getManifest().version,
    });
  }

  // Inicializar ExtensionIsolationManager e verificar snapshots pendentes
  // Requirement 8.2: Verificar snapshots pendentes ao iniciar
  initializeIsolationManager();

  // Inicializar handler de notificações
  initializeNotificationHandler();

  // Inicializar Realtime para mudancas de status de evidencias
  initializeEvidenceRealtime();

  // Configurar alarme de refresh de token
  setupTokenRefreshAlarm();

  // Configurar verificacao periodica de versao e executar primeira verificacao
  setupVersionCheckAlarm();
  executeVersionCheck().catch((err) => {
    captureException(err);
  });
});

// ============================================================================
// Configuração do Side Panel (Requisitos 1.2, 1.3, 1.4)
// ============================================================================

/**
 * Configura o comportamento do Side Panel na inicialização do Service Worker.
 *
 * IMPORTANTE: openPanelOnActionClick DEVE ser false quando default_popup está definido.
 * Se true, o Chrome ignora o popup e abre o Side Panel diretamente ao clicar no ícone.
 * Com false, o popup é exibido normalmente e o Side Panel só abre via chrome.sidePanel.open().
 *
 * Requisito 1.3: setPanelBehavior deve ser chamado durante a inicialização.
 */
try {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
      const logger = getLogger();
      logger.warn('GENERAL', 'SIDEPANEL_SET_BEHAVIOR_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido ao configurar comportamento do Side Panel',
      });
    });
  } else {
    const logger = getLogger();
    logger.error('GENERAL', 'SIDEPANEL_API_NOT_AVAILABLE', {
      error: 'API chrome.sidePanel não está disponível neste navegador',
    });

    // Exibir notificação ao usuário sobre incompatibilidade
    const notificationManager = getNotificationManager();
    notificationManager.notifyError(
      'Side Panel indisponível',
      'A API chrome.sidePanel não está disponível. Verifique se o Chrome está na versão 116 ou superior.'
    );
  }
} catch (error) {
  const logger = getLogger();
  logger.error('GENERAL', 'SIDEPANEL_INIT_FAILED', {
    error: error instanceof Error ? error.message : 'Erro desconhecido na inicialização do Side Panel',
  });
}

/**
 * NOTA: chrome.action.onClicked NÃO dispara quando default_popup está definido.
 * O popup agora é o ponto de entrada principal (login, seleção de tipo de captura).
 * Para vídeo, o popup obtém streamId via tabCapture (user gesture) e envia
 * OPEN_SIDEPANEL_FOR_VIDEO ao service worker para abrir o Side Panel.
 *
 * O handler onClicked foi removido porque:
 * - Com default_popup no manifest, o Chrome abre o popup automaticamente
 * - O evento onClicked simplesmente não é disparado nessa configuração
 */

/**
 * Handler de comandos de atalho de teclado
 *
 * Atalhos disponíveis:
 * - open_diagnostic: Ctrl+Shift+D (Windows/Linux) / Cmd+Shift+D (Mac)
 *   Abre o Side Panel na seção de diagnóstico
 *
 * Requisitos: 7.5, 7.6
 */
chrome.commands.onCommand.addListener(async (command) => {
  const logger = getLogger();

  logger.info('GENERAL', 'COMMAND_RECEIVED', { command });

  if (command === 'open_diagnostic') {
    try {
      // Sinalizar que deve abrir na seção de diagnóstico
      await chrome.storage.local.set({ lexato_open_diagnostic: true });

      // Obter janela ativa e abrir Side Panel
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (error) {
      logger.error('GENERAL', 'OPEN_DIAGNOSTIC_SIDEPANEL_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido ao abrir Side Panel para diagnóstico',
      });
    }
  }
});

/**
 * Handler de startup do Service Worker
 */
chrome.runtime.onStartup.addListener(() => {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  logger.info('GENERAL', 'SERVICE_WORKER_STARTED', {});

  // Recuperar estado de captura se houver
  recoverCaptureState().then(async (state) => {
    if (state && state.status !== 'completed' && state.status !== 'failed') {
      // Timeout diferenciado por tipo de captura:
      // - Screenshot: 5 minutos (processo rápido)
      // - Vídeo: 35 minutos (gravação pode durar até 30 min + 5 min de margem)
      const isVideo = state.type === 'video';
      const staleTimeoutMs = isVideo
        ? 35 * 60 * 1000  // 35 minutos para vídeo
        : 5 * 60 * 1000;  // 5 minutos para screenshot
      const stateAge = Date.now() - (state.startedAt ?? 0);
      const isStale = stateAge > staleTimeoutMs;

      if (isStale) {
        logger.warn('CAPTURE', 'STALE_CAPTURE_STATE_CLEARED', {
          captureId: state.id,
          status: state.status,
          type: state.type,
          ageMs: stateAge,
          staleTimeoutMs,
          message: 'Estado de captura antigo detectado e limpo automaticamente',
        });
        await clearCaptureState();
        return;
      }

      logger.warn('CAPTURE', 'CAPTURE_STATE_RECOVERED', {
        captureId: state.id,
        status: state.status,
        type: state.type,
        ageMs: stateAge,
      });
      currentCaptureState = state;
    }
  });

  // Inicializar ExtensionIsolationManager e verificar snapshots pendentes
  // Requirement 8.2: Verificar snapshots pendentes ao iniciar service worker
  initializeIsolationManager();

  // Inicializar handler de notificações
  initializeNotificationHandler();

  // Inicializar Realtime para mudancas de status de evidencias
  initializeEvidenceRealtime();

  // Configurar alarme de refresh de token
  setupTokenRefreshAlarm();

  // Configurar verificacao periodica de versao e executar primeira verificacao
  setupVersionCheckAlarm();
  executeVersionCheck().catch((err) => {
    captureException(err);
  });
});

/**
 * Handler de alarmes
 * Requisito 3.2: Refresh automático de tokens
 * Requisito 12: Notificações de preview (lembrete, urgente e expiração)
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  const logger = getLogger();

  // Alarme de verificacao de versao da extensao
  if (alarm.name === VERSION_CHECK_ALARM_NAME) {
    executeVersionCheck().catch((err) => {
      logger.error('GENERAL', 'VERSION_CHECK_ALARM_FAILED', {
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      captureException(err);
    });
    return;
  }

  // Alarme de refresh de token
  if (alarm.name === AUTH_CONFIG.REFRESH_ALARM_NAME) {
    checkAndRefreshToken(logger);
    return;
  }

  // Alarme de auto-stop de gravação de vídeo (30 minutos)
  if (alarm.name === VIDEO_AUTO_STOP_ALARM_NAME) {
    logger.info('CAPTURE', 'VIDEO_AUTO_STOP_ALARM_TRIGGERED', {
      captureId: currentCaptureState?.id,
      captureType: currentCaptureState?.type,
      hasActiveVideoCapture: isVideoCaptureActive(),
    });

    // Verificar se ainda há captura de vídeo ativa
    if (currentCaptureState?.type === 'video' && currentCaptureState.status === 'capturing') {
      logger.info('CAPTURE', 'VIDEO_AUTO_STOP_EXECUTING', {
        captureId: currentCaptureState.id,
      });

      stopCapture(logger).then((result) => {
        if (result.success) {
          logger.info('CAPTURE', 'VIDEO_AUTO_STOP_SUCCESS', {
            captureId: currentCaptureState?.id,
          });
        } else {
          logger.error('CAPTURE', 'VIDEO_AUTO_STOP_FAILED', {
            error: result.error,
          });
        }
      }).catch((err) => {
        logger.error('CAPTURE', 'VIDEO_AUTO_STOP_ERROR', {
          error: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      });
    } else {
      logger.info('CAPTURE', 'VIDEO_AUTO_STOP_SKIPPED', {
        reason: 'Nenhuma captura de vídeo ativa',
        currentType: currentCaptureState?.type,
        currentStatus: currentCaptureState?.status,
      });
    }
    return;
  }

  // Alarmes de preview (lembrete, urgente e expiração)
  if (alarm.name.startsWith(PREVIEW_ALARM_CONFIG.REMINDER_PREFIX) ||
    alarm.name.startsWith(PREVIEW_ALARM_CONFIG.URGENT_PREFIX) ||
    alarm.name.startsWith(PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX)) {
    handlePreviewAlarm(alarm.name).catch((error) => {
      logger.error('PREVIEW', 'ALARM_HANDLER_ASYNC_ERROR', {
        alarmName: alarm.name,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    });
    return;
  }

  // Alarmes gerenciados por seus próprios listeners (auth-manager-supabase, notification.handler)
  // Apenas ignorar silenciosamente - já são tratados nos respectivos módulos
  if (alarm.name === 'lexato_auth_refresh_check' || alarm.name === 'notification-check') {
    return;
  }

  // Alarme desconhecido
  logger.warn('GENERAL', 'UNKNOWN_ALARM', {
    alarmName: alarm.name,
  });
});

/**
 * Handler de mensagens do popup e content scripts (Requisito 3.5)
 */
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    const correlationId = message.correlationId ?? generateCorrelationId();
    const logger = getLogger(correlationId);

    // Ignorar mensagens tratadas por listeners específicos
    if (message.type === 'chunk-ready') {
      return false; // Não manter canal de comunicação aberto
    }

    // Ignorar mensagens destinadas ao offscreen document
    // Essas mensagens serão processadas pelo offscreen.ts
    const messageWithTarget = message as unknown as { target?: string };
    if (messageWithTarget.target === 'offscreen') {
      return false; // Deixar o offscreen document responder
    }

    addBreadcrumb({
      category: 'service-worker',
      message: `Mensagem recebida: ${message.type}`,
      level: 'info',
      data: { senderId: sender.id, tabId: sender.tab?.id, correlationId },
    });

    logger.info('GENERAL', 'MESSAGE_RECEIVED', {
      type: message.type,
      senderId: sender.id,
      tabId: sender.tab?.id,
    });

    // Processar mensagem de forma assíncrona
    handleMessage(message, sender, logger, correlationId)
      .then((response) => {
        addBreadcrumb({ category: 'service-worker', message: `Resposta para: ${message.type}`, level: 'info' });
        sendResponse({ ...response, correlationId });
      })
      .catch((error) => {
        const lexatoError = fromError(error, correlationId);

        logger.error('GENERAL', 'MESSAGE_HANDLER_ERROR', {
          error: lexatoError.message,
          code: lexatoError.code,
        });

        sendResponse({
          success: false,
          error: lexatoError.userMessage,
          errorCode: lexatoError.code,
          correlationId,
        });
      });

    // Retornar true para indicar resposta assíncrona
    return true;
  }
);

/**
 * Handler para buscar capturas recentes
 */
async function handleGetRecentCaptures(
  logger: AuditLogger
): Promise<MessageResponse> {
  try {
    // 1. Obter token de acesso do storage
    const tokens = await getStoredTokens();
    if (!tokens?.accessToken) {
      return {
        success: false,
        error: 'Usuário não autenticado'
      };
    }

    // 2. Obter usuário autenticado via Supabase
    // Isso valida o token e retorna o ID do usuário no Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(tokens.accessToken);
    
    if (authError || !user) {
      logger.error('CAPTURE', 'SUPABASE_AUTH_FAILED', { error: authError });
      return {
        success: false,
        error: 'Sessão inválida ou expirada'
      };
    }

    // 3. Resolver ID do usuario (profiles.id = auth.users.id no novo schema)
    let targetUserId = user.id;
    
    // Verificar existencia em 'profiles' (novo schema)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();
      
    if (profileData) {
      targetUserId = profileData.id;
    }

    if (!targetUserId) {
      logger.error('CAPTURE', 'USER_ID_RESOLUTION_FAILED');
       return {
        success: false,
        error: 'Não foi possível identificar o usuário'
      };
    }

    // 4. Buscar evidências recentes do usuário
    const { data: evidences, error: evidenceError } = await supabase
      .from('evidences')
      .select('*')
      .eq('user_id', targetUserId)
      .order('captured_at', { ascending: false }) 
      .limit(5);

    if (evidenceError) {
      logger.error('CAPTURE', 'EVIDENCE_FETCH_FAILED', { error: evidenceError });
      return {
        success: false,
        error: 'Falha ao buscar capturas'
      };
    }

    // 5. Mapear resultados para o formato da extensão
    interface EvidenceRow {
      id: string;
      type: string;
      storage_type: string;
      status: string;
      url: string;
      title: string;
      captured_at: string;
      bucket?: string;
      s3_key?: string;
    }
    const captures = await Promise.all((evidences || []).map(async (item: EvidenceRow) => {
      let screenshotUrl = undefined;
      
      // Gerar URL assinada para screenshots
      // Nota: Para vídeos, precisaríamos saber onde está o thumbnail. 
      // Por enquanto, apenas screenshots terão preview.
      if (item.type === 'SCREENSHOT' && item.bucket && item.s3_key) {
        const { data: signedData } = await supabase.storage
          .from(item.bucket)
          .createSignedUrl(item.s3_key, 3600); // 1 hora de validade
          
        if (signedData) {
          screenshotUrl = signedData.signedUrl;
        }
      }

      return {
        id: item.id,
        type: item.type ?? 'screenshot',
        storageType: (item.storage_type?.toLowerCase() ?? 'standard') as StorageType,
        status: mapBackendStatusToCaptureStatus(item.status),
        url: item.url ?? '',
        title: item.title ?? 'Sem título',
        timestamp: item.captured_at,
        screenshotUrl
      };
    }));

    return {
      success: true,
      captures
    };

  } catch (error) {
    logger.error('CAPTURE', 'GET_RECENT_FAILED', {
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
    
    return {
      success: false,
      error: 'Falha ao buscar capturas recentes'
    };
  }
}

/**
 * Mapeia status do backend para CaptureStatus
 */
function mapBackendStatusToCaptureStatus(status: string): CaptureStatus {
  switch (status) {
    case 'completed': return 'completed';
    case 'processing': return 'processing';
    case 'failed': return 'failed';
    default: return 'completed'; // Fallback seguro
  }
}

// ============================================================================
// Handler de Mensagens Externas (Webapp → Extensão)
// ============================================================================

/**
 * Tipos de mensagens aceitas do webapp
 */
type ExternalMessageType =
  | 'GET_AUTH_STATUS'
  | 'SYNC_AUTH'
  | 'SYNC_LOGOUT'
  | 'PING'
  | 'CHECK_EXTENSION';

/**
 * Dados do usuário recebidos do webapp (usa 'sub' do JWT)
 * Diferente de AuthUser que usa 'id'
 */
interface WebappAuthUser {
  /** ID único do usuário (sub do JWT Cognito) */
  sub: string;
  /** Email do usuário */
  email: string;
  /** Nome do usuário */
  name?: string;
  /** ID do tenant */
  tenantId?: string;
  /** Tipo de conta */
  accountType?: 'individual' | 'enterprise';
  /** Tipo de plano */
  planType?: 'free' | 'premium' | 'professional';
  /** Créditos disponíveis */
  credits?: number;
  /** Se MFA está habilitado */
  mfaEnabled?: boolean;
}

/**
 * Payload para sincronização de autenticação
 */
interface SyncAuthPayload {
  tokens: AuthTokens;
  user: WebappAuthUser;
}

/**
 * Mensagem externa do webapp
 */
interface ExternalMessage {
  type: ExternalMessageType;
  payload?: SyncAuthPayload;
}

/**
 * Handler de mensagens externas do webapp Lexato
 *
 * Permite sincronização bidirecional de autenticação entre webapp e extensão:
 * - GET_AUTH_STATUS: Webapp solicita status de autenticação da extensão
 * - SYNC_AUTH: Webapp envia tokens após login bem-sucedido
 * - SYNC_LOGOUT: Webapp notifica logout para sincronizar
 * - PING/CHECK_EXTENSION: Webapp verifica se extensão está instalada
 *
 * @see https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onMessageExternal
 */
chrome.runtime.onMessageExternal.addListener(
  (
    message: ExternalMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    const correlationId = generateCorrelationId();
    const logger = getLogger(correlationId);

    // Validar origem - apenas domínios lexato.com.br são aceitos (e localhost em dev)
    const isAllowedOriginResult = isOriginAllowed(sender.origin, import.meta.env.DEV);

    if (!isAllowedOriginResult) {
      logger.warn('AUTH', 'EXTERNAL_MESSAGE_BLOCKED', {
        origin: sender.origin,
        type: message.type,
        correlationId,
        message: 'Origem não autorizada para comunicação externa',
      });
      sendResponse({
        success: false,
        error: 'Origem não autorizada',
      });
      return false;
    }

    logger.info('AUTH', 'EXTERNAL_MESSAGE_RECEIVED', {
      type: message.type,
      origin: sender.origin,
      correlationId,
    });

    // Processar mensagem de forma assíncrona
    handleExternalMessage(message, logger, correlationId)
      .then(sendResponse)
      .catch((error) => {
        logger.error('AUTH', 'EXTERNAL_MESSAGE_ERROR', {
          type: message.type,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          correlationId,
        });
        sendResponse({
          success: false,
          error: 'Erro ao processar mensagem externa',
        });
      });

    // Retornar true para indicar resposta assíncrona
    return true;
  }
);

/**
 * Processa mensagens externas do webapp
 *
 * @param message - Mensagem recebida do webapp
 * @param logger - Logger para auditoria
 * @param correlationId - ID de correlação para rastreabilidade
 */
async function handleExternalMessage(
  message: ExternalMessage,
  logger: AuditLogger,
  correlationId: string
): Promise<MessageResponse> {
  switch (message.type) {
    // Verificar se extensão está instalada e funcionando
    case 'PING':
    case 'CHECK_EXTENSION':
      return {
        success: true,
        data: {
          installed: true,
          version: chrome.runtime.getManifest().version,
          name: chrome.runtime.getManifest().name,
        },
      };

    // Retornar status de autenticação atual
    case 'GET_AUTH_STATUS': {
      const authStatus = await getAuthStatus();

      logger.info('AUTH', 'EXTERNAL_AUTH_STATUS_REQUESTED', {
        isAuthenticated: authStatus.success && authStatus.data?.isAuthenticated,
        correlationId,
      });

      return authStatus;
    }

    // Receber tokens do webapp após login
    case 'SYNC_AUTH': {
      const payload = message.payload;

      if (!payload?.tokens || !payload?.user) {
        logger.warn('AUTH', 'EXTERNAL_SYNC_AUTH_INVALID_PAYLOAD', {
          hasTokens: !!payload?.tokens,
          hasUser: !!payload?.user,
          correlationId,
        });
        return {
          success: false,
          error: 'Payload inválido para sincronização de autenticação',
        };
      }

      try {
        // Converter WebappAuthUser para AuthUser (sub -> id)
        // Nota: Usamos spread condicional para evitar problemas com exactOptionalPropertyTypes
        const authUser: AuthUser = {
          id: payload.user.sub,
          email: payload.user.email,
          accountType: payload.user.accountType ?? 'individual',
          credits: payload.user.credits ?? 0,
          mfaEnabled: payload.user.mfaEnabled ?? false,
          ...(payload.user.name !== undefined ? { name: payload.user.name } : {}),
        };

        // Armazenar tokens recebidos do webapp
        await storeTokens(payload.tokens);
        await storeUser(authUser);

        // Atualizar usuário no Sentry
        setUser({
          id: authUser.id,
          email: authUser.email,
        });

        // Adicionar breadcrumb para auditoria
        addBreadcrumb({
          category: 'auth',
          message: 'Sessão sincronizada do webapp',
          level: 'info',
          data: {
            userId: authUser.id,
            email: authUser.email,
            source: 'webapp',
          },
        });

        logger.info('AUTH', 'EXTERNAL_SYNC_AUTH_SUCCESS', {
          userId: authUser.id,
          email: authUser.email,
          correlationId,
          message: 'Tokens sincronizados do webapp com sucesso',
        });

        // Configurar alarme de refresh de token
        setupTokenRefreshAlarm();

        return {
          success: true,
          data: {
            synced: true,
            user: authUser,
          },
        };
      } catch (error) {
        logger.error('AUTH', 'EXTERNAL_SYNC_AUTH_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          correlationId,
        });
        return {
          success: false,
          error: 'Falha ao sincronizar autenticação',
        };
      }
    }

    // Sincronizar logout do webapp
    case 'SYNC_LOGOUT': {
      try {
        await handleLogout(logger);

        logger.info('AUTH', 'EXTERNAL_SYNC_LOGOUT_SUCCESS', {
          correlationId,
          message: 'Logout sincronizado do webapp com sucesso',
        });

        return {
          success: true,
          data: { loggedOut: true },
        };
      } catch (error) {
        logger.error('AUTH', 'EXTERNAL_SYNC_LOGOUT_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          correlationId,
        });
        return {
          success: false,
          error: 'Falha ao sincronizar logout',
        };
      }
    }

    default:
      logger.warn('AUTH', 'EXTERNAL_MESSAGE_UNKNOWN_TYPE', {
        type: message.type,
        correlationId,
      });
      return {
        success: false,
        error: `Tipo de mensagem externa desconhecido: ${message.type}`,
      };
  }
}

// ============================================================================
// Handler Global de Erros (Requisito 3.8)
// ============================================================================

/**
 * Handler global para unhandledRejection
 */
self.addEventListener('unhandledrejection', (event) => {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  logger.critical('GENERAL', 'UNHANDLED_REJECTION', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
  });

  // Prevenir que o erro seja logado novamente pelo browser
  event.preventDefault();
});

/**
 * Handler global para erros não capturados
 */
self.addEventListener('error', (event) => {
  const correlationId = generateCorrelationId();
  const logger = getLogger(correlationId);

  logger.critical('GENERAL', 'UNCAUGHT_ERROR', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// ============================================================================
// Processamento de Mensagens
// ============================================================================

/**
 * Processa mensagens recebidas do popup e content scripts
 */
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  logger: AuditLogger,
  correlationId: string
): Promise<MessageResponse> {
  // Log detalhado via logger estruturado
  logger.info('GENERAL', 'MESSAGE_DETAILS', {
    type: message.type,
    payload: message.payload,
    correlationId,
    senderId: sender.id,
    tabId: sender.tab?.id,
    tabUrl: sender.tab?.url,
    frameId: sender.frameId,
    origin: sender.origin,
  });

  // Ignorar mensagens destinadas ao offscreen document
  // Essas mensagens serão processadas pelo offscreen.ts via chrome.runtime.onMessage
  const messageWithTarget = message as { target?: string };
  if (messageWithTarget.target === 'offscreen') {
    logger.debug('GENERAL', 'MESSAGE_FOR_OFFSCREEN_IGNORED', {
      type: message.type,
    });
    // Retornar undefined para permitir que o offscreen responda
    return undefined as unknown as MessageResponse;
  }

  addBreadcrumb({ category: 'service-worker', message: `handleMessage switch: ${message.type}`, level: 'info' });

  switch (message.type) {
    // Mensagens de sistema
    case 'PING':
      return { success: true, data: 'PONG' };

    case 'DIAGNOSTIC_PING':
      // Handler para verificação de diagnóstico - confirma que Service Worker está ativo
      return {
        success: true,
        timestamp: new Date().toISOString(),
        data: {
          version: chrome.runtime.getManifest().version,
          uptime: performance.now(),
        },
      };

    case 'GET_VERSION':
      return {
        success: true,
        data: {
          version: chrome.runtime.getManifest().version,
          name: chrome.runtime.getManifest().name,
        },
      };

    case 'CAPTURE_GET_RECENT':
      return await handleGetRecentCaptures(logger);

    // Mensagens de autenticação
    case 'GET_AUTH_STATUS':
      return await getAuthStatus();

    case 'LOGIN':
      return await handleLogin(message.payload as LoginPayload, logger);

    case 'GOOGLE_LOGIN':
      return await handleGoogleLogin(logger);

    case 'LOGOUT':
      return await handleLogout(logger);

    case 'REFRESH_TOKEN': {
      const refreshed = await refreshAccessToken(logger);
      if (refreshed) {
        return { success: true };
      }
      return {
        success: false,
        error: 'Falha ao renovar token',
      };
    }

    case 'AUTH_REFRESH_TOKEN': {
      // Handler para refresh de token solicitado pelo popup/auth-store
      // Requisitos 5.1, 5.2: Delegar refresh ao Service Worker e retornar tokens
      logger.info('AUTH', 'REFRESH_TOKEN_REQUESTED', { correlationId });

      const success = await refreshAccessToken(logger);

      if (success) {
        const tokens = await getStoredTokens();
        logger.info('AUTH', 'REFRESH_TOKEN_RESPONSE_SUCCESS', {
          correlationId,
          hasTokens: !!tokens,
        });
        return {
          success: true,
          data: { tokens },
        };
      }

      logger.warn('AUTH', 'REFRESH_TOKEN_RESPONSE_FAILED', { correlationId });
      return {
        success: false,
        error: 'Falha ao renovar sessão. Faça login novamente.',
      };
    }
    // Mensagens de captura
    case 'START_CAPTURE': {
      addBreadcrumb({
        category: 'service-worker',
        message: 'START_CAPTURE recebido',
        level: 'info',
        data: { senderId: sender.id, tabId: sender.tab?.id },
      });

      logger.info('CAPTURE', 'START_CAPTURE_HANDLER', {
        payload: message.payload,
      });

      addBreadcrumb({ category: 'service-worker', message: 'Chamando startCapture()', level: 'info' });
      const result = await startCapture(message.payload as StartCapturePayload, sender, logger);
      addBreadcrumb({ category: 'service-worker', message: 'startCapture() retornou', level: 'info', data: { success: result.success } });

      logger.info('CAPTURE', 'START_CAPTURE_RESULT', {
        success: result.success,
        error: result.error,
      });
      return result;
    }

    // Handler para cancelamento de captura
    case 'CAPTURE_CANCEL': {
      logger.info('CAPTURE', 'CAPTURE_CANCEL_REQUEST_RECEIVED');

      try {
        // Cancelar pipeline ativo se existir (novo fluxo)
        const activePipeline = getActivePipeline();
        if (activePipeline) {
          logger.info('CAPTURE', 'CANCELLING_ACTIVE_PIPELINE');

          try {
            // Cancelar operações do pipeline
            await activePipeline.cancelCapture();
            logger.info('CAPTURE', 'PIPELINE_CANCELLED_SUCCESSFULLY');
          } catch (pipelineError) {
            logger.error('CAPTURE', 'PIPELINE_CANCEL_ERROR', {
              error: pipelineError instanceof Error ? pipelineError.message : 'Erro desconhecido'
            });
          }

          // Limpar referência ao pipeline ativo
          setActivePipeline(null);
        } else {
          logger.warn('CAPTURE', 'NO_ACTIVE_PIPELINE_TO_CANCEL');
        }

        // Para capturas legadas ou vídeo, enviar mensagem de cancelamento ao content script
        if (currentCaptureState?.tabId) {
          try {
            await chrome.tabs.sendMessage(currentCaptureState.tabId, {
              type: 'CANCEL_CAPTURE'
            });
            logger.info('CAPTURE', 'CANCEL_MESSAGE_SENT_TO_CONTENT_SCRIPT');
          } catch (err) {
            logger.debug('CAPTURE', 'CONTENT_SCRIPT_CANCEL_FAILED', { error: err });
          }
        }

        // Limpar estado de captura
        if (currentCaptureState) {
          currentCaptureState.status = 'failed';
          currentCaptureState.error = 'Captura cancelada pelo usuário';
          await persistCaptureState(currentCaptureState);
          await clearCaptureState();
        }

        // Garantir restauração de extensões e desbloqueio
        try {
          const extensionManager = getExtensionIsolationManager();
          await extensionManager.restore();
          logger.info('CAPTURE', 'EXTENSION_ISOLATION_RESTORED');
        } catch (err) {
          logger.error('CAPTURE', 'EXTENSION_RESTORE_FAILED', { error: err });
        }

        try {
          const tabManager = getTabIsolationManager();
          await tabManager.restore();
          logger.info('CAPTURE', 'TAB_ISOLATION_RESTORED');
        } catch (err) {
          logger.error('CAPTURE', 'TAB_RESTORE_FAILED', { error: err });
        }

        // Notificar popup que captura foi cancelada
        try {
          await chrome.runtime.sendMessage({
            type: 'CAPTURE_CANCELLED'
          });
        } catch (err) {
          // Ignorar erro se popup já fechou
          logger.debug('CAPTURE', 'POPUP_NOTIFICATION_FAILED', { error: err });
        }

        logger.info('CAPTURE', 'CAPTURE_CANCEL_COMPLETED');
        return { success: true };

      } catch (error) {
        logger.error('CAPTURE', 'CAPTURE_CANCEL_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        return {
          success: false,
          error: 'Falha ao cancelar captura',
        };
      }
    }

    // Handler para término do Countdown -> Início da Gravação
    // Handler para término do Countdown (apenas sinaliza prontidão)
    case 'COUNTDOWN_COMPLETE': {
      logger.info('CAPTURE', 'COUNTDOWN_FINISHED_WAITING_USER_START');
      return { success: true };
    }

    // Handler para etapas de preparação forense
    // Executa ações reais durante a preparação visual do overlay
    case 'FORENSIC_PREPARATION_STEP': {
      const stepPayload = message.payload as { phaseId: string; stepId: string };
      logger.info('CAPTURE', 'FORENSIC_PREPARATION_STEP', {
        phaseId: stepPayload.phaseId,
        stepId: stepPayload.stepId,
      });

      try {
        // Executar ação real baseada na etapa
        switch (stepPayload.stepId) {
          // Fase 1: Isolamento
          case 'isolate-env':
            // Ativar isolamento de abas
            if (currentCaptureState?.tabId && currentCaptureState?.windowId) {
              const tabManager = getTabIsolationManager();
              await tabManager.activate(currentCaptureState.tabId, currentCaptureState.windowId);
            }
            break;

          case 'disable-ext':
            // Desativar extensões de terceiros usando activateIsolation
            if (currentCaptureState?.id) {
              const isolationMgr = getIsolationManager(logger);
              await isolationMgr.activateIsolation(currentCaptureState.id);
            }
            break;

          case 'perimeter':
            // Estabelecer perímetro forense (verificar permissões)
            if (currentCaptureState?.url) {
              await verificarPermissaoHost(currentCaptureState.url, logger);
            }
            break;

          // Fase 2: Preservação
          case 'preserve-state':
          case 'dom-snapshot':
          case 'html-custody':
            // HTML será coletado pelo HtmlCollectionService durante a captura
            // Aqui apenas sinalizamos que está pronto
            break;

          // Fase 3: Metadados
          case 'network-meta':
          case 'ssl-cert':
          case 'geo-server':
          case 'http-headers':
            // Metadados serão coletados pelo ForensicCollector durante a captura
            // Aqui apenas sinalizamos que está pronto
            break;

          // Fase 4: Integridade
          case 'conn-integrity':
          case 'validate-certs':
          case 'calc-hashes':
            // Verificações de integridade são feitas durante a captura
            break;

          // Fase 5: Gravador
          case 'init-recorder':
            // Garantir que offscreen document existe
            try {
              const existingContexts = await chrome.runtime.getContexts({});
              const offscreenExists = existingContexts.some(
                (c) => c.contextType === ('OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType)
              );
              if (!offscreenExists) {
                await chrome.offscreen.createDocument({
                  url: 'src/offscreen/offscreen.html',
                  reasons: [chrome.offscreen.Reason.USER_MEDIA],
                  justification: 'Gravação forense de vídeo',
                });
              }
            } catch {
              logger.warn('CAPTURE', 'OFFSCREEN_ALREADY_EXISTS', {});
            }
            break;

          case 'config-codec':
          case 'chunk-system':
            // Configuração do codec e chunks é feita no VideoStrategy
            break;

          // Fase 6: Timestamp
          case 'ntp-sync':
          case 'icp-brasil':
            // Timestamp será aplicado após a captura
            break;

          default:
            logger.warn('CAPTURE', 'UNKNOWN_FORENSIC_STEP', { stepId: stepPayload.stepId });
        }

        return { success: true };
      } catch (error) {
        logger.error('CAPTURE', 'FORENSIC_STEP_ERROR', {
          stepId: stepPayload.stepId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return { success: false, error: error instanceof Error ? error.message : 'Erro na preparação' };
      }
    }

    // Handler para conclusão da preparação forense (vem do SidePanel)
    case 'FORENSIC_PREPARATION_COMPLETE': {
      logger.info('CAPTURE', 'FORENSIC_PREPARATION_COMPLETE', {
        captureId: currentCaptureState?.id,
        currentStatus: currentCaptureState?.status,
      });

      if (currentCaptureState?.type !== 'video') {
        return { success: false, error: 'Nenhuma captura de vídeo ativa' };
      }

      // Verificar se a preparação falhou (ex: PAGE_RELOAD_TIMEOUT)
      // O SidePanel pode enviar FORENSIC_PREPARATION_COMPLETE mesmo quando
      // o service worker já setou status='failed' no VIDEO_PREP_ERROR,
      // porque a animação de preparação no SidePanel é independente.
      if (currentCaptureState.status === 'failed') {
        logger.warn('CAPTURE', 'FORENSIC_PREP_COMPLETE_BUT_CAPTURE_FAILED', {
          captureId: currentCaptureState.id,
          error: currentCaptureState.error,
        });
        // Limpar estado para permitir nova tentativa
        currentCaptureState = null;
        return { success: false, error: 'Preparação falhou anteriormente. Tente novamente.' };
      }

      try {
        // Iniciar gravação usando o pipeline unificado
        logger.info('CAPTURE', 'STARTING_RECORDING_AFTER_PREPARATION', {
          captureId: currentCaptureState.id,
          tabId: currentCaptureState.tabId,
        });

        // Obter novo streamId via chrome.tabCapture.getMediaStreamId()
        // O streamId do popup foi invalidado pelo reload da página.
        // No fluxo original, getMediaStreamId() era chamado no service worker
        // DEPOIS do reload, e funciona sem user gesture no MV3.
        let freshStreamId: string | undefined;
        if (currentCaptureState.tabId) {
          try {
            freshStreamId = await new Promise<string>((resolve, reject) => {
              chrome.tabCapture.getMediaStreamId(
                { targetTabId: currentCaptureState?.tabId ?? 0 },
                (id) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (!id) {
                    reject(new Error('streamId vazio'));
                  } else {
                    resolve(id);
                  }
                }
              );
            });
            logger.info('CAPTURE', 'FRESH_STREAM_ID_OBTAINED', {
              tabId: currentCaptureState.tabId,
              streamIdPrefix: freshStreamId.substring(0, 20),
            });
          } catch (streamErr) {
            logger.warn('CAPTURE', 'FRESH_STREAM_ID_FAILED', {
              error: String(streamErr),
              note: 'Pipeline tentará fallback via bridge ou getDisplayMedia',
            });
          }
        }

        // Limpar streamId pré-capturado (invalidado pelo reload)
        preCapturedStreamId = null;

        const result = await startVideoCaptureWithPipeline(
          {
            storageClass: (currentCaptureState.storageType as 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE') ?? 'STANDARD',
            retentionYears: 5,
            preCapturedStreamId: freshStreamId,
          },
          logger
        );

        if (!result.success) {
          throw new Error(result.error ?? 'Falha ao iniciar gravação');
        }

        // Atualizar ID da evidência com o gerado pelo pipeline
        if (result.evidenceId) {
          currentCaptureState.id = result.evidenceId;
        }
        currentCaptureState.status = 'capturing';
        await persistCaptureState(currentCaptureState);

        // Notificar overlay que gravação começou
        if (currentCaptureState.tabId) {
          chrome.tabs.sendMessage(currentCaptureState.tabId, { type: 'VIDEO_RECORDING_STARTED' }).catch(() => {});
        }

        // Notificar Side Panel que gravação realmente iniciou (timer deve começar agora)
        const sidePanelHandler = getSidePanelHandler({ logger });
        const recordingStartedState = {
          status: 'recording' as const,
          startTime: Date.now(),
          elapsedMs: 0,
          maxDurationMs: 30 * 60 * 1000,
          stats: {
            pagesVisited: 1,
            clickCount: 0,
            keystrokeCount: 0,
            scrollCount: 0,
            formsInteracted: 0,
          },
          navigationHistory: [],
          forensicContext: null,
          alerts: [],
          uploadProgress: {
            chunksUploaded: 0,
            chunksTotal: 0,
            bytesUploaded: 0,
            bytesTotal: 0,
            status: 'idle' as const,
          },
        };
        await sidePanelHandler.sendRecordingStateUpdate(recordingStartedState);
        logger.info('CAPTURE', 'RECORDING_STARTED_AFTER_PREPARATION', {
          evidenceId: result.evidenceId,
          startTime: recordingStartedState.startTime,
        });

        // Criar alarme de auto-stop aos 30 minutos
        // chrome.alarms sobrevive ao restart do service worker no MV3
        await chrome.alarms.create(VIDEO_AUTO_STOP_ALARM_NAME, {
          delayInMinutes: 30,
        });
        logger.info('CAPTURE', 'VIDEO_AUTO_STOP_ALARM_CREATED', {
          delayMinutes: 30,
        });

        return { success: true, evidenceId: result.evidenceId };
      } catch (error) {
        logger.error('CAPTURE', 'RECORDING_START_AFTER_PREP_ERROR', { error: String(error) });
        currentCaptureState.status = 'failed';
        currentCaptureState.error = String(error);
        await persistCaptureState(currentCaptureState);
        return { success: false, error: String(error) };
      }
    }

    // Handler para timeout na preparação forense (vem do SidePanel)
    case 'FORENSIC_PREPARATION_TIMEOUT': {
      const timeoutPayload = message.payload as { reason?: string } | undefined;
      logger.error('CAPTURE', 'FORENSIC_PREPARATION_TIMEOUT', {
        captureId: currentCaptureState?.id,
        reason: timeoutPayload?.reason ?? 'Timeout de 1 minuto excedido',
      });

      // Fazer cleanup completo
      try {
        // 1. Desativar isolamento de abas
        await getTabIsolationManager().deactivate();

        // 2. Reativar extensões de terceiros
        const isolationManager = getIsolationManager(logger);
        await isolationManager.deactivateIsolation();

        // 3. Fechar Side Panel (enviar mensagem para fechar)
        const sidePanelHandler = getSidePanelHandler({ logger });
        await sidePanelHandler.sendRecordingStateUpdate({
          status: 'stopped',
          startTime: 0,
          elapsedMs: 0,
          maxDurationMs: 0,
          stats: { pagesVisited: 0, clickCount: 0, keystrokeCount: 0, scrollCount: 0, formsInteracted: 0 },
          navigationHistory: [],
          forensicContext: null,
          alerts: [{ id: 'timeout', type: 'error', message: 'Timeout na preparação', timestamp: Date.now() }],
          uploadProgress: { chunksUploaded: 0, chunksTotal: 0, bytesUploaded: 0, bytesTotal: 0, status: 'idle' },
        });

        // 4. Limpar estado de captura
        if (currentCaptureState) {
          currentCaptureState.status = 'failed';
          currentCaptureState.error = 'Timeout na preparação forense';
          await persistCaptureState(currentCaptureState);
        }

        logger.info('CAPTURE', 'CLEANUP_AFTER_TIMEOUT_COMPLETE', {});
      } catch (cleanupError) {
        logger.error('CAPTURE', 'CLEANUP_AFTER_TIMEOUT_FAILED', { error: String(cleanupError) });
      }

      return { success: true };
    }

    // Handler para erro na preparação forense (vem do SidePanel)
    case 'FORENSIC_PREPARATION_ERROR': {
      const errorPayload = message.payload as { error?: string } | undefined;
      logger.error('CAPTURE', 'FORENSIC_PREPARATION_ERROR', {
        captureId: currentCaptureState?.id,
        error: errorPayload?.error ?? 'Erro desconhecido',
      });

      // Fazer cleanup completo (mesmo que timeout)
      try {
        await getTabIsolationManager().deactivate();
        const isolationManager = getIsolationManager(logger);
        await isolationManager.deactivateIsolation();

        if (currentCaptureState) {
          currentCaptureState.status = 'failed';
          currentCaptureState.error = errorPayload?.error ?? 'Erro na preparação forense';
          await persistCaptureState(currentCaptureState);
        }

        logger.info('CAPTURE', 'CLEANUP_AFTER_ERROR_COMPLETE', {});
      } catch (cleanupError) {
        logger.error('CAPTURE', 'CLEANUP_AFTER_ERROR_FAILED', { error: String(cleanupError) });
      }

      return { success: true };
    }

    // Handler para Início Efetivo da Gravação (clique do usuário)
    case 'START_VIDEO_RECORDING': {
      if (currentCaptureState?.type !== 'video') {
        return { success: false, error: 'Nenhuma captura de vídeo ativa' };
      }

      try {
        logger.info('CAPTURE', 'STARTING_RECORDING_WITH_PIPELINE', {
          captureId: currentCaptureState.id,
          tabId: currentCaptureState.tabId,
        });

        // Consumir streamId pré-capturado se disponível e válido
        let validStreamId: string | undefined;
        if (
          preCapturedStreamId?.tabId === currentCaptureState.tabId &&
          Date.now() - (preCapturedStreamId?.timestamp ?? 0) < 5 * 60 * 1000
        ) {
          validStreamId = preCapturedStreamId.streamId;
          logger.info('CAPTURE', 'USING_PRE_CAPTURED_STREAM_ID', {
            tabId: preCapturedStreamId.tabId,
            ageMs: Date.now() - preCapturedStreamId.timestamp,
          });
        }
        // Limpar após consumo (uso único)
        preCapturedStreamId = null;

        // Usar novo pipeline unificado que coleta HTML, metadados forenses e gerencia upload completo
        const result = await startVideoCaptureWithPipeline(
          {
            storageClass: (currentCaptureState.storageType as 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE') ?? 'STANDARD',
            retentionYears: 5,
            preCapturedStreamId: validStreamId,
          },
          logger
        );

        if (!result.success) {
          throw new Error(result.error ?? 'Falha ao iniciar gravação');
        }

        // Atualizar ID da evidência com o gerado pelo pipeline
        if (result.evidenceId) {
          currentCaptureState.id = result.evidenceId;
        }
        currentCaptureState.status = 'capturing';
        await persistCaptureState(currentCaptureState);

        // Notificar overlay que gravação começou (para virar timer)
        if (currentCaptureState.tabId) {
          chrome.tabs.sendMessage(currentCaptureState.tabId, { type: 'VIDEO_RECORDING_STARTED' }).catch(() => { });
        }

        // Notificar Side Panel que gravação realmente iniciou (timer deve começar agora)
        // Notificar Side Panel que gravação realmente iniciou (timer deve começar agora)
        const sidePanelHandler = getSidePanelHandler({ logger });
        const startTime = Date.now();

        // Inicializar o RecordingStateManager para garantir estado consistente
        const stateManager = getRecordingStateManager();
        stateManager.startRecording(startTime);
        
        // Adicionar a página atual como primeira navegação no histórico
        // Isso garante que "Pages Visited" comece em 1 e mostre a URL atual
        if (currentCaptureState.url) {
          stateManager.addNavigation({
            url: currentCaptureState.url,
            title: currentCaptureState.title || 'Página inicial',
            type: 'initial',
            htmlHash: '',
            timestamp: startTime
          });
        }

        // Obter estado atualizado do gerenciador (já com navegação e stats)
        const recordingStartedState = stateManager.getState();
        
        await sidePanelHandler.sendRecordingStateUpdate(recordingStartedState);
        logger.info('CAPTURE', 'SIDEPANEL_RECORDING_STARTED', { startTime: recordingStartedState.startTime });

        // Criar alarme de auto-stop aos 30 minutos
        // chrome.alarms sobrevive ao restart do service worker no MV3
        await chrome.alarms.create(VIDEO_AUTO_STOP_ALARM_NAME, {
          delayInMinutes: 30,
        });
        logger.info('CAPTURE', 'VIDEO_AUTO_STOP_ALARM_CREATED', {
          delayMinutes: 30,
        });

        logger.info('CAPTURE', 'VIDEO_RECORDING_STARTED_WITH_PIPELINE', {
          evidenceId: result.evidenceId,
          status: result.status,
        });

        return { success: true, evidenceId: result.evidenceId };

      } catch (error) {
        logger.error('CAPTURE', 'VIDEO_START_ERROR', { error: String(error) });
        currentCaptureState.status = 'failed';
        currentCaptureState.error = String(error);
        await persistCaptureState(currentCaptureState);
        return { success: false, error: String(error) };
      }
    }

    case 'STOP_CAPTURE':
      return await stopCapture(logger);

    // ========================================================================
    // Handler do Popup para abrir Side Panel no modo vídeo
    // O popup obtém streamId via tabCapture (user gesture) e envia esta
    // mensagem para que o service worker abra o Side Panel e inicie o fluxo
    // ========================================================================
    case 'OPEN_SIDEPANEL_FOR_VIDEO': {
      const videoPayload = message.payload as {
        tabId: number;
        windowId?: number;
        streamId: string | null;
      } | undefined;

      logger.info('CAPTURE', 'OPEN_SIDEPANEL_FOR_VIDEO', {
        tabId: videoPayload?.tabId,
        windowId: videoPayload?.windowId,
        hasStreamId: !!videoPayload?.streamId,
      });

      try {
        // Salvar streamId na variável de memória para consumo pelo fluxo de vídeo
        if (videoPayload?.streamId && videoPayload.tabId) {
          preCapturedStreamId = {
            streamId: videoPayload.streamId,
            tabId: videoPayload.tabId,
            timestamp: Date.now(),
          };
          logger.info('CAPTURE', 'STREAM_ID_FROM_POPUP_SAVED', {
            tabId: videoPayload.tabId,
            streamIdPrefix: videoPayload.streamId.substring(0, 20),
          });
        }

        // Abrir Side Panel
        const windowId = videoPayload?.windowId;
        if (windowId) {
          await chrome.sidePanel.open({ windowId });
        } else {
          // Fallback: obter janela ativa
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab?.windowId) {
            await chrome.sidePanel.open({ windowId: activeTab.windowId });
          }
        }

        // Sinalizar que o Side Panel deve iniciar no modo vídeo
        await chrome.storage.session.set({
          'lexato_sidepanel_mode': 'video',
          'lexato_video_tab_id': videoPayload?.tabId,
        });

        return { success: true };
      } catch (error) {
        logger.error('CAPTURE', 'OPEN_SIDEPANEL_FOR_VIDEO_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Falha ao abrir painel de vídeo',
        };
      }
    }

    // ========================================================================
    // Handlers da Capture Bridge (obtenção de streamId via janela intermediária)
    // ========================================================================
    case 'CAPTURE_BRIDGE_STREAM_ID': {
      const bridgePayload = message.payload as { streamId: string; tabId: number } | undefined;
      if (bridgePayload?.streamId) {
        logger.info('CAPTURE', 'BRIDGE_STREAM_ID_RECEIVED', {
          tabId: bridgePayload.tabId,
          streamIdPrefix: bridgePayload.streamId.substring(0, 20),
        });
        resolveBridgeStreamId(bridgePayload.streamId);
      }
      return { success: true };
    }

    case 'CAPTURE_BRIDGE_ERROR': {
      const bridgeErrorPayload = message.payload as { error: string } | undefined;
      logger.warn('CAPTURE', 'BRIDGE_ERROR_RECEIVED', {
        error: bridgeErrorPayload?.error ?? 'Erro desconhecido na bridge',
      });
      rejectBridgeStreamId(bridgeErrorPayload?.error ?? 'Erro desconhecido na bridge');
      return { success: true };
    }

    // ========================================================================
    // Handlers do Side Panel (Requisitos 6.1-6.5)
    // O Side Panel envia mensagens com tipos específicos para controle
    // ========================================================================
    case 'SIDEPANEL_CONNECTED':
      // Side Panel conectou - enviar estado atual da gravação
      logger.info('SIDEPANEL', 'SIDEPANEL_CONNECTED', { correlationId });
      {
        // Verificar se há captura ativa e enviar estado
        const captureStatus = await getCaptureStatus();
        // Verificar também o pipeline de vídeo diretamente
        // (pode estar ativo mesmo se currentCaptureState ainda não atualizou)
        const videoPipelineActive = isVideoCaptureActive();
        if (captureStatus.success && captureStatus.data) {
          // Enviar estado atual para o Side Panel
          const state = captureStatus.data;
          const isRecording = state.status === 'capturing' || state.status === 'processing' || videoPipelineActive;
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'RECORDING_STATE_UPDATE',
              payload: {
                status: isRecording ? 'recording' : 'preparing',
                startTime: state.startedAt ?? Date.now(),
                elapsedMs: state.startedAt ? Date.now() - state.startedAt : 0,
                maxDurationMs: 30 * 60 * 1000,
                stats: {
                  pagesVisited: 0,
                  clickCount: 0,
                  keystrokeCount: 0,
                  scrollCount: 0,
                  formsInteracted: 0,
                },
                navigationHistory: [],
                forensicContext: null,
                alerts: [],
                uploadProgress: {
                  chunksUploaded: 0,
                  chunksTotal: 0,
                  bytesUploaded: 0,
                  bytesTotal: 0,
                  status: 'idle',
                },
              },
            }).catch(() => {
              // Ignorar erro se Side Panel não estiver pronto
            });
          }, 100);
        }
      }
      return { success: true };

    case 'STOP_RECORDING':
    case 'CAPTURE_STOP_VIDEO':
      // Side Panel e useCapture usam mensagens diferentes para parar gravação
      logger.info('SIDEPANEL', 'STOP_RECORDING_RECEIVED', { correlationId, originalType: message.type });
      // Limpar alarme de auto-stop (usuário finalizou manualmente)
      await chrome.alarms.clear(VIDEO_AUTO_STOP_ALARM_NAME);
      return await stopCapture(logger);

    case 'RESTART_RECORDING':
      // Recomeçar gravação: cancela atual e inicia nova
      logger.info('SIDEPANEL', 'RESTART_RECORDING_RECEIVED', { correlationId });
      
      // Cancelar captura atual (mas não fechar SidePanel)
      if (currentCaptureState?.type === 'video' && isVideoCaptureActive()) {
        const result = await cancelVideoCaptureWithPipeline(logger);
        if (!result.success) {
          logger.warn('SIDEPANEL', 'RESTART_CANCEL_PARTIAL', { error: result.error });
        }
        
        // Limpar badge
        await clearBadgeProgress();
        
        // Resetar RecordingStateManager para limpar estado no SidePanel
        const stateManager = getRecordingStateManager();
        stateManager.reset();
        logger.info('SIDEPANEL', 'RECORDING_STATE_RESET_ON_RESTART', {});
      }
      
      // Limpar estado de captura
      await clearCaptureState();
      
      // Restaurar isolamento
      await ensureIsolationRestored(logger);
      
      // Notificar popup/overlay para reiniciar fluxo (SidePanel permanece aberto)
      return { success: true, message: 'Gravação cancelada. Inicie nova captura.' };

    case 'CANCEL_RECORDING':
      // Cancelar gravação do Side Panel
      logger.info('SIDEPANEL', 'CANCEL_RECORDING_RECEIVED', { correlationId });
      // Limpar alarme de auto-stop
      await chrome.alarms.clear(VIDEO_AUTO_STOP_ALARM_NAME);
      return await cancelCapture(logger);

    case 'CANCEL_CAPTURE':
      // Limpar alarme de auto-stop por segurança
      await chrome.alarms.clear(VIDEO_AUTO_STOP_ALARM_NAME);
      return await cancelCapture(logger);

    case 'GET_CAPTURE_STATUS':
      return await getCaptureStatus();



    // Handler para término da gravação no offscreen (sinal interno)
    // NOTA: Com o novo pipeline, este handler não é mais necessário pois
    // VideoStrategy gerencia internamente via listener de mensagens
    case 'recording-stopped': {
      logger.info('CAPTURE', 'RECORDING_STOPPED_SIGNAL_RECEIVED', { correlationId });
      // O novo pipeline gerencia isso internamente via VideoStrategy
      return { success: true };
    }

    // Handler para quando captura termina (sucesso ou falha)
    case 'CAPTURE_COMPLETE': {
      const completePayload = message.payload as { success: boolean; error?: string } | undefined;
      return await handleCaptureComplete(
        completePayload?.success ?? false,
        completePayload?.error,
        logger
      );
    }

    // Handler para resetar isolamento manualmente
    case 'RESET_ISOLATION':
      return await forceResetIsolation(logger);

    // ========================================================================
    // GET_TAB_THUMBNAIL - Captura thumbnail para preview visual (sem fins legais)
    // ========================================================================
    // IMPORTANTE: Esta captura é APENAS para UX/preview, NÃO tem validade legal.
    // - Não gera hash
    // - Não registra em blockchain
    // - Não persiste em servidor
    // - Usa qualidade baixa (JPEG 40%)
    // ========================================================================
    case 'GET_TAB_THUMBNAIL': {
      addBreadcrumb({ category: 'service-worker', message: 'GET_TAB_THUMBNAIL - Capturando thumbnail para preview', level: 'info' });

      try {
        // Obter aba ativa
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab?.id || !activeTab.windowId) {
          return {
            success: false,
            error: 'Nenhuma aba ativa encontrada',
          };
        }

        // Verificar se URL é capturável
        const url = activeTab.url ?? '';
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
          return {
            success: false,
            error: 'Não é possível capturar esta página',
          };
        }

        // Capturar com qualidade baixa (apenas para preview)
        const imageData = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
          format: 'jpeg',
          quality: 40,
        });

        addBreadcrumb({ category: 'service-worker', message: 'GET_TAB_THUMBNAIL - Thumbnail capturada com sucesso', level: 'info' });

        return {
          success: true,
          data: {
            imageData,
            url: activeTab.url,
            title: activeTab.title,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error('[ServiceWorker] GET_TAB_THUMBNAIL - Erro:', errorMessage);

        return {
          success: false,
          error: `Erro ao capturar thumbnail: ${errorMessage}`,
        };
      }
    }

    // ========================================================================
    // Handlers de Preview (Requisito 12)
    // ========================================================================

    case 'GET_PREVIEW_DATA': {
      const payload = message.payload as { id: string };
      const id = payload?.id;

      if (!id) {
        return { success: false, error: 'ID não fornecido' };
      }

      // Tentar memória
      let state = currentCaptureState?.id === id ? currentCaptureState : null;

      // Se não em memória, tentar recuperar
      if (!state) {
        const recovered = await recoverCaptureState();
        if (recovered?.id === id) {
          state = recovered;
        }
      }

      if (!state) {
        return { success: false, error: 'Evidência não encontrada' };
      }

      // Mapear para PreviewData
      const previewData = {
        evidenceId: state.id,
        title: state.title,
        url: state.url,
        type: state.type,
        mediaUrl: state.type === 'video' ? state.videoUrl : state.screenshotUrl,
        status: state.status,
        hash: state.screenshotHash ?? state.videoHash,
        timestamp: state.timestampResult ? {
          type: state.timestampResult.type,
          appliedAt: state.timestampResult.appliedAt,
          tsa: state.timestampResult.tsa,
          warning: state.timestampResult.warning
        } : {
          // Fallback visual apenas se não houver timestamp real (ex: capturas antigas)
          type: 'NTP_LOCAL',
          appliedAt: new Date(state.startedAt).toISOString(),
          tsa: 'LOCAL',
          warning: 'Timestamp ICP-Brasil não disponível'
        }
      };

      return {
        success: true,
        data: previewData
      };
    }

    case 'APPROVE_EVIDENCE': {
      const payload = message.payload as { 
        evidenceId: string;
        catalog?: {
          title?: string;
          tags?: string[];
          caseNumber?: string;
          notes?: string;
          collectionId?: string;
          newCollection?: {
            name: string;
            description?: string;
          };
        };
      };
      if (!payload?.evidenceId) {return { success: false, error: 'ID inválido' };}

      await cancelPreviewAlarms(payload.evidenceId);

      // Configuração de armazenamento padrão baseda no tipo legado
      const storageConfig: StorageConfig = {
        storageClass: 'STANDARD', // Default
        retentionYears: 5
      };
      
      if (currentCaptureState?.storageType.includes('premium')) {
         storageConfig.storageClass = 'GLACIER'; // Exemplo
         if (currentCaptureState.storageType === 'premium_10y') {storageConfig.retentionYears = 10;}
         if (currentCaptureState.storageType === 'premium_20y') {storageConfig.retentionYears = 20;}
      }

      try {
        // Envia metadados de catalogacao junto com a aprovacao
        if (payload.catalog) {
          logger.info('PREVIEW', 'APPROVE_WITH_CATALOG', {
            evidenceId: payload.evidenceId,
            hasTitle: Boolean(payload.catalog.title),
            tagsCount: payload.catalog.tags?.length ?? 0,
            hasCaseNumber: Boolean(payload.catalog.caseNumber),
            hasNotes: Boolean(payload.catalog.notes),
            hasCollectionId: Boolean(payload.catalog.collectionId),
            hasNewCollection: Boolean(payload.catalog.newCollection),
          });
        }

        await getEvidencePipeline().approve(payload.evidenceId, storageConfig);

        // Atualizar metadados de catalogacao via Supabase direto (fire-and-forget)
        if (payload.catalog) {
          try {
            const sbClient = getSupabaseClient();
            await sbClient
              .from('evidences')
              .update({
                title: payload.catalog.title,
                tags: payload.catalog.tags,
                case_number: payload.catalog.caseNumber,
                notes: payload.catalog.notes,
              })
              .eq('id', payload.evidenceId);

            // Associar evidência à coleção existente ou criar nova coleção
            let resolvedCollectionId = payload.catalog.collectionId;

            if (!resolvedCollectionId && payload.catalog.newCollection) {
              // Criar nova coleção inline via CatalogService
              try {
                const { catalogService } = await import('../lib/catalog.service');
                const newCol = await catalogService.createCollection({
                  name: payload.catalog.newCollection.name,
                  description: payload.catalog.newCollection.description,
                });
                resolvedCollectionId = newCol.id;
              } catch (createError) {
                logger.warn('PREVIEW', 'NEW_COLLECTION_CREATE_FAILED', {
                  evidenceId: payload.evidenceId,
                  error: String(createError),
                });
              }
            }

            if (resolvedCollectionId) {
              try {
                const { catalogService } = await import('../lib/catalog.service');
                await catalogService.addEvidenceToCollection(resolvedCollectionId, payload.evidenceId);
              } catch (collError) {
                logger.warn('PREVIEW', 'COLLECTION_ASSOCIATION_FAILED', {
                  evidenceId: payload.evidenceId,
                  collectionId: resolvedCollectionId,
                  error: String(collError),
                });
              }
            }
          } catch (catalogError) {
            // Nao bloqueia a aprovacao se a catalogacao falhar
            logger.warn('PREVIEW', 'CATALOG_UPDATE_FAILED', {
              evidenceId: payload.evidenceId,
              error: String(catalogError),
            });
          }
        }

        return { success: true };
      } catch (error) {
        logger.error('PREVIEW', 'APPROVE_ERROR', { error: String(error) });
        return { success: false, error: 'Erro ao aprovar evidência' };
      }
    }

    case 'DISCARD_EVIDENCE': {
      const payload = message.payload as { evidenceId: string };
      if (!payload?.evidenceId) {return { success: false, error: 'ID inválido' };}

      await cancelPreviewAlarms(payload.evidenceId);
      
      try {
        await getEvidencePipeline().discard(payload.evidenceId);
        
        // Limpar estado local também se for o atual
        if (currentCaptureState?.id === payload.evidenceId) {
          await clearCaptureState();
          currentCaptureState = null;
        }
        
        return { success: true };
      } catch (error) {
        logger.error('PREVIEW', 'DISCARD_ERROR', { error: String(error) });
        return { success: false, error: 'Erro ao descartar evidência' };
      }
    }

    case 'CAPTURE_VIEWPORT': {
      // ========================================================================
      // CAPTURE_VIEWPORT - Captura viewport visível usando host_permissions
      // ========================================================================
      // IMPORTANTE: Usar windowId da aba em captura, não da aba "ativa"
      // Após reload, a aba pode não ser considerada "ativa" pelo Chrome
      // A permissão activeTab é temporária e expira após reload
      // Por isso usamos host_permissions que são permanentes
      // ========================================================================

      addBreadcrumb({ category: 'service-worker', message: 'CAPTURE_VIEWPORT - inicio', level: 'info' });
      addBreadcrumb({
        category: 'service-worker',
        message: 'CAPTURE_VIEWPORT recebido',
        level: 'info',
        data: { captureTabId: currentCaptureState?.tabId, captureId: currentCaptureState?.id, status: currentCaptureState?.status },
      });

      logger.info('CAPTURE', 'VIEWPORT_CAPTURE_REQUEST_RECEIVED', {
        payload: message.payload,
        correlationId,
        currentCaptureTabId: currentCaptureState?.tabId,
        currentCaptureId: currentCaptureState?.id,
        currentCaptureStatus: currentCaptureState?.status,
      });

      const capturePayload = message.payload as { format?: string; quality?: number } | undefined;
      const format = capturePayload?.format === 'jpeg' ? 'jpeg' : 'png';
      const quality = capturePayload?.quality ?? 90;

      addBreadcrumb({ category: 'service-worker', message: `Configuracao de captura: format=${format}, quality=${quality}`, level: 'info' });

      // Usar tabId do estado de captura atual (nao da aba "ativa")
      const captureTabId = currentCaptureState?.tabId;

      if (!captureTabId) {
        addBreadcrumb({ category: 'service-worker', message: 'Nenhum tabId encontrado no estado de captura', level: 'warning' });

        logger.error('CAPTURE', 'VIEWPORT_NO_CAPTURE_TAB', {
          message: 'Nenhuma captura em andamento ou tabId não definido',
          currentCaptureState: currentCaptureState ? {
            id: currentCaptureState.id,
            status: currentCaptureState.status,
            tabId: currentCaptureState.tabId,
          } : null,
        });
        return {
          success: false,
          error: 'Nenhuma captura em andamento',
        };
      }

      logger.info('CAPTURE', 'VIEWPORT_CAPTURE_CONFIG', {
        format,
        quality,
        captureTabId,
      });

      try {
        addBreadcrumb({ category: 'service-worker', message: 'Obtendo informacoes da aba via chrome.tabs.get()', level: 'info' });

        // Obter informacoes da aba em captura (nao da aba "ativa")
        const queryStartTime = Date.now();
        const captureTab = await chrome.tabs.get(captureTabId);
        const queryDuration = Date.now() - queryStartTime;

        addBreadcrumb({
          category: 'service-worker',
          message: `Aba obtida em ${queryDuration}ms`,
          level: 'info',
          data: { tabId: captureTab.id, windowId: captureTab.windowId, status: captureTab.status, active: captureTab.active },
        });

        logger.info('CAPTURE', 'VIEWPORT_CAPTURE_TAB_INFO', {
          tabId: captureTab.id,
          windowId: captureTab.windowId,
          url: captureTab.url,
          title: captureTab.title,
          status: captureTab.status,
          active: captureTab.active,
          highlighted: captureTab.highlighted,
          incognito: captureTab.incognito,
          queryDurationMs: queryDuration,
        });

        addBreadcrumb({ category: 'service-worker', message: 'Verificando host_permissions', level: 'info' });

        // Verificar se temos host_permissions para a URL
        if (captureTab.url) {
          try {
            const origin = new URL(captureTab.url).origin;
            const protocol = new URL(captureTab.url).protocol;

            addBreadcrumb({ category: 'service-worker', message: 'Chamando chrome.permissions.contains()', level: 'info' });

            const permCheckStart = Date.now();
            const [hasOriginPermission, hasAllUrls, hasHttpsWildcard, hasHttpWildcard] = await Promise.all([
              chrome.permissions.contains({ origins: [origin + '/*'] }),
              chrome.permissions.contains({ origins: ['<all_urls>'] }),
              chrome.permissions.contains({ origins: ['https://*/*'] }),
              chrome.permissions.contains({ origins: ['http://*/*'] }),
            ]);
            const permCheckDuration = Date.now() - permCheckStart;

            const hasHostPermission = hasAllUrls || hasOriginPermission ||
              (protocol === 'https:' && hasHttpsWildcard) ||
              (protocol === 'http:' && hasHttpWildcard);

            addBreadcrumb({
              category: 'service-worker',
              message: `Verificacao de permissoes em ${permCheckDuration}ms`,
              level: 'info',
              data: { hasAllUrls, hasOriginPermission, hasHttpsWildcard, hasHttpWildcard, hasHostPermission },
            });

            logger.info('CAPTURE', 'VIEWPORT_HOST_PERMISSION_CHECK', {
              url: captureTab.url,
              origin,
              protocol,
              hasAllUrls,
              hasOriginPermission,
              hasHttpsWildcard,
              hasHttpWildcard,
              hasHostPermission,
              checkDurationMs: permCheckDuration,
            });

            if (!hasHostPermission) {
              addBreadcrumb({ category: 'service-worker', message: 'Sem host_permission para esta URL', level: 'warning' });

              logger.error('CAPTURE', 'VIEWPORT_NO_HOST_PERMISSION', {
                url: captureTab.url,
                origin,
              });
              return {
                success: false,
                error: `Sem permissão de host para ${origin}. Verifique as permissões da extensão.`,
              };
            }

            addBreadcrumb({ category: 'service-worker', message: 'Host permission confirmada', level: 'info' });

          } catch (permError) {
            addBreadcrumb({ category: 'service-worker', message: 'Erro ao verificar permissoes', level: 'warning' });

            logger.error('CAPTURE', 'VIEWPORT_PERMISSION_CHECK_ERROR', {
              error: permError instanceof Error ? permError.message : 'Erro desconhecido',
            });
          }
        } else {
          addBreadcrumb({ category: 'service-worker', message: 'Aba nao tem URL definida', level: 'warning' });
          logger.warn('CAPTURE', 'VIEWPORT_NO_TAB_URL', {});
        }

        // CRÍTICO: Usar windowId da aba em captura
        // Isso garante que captureVisibleTab capture a janela correta
        // mesmo que outra janela esteja em foco
        const windowId = captureTab.windowId;

        addBreadcrumb({ category: 'service-worker', message: `Preparando captureVisibleTab: windowId=${windowId}, format=${format}`, level: 'info' });

        logger.info('CAPTURE', 'VIEWPORT_CAPTURE_CALLING_API', {
          captureTabId: captureTab.id,
          windowId,
          url: captureTab.url,
          format,
          quality,
          note: 'Usando windowId explícito para garantir captura correta após reload',
        });

        addBreadcrumb({ category: 'service-worker', message: 'Chamando chrome.tabs.captureVisibleTab()', level: 'info' });

        // Chamar captureVisibleTab COM windowId explícito
        // Isso é essencial para funcionar após reload da página
        const captureStartTime = Date.now();
        const imageData = await chrome.tabs.captureVisibleTab(windowId, {
          format,
          quality,
        });

        const captureDuration = Date.now() - captureStartTime;

        addBreadcrumb({
          category: 'service-worker',
          message: `Captura viewport bem-sucedida em ${captureDuration}ms`,
          level: 'info',
          data: { imageDataLength: imageData.length, format, isValidDataUrl: imageData.startsWith('data:image/') },
        });

        logger.info('CAPTURE', 'VIEWPORT_CAPTURE_SUCCESS', {
          imageSizeBytes: imageData.length,
          format,
          captureDurationMs: captureDuration,
          windowId,
          isValidDataUrl: imageData.startsWith('data:image/'),
        });

        return {
          success: true,
          data: { imageData },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        const errorName = error instanceof Error ? error.name : 'Unknown';
        const errorStack = error instanceof Error ? error.stack : undefined;

        addBreadcrumb({
          category: 'service-worker',
          message: 'Falha na captura viewport',
          level: 'warning',
          data: { errorMessage, errorName },
        });

        if (errorMessage.includes('activeTab') || errorMessage.includes('all_urls')) {
          addBreadcrumb({ category: 'service-worker', message: 'Diagnostico: Problema de permissao - activeTab expira apos reload', level: 'warning' });
        } else if (errorMessage.includes('No tab')) {
          addBreadcrumb({ category: 'service-worker', message: 'Diagnostico: Aba nao encontrada ou foi fechada', level: 'warning' });
        } else if (errorMessage.includes('Cannot access')) {
          addBreadcrumb({ category: 'service-worker', message: 'Diagnostico: Pagina protegida (chrome://, extensoes, etc)', level: 'warning' });
        }

        logger.error('CAPTURE', 'VIEWPORT_CAPTURE_FAILED', {
          error: errorMessage,
          errorName,
          stack: errorStack,
          captureTabId,
          windowId: currentCaptureState?.tabId ? 'definido' : 'indefinido',
        });
        return {
          success: false,
          error: `Falha ao capturar viewport: ${errorMessage}`,
        };
      }
    }

    case 'CAPTURE_PROGRESS': {
      // Log de progresso da captura recebido do content script
      const progressPayload = message.payload as {
        stage?: string;
        percent?: number;
        message?: string;
        currentViewport?: number;
        totalViewports?: number;
      } | undefined;

      logger.info('CAPTURE', 'CAPTURE_PROGRESS_UPDATE', {
        stage: progressPayload?.stage,
        percent: progressPayload?.percent,
        message: progressPayload?.message,
        currentViewport: progressPayload?.currentViewport,
        totalViewports: progressPayload?.totalViewports,
        captureId: currentCaptureState?.id,
      });

      // Atualizar estado da captura
      if (currentCaptureState && progressPayload) {
        currentCaptureState.progress = progressPayload.percent ?? currentCaptureState.progress;
        currentCaptureState.progressMessage = progressPayload.message ?? currentCaptureState.progressMessage;
        await persistCaptureState(currentCaptureState);

        // Requirement 20.1-20.4: Atualizar badge para gravação de vídeo
        // Badge mostra porcentagem durante gravação, verde normal, amarelo próximo do limite
        if (currentCaptureState.type === 'video' && typeof progressPayload.percent === 'number') {
          await updateBadgeProgress(progressPayload.percent);
        }
      }

      return { success: true };
    }


    // Mensagens de créditos
    case 'GET_CREDITS': {
      // TODO: Implementar busca de créditos
      const user = await getStoredUser();
      return {
        success: true,
        data: { balance: user?.credits ?? 0, usedThisMonth: 0 },
      };
    }

    case 'CREDITS_REFRESH': {
      addBreadcrumb({ category: 'service-worker', message: 'CREDITS_REFRESH recebido', level: 'info' });
      logger.info('CREDITS', 'CREDITS_REFRESH_REQUESTED', {});

      try {
        const sbClient = getSupabaseClient();
        const { data: { user: authUser } } = await sbClient.auth.getUser();

        if (!authUser) {
          addBreadcrumb({ category: 'service-worker', message: 'CREDITS_REFRESH sem usuario autenticado', level: 'warning' });
          logger.warn('CREDITS', 'CREDITS_REFRESH_NO_AUTH', {});
          return {
            success: false,
            error: 'Usuario nao autenticado',
          };
        }

        // Busca saldo via RPC do Supabase
        const { data: creditBalance, error: creditError } = await sbClient
          .rpc('get_user_credit_balance', { p_user_id: authUser.id });

        if (creditError) {
          addBreadcrumb({ category: 'service-worker', message: 'CREDITS_REFRESH RPC retornou erro', level: 'warning' });
          logger.error('CREDITS', 'CREDITS_REFRESH_RPC_ERROR', {
            error: creditError.message,
          });
          return {
            success: false,
            error: creditError.message ?? 'Erro ao atualizar creditos',
          };
        }

        const credits = creditBalance ?? 0;
        addBreadcrumb({ category: 'service-worker', message: `CREDITS_REFRESH creditos: ${credits}`, level: 'info' });

        // Atualiza storage local com novos creditos
        const storedUser = await getStoredUser();
        if (storedUser) {
          storedUser.credits = credits;
          await storeUser(storedUser);
        }

        addBreadcrumb({ category: 'service-worker', message: 'CREDITS_REFRESH sucesso', level: 'info' });
        logger.info('CREDITS', 'CREDITS_REFRESH_SUCCESS', { credits });

        return {
          success: true,
          data: { credits },
        };
      } catch (error) {
        logger.error('CREDITS', 'CREDITS_REFRESH_ERROR', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return {
          success: false,
          error: 'Erro ao atualizar creditos',
        };
      }
    }

    case 'GET_PENDING_EVIDENCES': {
      addBreadcrumb({ category: 'service-worker', message: 'GET_PENDING_EVIDENCES recebido', level: 'info' });
      logger.info('PENDING', 'GET_PENDING_EVIDENCES_REQUESTED', {});

      try {
        const sbClient = getSupabaseClient();
        const { data: { user: authUser } } = await sbClient.auth.getUser();

        if (!authUser) {
          addBreadcrumb({ category: 'service-worker', message: 'GET_PENDING_EVIDENCES sem usuario autenticado', level: 'warning' });
          logger.warn('PENDING', 'GET_PENDING_EVIDENCES_NO_AUTH', {});
          return {
            success: false,
            error: 'Usuario nao autenticado',
          };
        }

        // Busca evidencias pendentes via Supabase direto
        const { data, error, count } = await sbClient
          .from('evidences')
          .select('*', { count: 'exact' })
          .eq('user_id', authUser.id)
          .eq('status', 'pending_review')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          addBreadcrumb({ category: 'service-worker', message: 'GET_PENDING_EVIDENCES query erro', level: 'warning' });
          logger.error('PENDING', 'GET_PENDING_EVIDENCES_QUERY_ERROR', {
            error: error.message,
          });
          return {
            success: false,
            error: `Erro ao buscar evidencias pendentes: ${error.message}`,
          };
        }

        addBreadcrumb({ category: 'service-worker', message: 'GET_PENDING_EVIDENCES sucesso', level: 'info' });
        logger.info('PENDING', 'GET_PENDING_EVIDENCES_SUCCESS', {
          total: count ?? 0,
        });

        return {
          success: true,
          data: {
            evidences: data || [],
            total: count ?? 0,
            maxPending: 10,
          },
        };
      } catch (error) {
        logger.error('PENDING', 'GET_PENDING_EVIDENCES_EXCEPTION', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return {
          success: false,
          error: 'Falha ao buscar evidências pendentes',
        };
      }
    }

    // Mensagens de upload
    case 'GET_PRESIGNED_URL': {
      // Solicita presigned URL para upload de arquivo
      const presignPayload = message.payload as {
        fileType: string;
        fileSize: number;
        storageType: StorageType;
        captureId: string;
        contentType: string;
        fileName?: string;
      } | undefined;

      if (!presignPayload?.fileType || !presignPayload?.captureId) {
        return {
          success: false,
          error: 'Parâmetros obrigatórios não fornecidos (fileType, captureId)',
        };
      }

      try {
        const uploadHandler = getUploadHandlerInstance();

        // Construir request sem propriedades undefined
        const presignRequest: import('./upload-handler').PresignedUrlRequest = {
          fileType: presignPayload.fileType as import('./upload-handler').UploadFileType,
          fileSize: presignPayload.fileSize ?? 0,
          storageType: presignPayload.storageType ?? 'standard',
          captureId: presignPayload.captureId,
          contentType: presignPayload.contentType ?? 'application/octet-stream',
        };

        // Adicionar fileName apenas se definido
        if (presignPayload.fileName) {
          presignRequest.fileName = presignPayload.fileName;
        }

        const presignedUrl = await uploadHandler.requestPresignedUrl(presignRequest);

        logger.info('UPLOAD', 'PRESIGNED_URL_GERADA', {
          captureId: presignPayload.captureId,
          fileType: presignPayload.fileType,
        });

        return {
          success: true,
          data: presignedUrl,
        };
      } catch (error) {
        logger.error('UPLOAD', 'PRESIGNED_URL_ERRO', {
          captureId: presignPayload.captureId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        return {
          success: false,
          error: `Falha ao obter URL de upload: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        };
      }
    }

    case 'NOTIFY_UPLOAD_COMPLETE': {
      // Notifica backend que upload foi concluído
      const notifyPayload = message.payload as {
        captureId: string;
        storageType: StorageType;
        files: Array<{
          type: string;
          objectKey: string;
          downloadUrl: string;
          contentType: string;
          sizeBytes: number;
        }>;
        combinedHash?: string;
      } | undefined;

      if (!notifyPayload?.captureId || !notifyPayload?.files) {
        return {
          success: false,
          error: 'Parâmetros obrigatórios não fornecidos (captureId, files)',
        };
      }

      try {
        const uploadHandler = getUploadHandlerInstance();

        // Construir notification sem propriedades undefined
        const notification: import('./upload-handler').UploadCompleteNotification = {
          captureId: notifyPayload.captureId,
          storageType: notifyPayload.storageType ?? 'standard',
          files: notifyPayload.files.map(f => ({
            type: f.type as import('./upload-handler').UploadFileType,
            objectKey: f.objectKey,
            downloadUrl: f.downloadUrl,
            contentType: f.contentType,
            sizeBytes: f.sizeBytes,
          })),
          completedAt: new Date().toISOString(),
        };

        // Adicionar combinedHash apenas se definido
        if (notifyPayload.combinedHash) {
          notification.combinedHash = notifyPayload.combinedHash;
        }

        const notified = await uploadHandler.notifyUploadComplete(notification);

        logger.info('UPLOAD', 'UPLOAD_COMPLETE_NOTIFICADO', {
          captureId: notifyPayload.captureId,
          filesCount: notifyPayload.files.length,
          notified,
        });

        if (notified) {
          return { success: true };
        }
        return {
          success: false,
          error: 'Falha ao notificar backend',
        };
      } catch (error) {
        logger.error('UPLOAD', 'NOTIFY_UPLOAD_ERRO', {
          captureId: notifyPayload.captureId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        return {
          success: false,
          error: `Falha ao notificar conclusão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        };
      }
    }

    // Mensagens de certificação
    case 'GET_CERTIFICATION_STATUS':
      // TODO: Implementar na tarefa de integração com backend
      return {
        success: false,
        error: 'Funcionalidade de certificação ainda não implementada',
      };

    // Mensagens de isolamento de extensões
    case 'GET_ISOLATION_STATUS': {
      const manager = getIsolationManager(logger);
      const status = manager.getIsolationStatus();
      return {
        success: true,
        data: status,
      };
    }

    case 'PREVIEW_ISOLATION': {
      const manager = getIsolationManager(logger);
      const preview = await manager.previewIsolation();
      return {
        success: true,
        data: preview,
      };
    }

    case 'ACTIVATE_ISOLATION': {
      const manager = getIsolationManager(logger);
      const correlationId = message.correlationId ?? generateCorrelationId();
      const result = await manager.activateIsolation(correlationId);
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    }

    case 'DEACTIVATE_ISOLATION': {
      const manager = getIsolationManager(logger);
      const result = await manager.deactivateIsolation();
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    }

    case 'FORCE_RESTORE_EXTENSIONS': {
      const manager = getIsolationManager(logger);
      const result = await manager.forceRestore();
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    }

    case 'CHECK_ISOLATION_VIOLATIONS': {
      const manager = getIsolationManager(logger);
      const violations = await manager.checkForViolations();
      return {
        success: true,
        data: { violations },
      };
    }

    // ========================================================================
    // Handlers do InteractionTracker (Requisitos 2.6, 2.7)
    // ========================================================================

    case 'INTERACTION_STATS_UPDATE': {
      // Recebe atualização de estatísticas do InteractionTracker no content script
      // e repassa para o Side Panel
      // NOTA: pagesVisited é gerenciado pelo RecordingStateManager, não pelo InteractionTracker
      const stats = message.payload as {
        clickCount: number;
        keystrokeCount: number;
        scrollCount: number;
        formsInteracted: number;
        pagesVisited: number;
      };

      logger.info('INTERACTION', 'STATS_UPDATE_RECEIVED', {
        correlationId,
        stats,
      });

      // Repassa para o Side Panel, mas EXCLUI pagesVisited para evitar sobrescrever
      // o valor gerenciado pelo RecordingStateManager
      const sidePanelHandler = getSidePanelHandler();
      const { pagesVisited: _ignored, ...statsWithoutPages } = stats;
      await sidePanelHandler.sendStatsUpdate(statsWithoutPages);

      return { success: true };
    }

    case 'INTERACTION_EVENT': {
      // Recebe evento de interação individual do InteractionTracker
      // Pode ser usado para logging detalhado ou análise
      const event = message.payload as {
        type: 'click' | 'keypress' | 'scroll' | 'form-interaction';
        timestamp: number;
        data?: Record<string, unknown>;
      };

      logger.info('INTERACTION', 'EVENT_RECEIVED', {
        correlationId,
        eventType: event.type,
        timestamp: event.timestamp,
      });

      // Eventos individuais são logados mas não repassados ao Side Panel
      // (o Side Panel recebe apenas as estatísticas agregadas)
      return { success: true };
    }

    // ========================================================================
    // Handler do NavigationInterceptor (Requisitos 3.1-3.6)
    // ========================================================================

    // NOTA: NAVIGATION_EVENT vem do content script e não está no MessageType
    // @ts-expect-error - Tipo de mensagem vindo do NavigationInterceptor no content script
    case 'NAVIGATION_EVENT': {
      // Recebe evento de navegação do NavigationInterceptor no content script
      // e repassa para o Side Panel com informações formatadas
      const navEvent = message.payload as {
        fromUrl: string;
        toUrl: string;
        type: 'link-click' | 'form-submit' | 'history-back' | 'history-forward' | 'redirect';
        timestamp: number;
        htmlContent: string;
      };

      logger.info('CAPTURE', 'NAVIGATION_EVENT_RECEIVED', {
        correlationId,
        fromUrl: navEvent.fromUrl?.substring(0, 100),
        toUrl: navEvent.toUrl?.substring(0, 100),
        type: navEvent.type,
      });

      try {
        // Usar RecordingStateManager (import estático) para obter tempo de início
        const stateManager = getRecordingStateManager();
        const recordingState = stateManager.getState();

        // Calcular timestamp relativo ao vídeo
        const videoTimestamp = recordingState.startTime > 0
          ? navEvent.timestamp - recordingState.startTime
          : 0;

        // Formatar tempo em MM:SS
        const totalSeconds = Math.floor(videoTimestamp / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Truncar URL para exibição
        const truncatedUrl = navEvent.toUrl.length > 50
          ? navEvent.toUrl.substring(0, 47) + '...'
          : navEvent.toUrl;

        // Calcular hash do HTML (simplificado - apenas comprimento por performance)
        const htmlHash = navEvent.htmlContent
          ? `hash_${navEvent.htmlContent.length}`
          : 'no_html';

        // Criar entrada de navegação para o Side Panel
        const navigationEntry = {
          videoTimestamp,
          formattedTime,
          url: truncatedUrl,
          fullUrl: navEvent.toUrl,
          type: navEvent.type as 'link-click' | 'form-submit' | 'history-back' | 'history-forward' | 'redirect',
          htmlHash,
        };

        // Repassa para o Side Panel
        const sidePanelHandler = getSidePanelHandler();
        await sidePanelHandler.sendNavigationUpdate(navigationEntry);

        // Incrementar contador de páginas visitadas nas estatísticas
        await sidePanelHandler.sendStatsUpdate({
          pagesVisited: (recordingState.stats?.pagesVisited || 0) + 1,
        });

        return { success: true };
      } catch (error) {
        logger.error('CAPTURE', 'NAVIGATION_EVENT_PROCESSING_FAILED', {
          correlationId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return { success: false, error: 'Falha ao processar evento de navegação' };
      }
    }

    // @ts-expect-error - Tipo de mensagem vindo do content script
    case 'CHECK_RECORDING_STATUS': {
      // Verifica se há uma gravação em andamento
      // Usado pelo content script ao carregar para iniciar InteractionTracker automaticamente
      try {
        const stateManager = getRecordingStateManager();
        const isRecording = stateManager.isRecording();

        logger.info('CAPTURE', 'RECORDING_STATUS_CHECK', {
          correlationId,
          isRecording,
        });

        return {
          success: true,
          data: { isRecording },
        };
      } catch (error) {
        logger.error('CAPTURE', 'RECORDING_STATUS_CHECK_FAILED', {
          correlationId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return { success: false, data: { isRecording: false } };
      }
    }

    // @ts-expect-error - Tipo de mensagem vindo do content script
    case 'PAGE_VISITED_DURING_RECORDING': {
      // Recebe notificação de nova página visitada durante gravação
      // Registra na timeline de navegação do Side Panel e persiste no estado
      const pagePayload = message.payload as {
        url: string;
        title: string;
        timestamp: number;
      };

      logger.info('CAPTURE', 'PAGE_VISITED_DURING_RECORDING', {
        correlationId,
        url: pagePayload.url?.substring(0, 100),
        title: pagePayload.title?.substring(0, 50),
      });

      try {
        const stateManager = getRecordingStateManager();
        const recordingState = stateManager.getState();

        // Só processar se estiver gravando
        if (recordingState.status !== 'recording') {
          return { success: true };
        }

        // Usar o RecordingStateManager para adicionar navegação
        // Isso persiste no estado E faz broadcast para o Side Panel automaticamente
        // O método addNavigation já inclui o título e faz o broadcast
        const navigationEntry = stateManager.addNavigation({
          url: pagePayload.url,
          type: 'link-click',
          htmlHash: '', // Hash será preenchido pelo NavigationInterceptor se disponível
          timestamp: pagePayload.timestamp,
          title: pagePayload.title || new URL(pagePayload.url).hostname,
        });

        logger.info('CAPTURE', 'PAGE_VISITED_REGISTERED', {
          correlationId,
          url: navigationEntry.url,
          title: navigationEntry.title?.substring(0, 50),
          videoTimestamp: navigationEntry.videoTimestamp,
          totalPages: stateManager.getState().stats.pagesVisited,
          totalNavHistory: stateManager.getState().navigationHistory.length,
        });

        return { success: true };
      } catch (error) {
        logger.error('CAPTURE', 'PAGE_VISITED_PROCESSING_FAILED', {
          correlationId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return { success: false };
      }
    }

    case 'AUTO_FINALIZATION_NOTIFICATION': {
      // Recebe notificação de auto-finalização do VideoCapture
      // Requisitos 9.4, 9.5: Notificar usuário via Side Panel quando tempo máximo é atingido
      const autoFinalizePayload = message.payload as {
        reason: string;
        elapsedMs: number;
        maxDurationMs: number;
      };

      logger.info('CAPTURE', 'AUTO_FINALIZATION_RECEIVED', {
        correlationId,
        reason: autoFinalizePayload.reason,
        elapsedMs: autoFinalizePayload.elapsedMs,
        maxDurationMs: autoFinalizePayload.maxDurationMs,
      });

      // Usar RecordingStateManager para notificar Side Panel
      try {
        const stateManager = getRecordingStateManager();
        
        // Adiciona alerta de auto-finalização ao Side Panel
        const alert = stateManager.notifyAutoFinalization();
        
        logger.info('CAPTURE', 'AUTO_FINALIZATION_ALERT_SENT', {
          correlationId,
          alertId: alert.id,
          message: alert.message,
        });

        return { success: true, data: { alertId: alert.id } };
      } catch (error) {
        logger.error('CAPTURE', 'AUTO_FINALIZATION_NOTIFICATION_FAILED', {
          correlationId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return { success: false, error: 'Falha ao notificar auto-finalização' };
      }
    }

    // ========================================================================
    // CONTENT_SCRIPT_READY_FOR_CAPTURE
    // Notificação do content script que está pronto para captura
    // ========================================================================
    case 'CONTENT_SCRIPT_READY_FOR_CAPTURE': {
      const readyPayload = message.payload as {
        url: string;
        title: string;
        readyState: string;
        timestamp: string;
      };

      logger.debug('GENERAL', 'CONTENT_SCRIPT_READY', {
        correlationId,
        url: readyPayload?.url?.substring(0, 100),
        title: readyPayload?.title?.substring(0, 50),
        readyState: readyPayload?.readyState,
      });

      // Apenas confirma recebimento - não precisa de ação adicional
      return { success: true };
    }

    // Mensagem enviada pelo popup/sidepanel após concessão de permissões
    // Não requer ação - apenas confirma recebimento
    case 'PERMISSIONS_GRANTED': {
      logger.debug('GENERAL', 'PERMISSIONS_GRANTED_RECEIVED', {
        correlationId,
      });
      return { success: true };
    }

    default:
      logger.warn('GENERAL', 'UNKNOWN_MESSAGE_TYPE', {
        type: message.type,
      });
      return {
        success: false,
        error: `Tipo de mensagem desconhecido: ${message.type}`,
      };
  }
}

// ============================================================================
// Exports para Testes
// ============================================================================

export {
  handleMessage,
  getAuthStatus,
  handleLogin,
  handleLogout,
  refreshAccessToken,
  startCapture,
  stopCapture,
  cancelCapture,
  getCaptureStatus,
  storeTokens,
  getStoredTokens,
  storeUser,
  getStoredUser,
  clearAuthData,
  isTokenExpiringSoon,
  isTokenExpired,
  isRefreshTokenValid,
  handleSessionExpired,
  persistCaptureState,
  recoverCaptureState,
  clearCaptureState,
  updateCaptureState,
  withRetry,
  getIsolationManager,
  initializeIsolationManager,
  ensureIsolationRestored,
  STORAGE_KEYS,
  AUTH_CONFIG,
};

export type { Message, MessageResponse, MessageType };
