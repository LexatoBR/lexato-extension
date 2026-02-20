/**
 * Componente principal do Popup Lexato
 *
 * Fluxo enriquecido com wizard completo:
 * 1. Se não autenticado: exibe LoginForm
 * 2. Se autenticado: exibe wizard de captura com:
 *    - Header com hamburger menu (SlideMenu)
 *    - Verificação de URL bloqueada
 *    - Seletor de tipo de captura (CaptureTypeCompact)
 *    - Instruções scrolláveis com termos de aceite
 *    - Consentimento de geolocalização
 *    - Verificação de créditos
 *    - Modal de progresso para screenshot
 *    - Modal de erro de captura
 * 3. Screenshot: mostra progresso no popup, não fecha
 * 4. Vídeo: obtém streamId via tabCapture, abre SidePanel e fecha popup
 *
 * O popup tem user gesture do clique no ícone da extensão,
 * o que permite chamar chrome.tabCapture.getMediaStreamId() sem picker.
 *
 * @module PopupApp
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../sidepanel/hooks/useAuth';
import { useCapture } from '../sidepanel/hooks/useCapture';
import { useCredits } from '../hooks/useCredits';
import { useCurrentTab } from '../sidepanel/hooks/useCurrentTab';
import { useGeolocationConsent } from '../sidepanel/hooks/useGeolocationConsent';
import LoginForm from '../sidepanel/components/auth/LoginForm';
import { Header } from '../sidepanel/components/layout/Header';
import { SlideMenu } from '../sidepanel/components/layout/SlideMenu/SlideMenu';
import type { MenuItemId } from '../sidepanel/components/layout/SlideMenu/SlideMenu';
import { CaptureTypeCompact } from '../sidepanel/components/capture/CaptureWizard/CaptureTypeCompact';
import { InstructionsScrollable } from '../sidepanel/components/capture/CaptureWizard/InstructionsScrollable';
import { StepGeolocationConsent } from '../sidepanel/components/capture/CaptureWizard/StepGeolocationConsent';
import { StepNoCredits } from '../sidepanel/components/capture/CaptureWizard/StepNoCredits';
import { BlockedUrlWarning } from '../sidepanel/components/capture/CaptureWizard/BlockedUrlWarning';
import { AlertBanner } from '../components/shared/AlertBanner';
import { PrimaryButton } from '../components/shared/PrimaryButton';
import CaptureProgressModal from '../sidepanel/components/capture/CaptureProgressModal';
import { CaptureErrorModal } from '../sidepanel/components/capture/CaptureErrorModal';
import { DiagnosticPanel } from '../sidepanel/components/diagnostic/DiagnosticPanel';
import { I18nProvider, useI18n } from '../lib/i18n';
import {
  preflightVideoPermissions,
  preflightScreenshotPermissions,
  notifyServiceWorkerPermissionsGranted,
} from '../lib/permissions/permission-preflight';
import type { CaptureType, StorageType, ScreenshotCaptureProgress } from '../types/capture.types';
import type { IsolationPreview } from '../types/isolation.types';

// Importar estilos de layout
import '../assets/styles/layout.css';
import '../sidepanel/components/layout/Header.css';
import '../sidepanel/components/layout/SlideMenu/SlideMenu.css';

/** Altura do header em pixels */
const HEADER_HEIGHT = '56px';

/** Chave do session storage para streamId pré-capturado */
const VIDEO_STREAM_ID_KEY = 'lexato_video_stream_id';

/**
 * Verifica se o progresso é de screenshot (tem campo stage)
 */
function isScreenshotProgress(
  progress: unknown
): progress is ScreenshotCaptureProgress {
  return (
    progress !== null &&
    typeof progress === 'object' &&
    'stage' in (progress as Record<string, unknown>)
  );
}

/**
 * Conteúdo principal do popup (dentro do I18nProvider)
 */
function PopupContent(): React.ReactElement {
  const { isAuthenticated, isLoading: authLoading, user, error: authError, logout, validateSession } = useAuth();
  const {
    isCapturing,
    captureProgress,
    cancelCapture,
    startCapture,
    errorDetails,
    isRetrying,
    retryCapture,
    clearErrorState,
    error: captureError,
  } = useCapture();
  const { credits, getStorageCost } = useCredits();
  const { podeCapturar, verificacaoUrl, isLoading: isLoadingTab } = useCurrentTab();
  const { t } = useI18n();

  const {
    shouldShowPreCapture: shouldShowGeoConsent,
    handleAllow: handleGeoAllow,
    handleDeny: handleGeoDeny,
    isLoading: isGeoLoading,
    checkConsent: checkGeoConsent,
    resetFlow: resetGeoFlow,
  } = useGeolocationConsent();

  // Estado do wizard
  const [activeSection, setActiveSection] = useState<'capture' | 'diagnostic'>('capture');
  const [captureType, setCaptureType] = useState<CaptureType | null>(null);
  const [storageType] = useState<StorageType>('standard');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [hasReadInstructions, setHasReadInstructions] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Fluxos condicionais
  const [showGeolocationConsent, setShowGeolocationConsent] = useState(false);
  const [showNoCredits, setShowNoCredits] = useState(false);
  const [geolocationProcessed, setGeolocationProcessed] = useState(false);

  // Menu lateral
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Preview de isolamento
  const [isolationPreview, setIsolationPreview] = useState<IsolationPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);

  // Créditos do usuário
  const userCredits = user?.credits ?? credits;

  /** Carrega preview de isolamento ao montar */
  useEffect(() => {
    const loadIsolationPreview = async (): Promise<void> => {
      try {
        setIsLoadingPreview(true);
        const response = await chrome.runtime.sendMessage({ type: 'PREVIEW_ISOLATION' });
        if (response?.success && response.data) {
          setIsolationPreview(response.data as IsolationPreview);
        }
      } catch (err) {
        console.error('[PopupApp] Erro ao carregar preview de isolamento:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    };
    loadIsolationPreview();
  }, []);

  /** Reseta estado quando muda o tipo de captura */
  useEffect(() => {
    setHasReadInstructions(false);
    setAcceptedTerms(false);
    setLocalError(null);
  }, [captureType]);

  /** Botão habilitado: tipo + instruções lidas + termos aceitos */
  const canStart = captureType !== null
    && hasReadInstructions
    && acceptedTerms
    && !isCapturing
    && !isStarting;

  const displayError = localError ?? captureError;

  /**
   * Inicia captura de vídeo:
   * 1. Obtém streamId via tabCapture (user gesture do popup)
   * 2. Salva streamId no session storage
   * 3. Envia OPEN_SIDEPANEL_FOR_VIDEO ao service worker
   * 4. Fecha popup — Side Panel assume o controle
   */
  const handleVideoCapture = useCallback(async () => {
    setLocalError(null);
    setIsStarting(true);

    try {
      // Solicitar permissões opcionais (user gesture do clique)
      const preflight = await preflightVideoPermissions();
      if (!preflight.allGranted) {
        setLocalError(`Permissões recusadas: ${preflight.denied.join(', ')}`);
        setIsStarting(false);
        return;
      }
      await notifyServiceWorkerPermissionsGranted(preflight.granted);

      // Obter aba ativa
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || activeTab.id === chrome.tabs.TAB_ID_NONE) {
        setLocalError('Não foi possível acessar a aba atual');
        setIsStarting(false);
        return;
      }

      // Obter streamId via tabCapture (funciona no popup por ter user gesture)
      let streamId: string | undefined;
      try {
        const tabId = activeTab.id;
        streamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId(
            { targetTabId: tabId },
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
      } catch (err) {
        console.warn('[PopupApp] Falha ao obter streamId via tabCapture:', err);
        // Continua sem streamId — o offscreen usará getDisplayMedia como fallback
      }

      // Salvar streamId e tabId no session storage para o service worker consumir
      await chrome.storage.session.set({
        [VIDEO_STREAM_ID_KEY]: {
          streamId: streamId ?? null,
          tabId: activeTab.id,
          timestamp: Date.now(),
        },
      });

      // Enviar mensagem para abrir Side Panel e iniciar fluxo de vídeo
      const result = await chrome.runtime.sendMessage({
        type: 'OPEN_SIDEPANEL_FOR_VIDEO',
        payload: {
          tabId: activeTab.id,
          windowId: activeTab.windowId,
          streamId: streamId ?? null,
        },
      });

      if (!result?.success) {
        setLocalError(result?.error ?? 'Falha ao abrir painel de vídeo');
        setIsStarting(false);
        return;
      }

      // Fechar popup — Side Panel assume o controle
      window.close();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Erro ao iniciar captura de vídeo');
      setIsStarting(false);
    }
  }, []);

  /**
   * Inicia captura de screenshot via wizard completo.
   * Diferente do vídeo, o popup NÃO fecha — mostra o progresso.
   */
  const handleScreenshotCapture = useCallback(async () => {
    setLocalError(null);
    setIsStarting(true);

    try {
      // Solicitar permissões opcionais (user gesture do clique)
      const preflight = await preflightScreenshotPermissions();
      if (!preflight.allGranted) {
        setLocalError(`Permissões recusadas: ${preflight.denied.join(', ')}`);
        setIsStarting(false);
        return;
      }
      await notifyServiceWorkerPermissionsGranted(preflight.granted);

      // Iniciar captura via hook useCapture (envia START_CAPTURE ao service worker)
      await startCapture('screenshot', storageType);
      // Popup permanece aberto — CaptureProgressModal será exibido
    } catch (err) {
      console.error('[PopupApp] Erro ao iniciar captura de screenshot:', err);
      setLocalError(err instanceof Error ? err.message : 'Erro ao iniciar captura');
    } finally {
      setIsStarting(false);
    }
  }, [startCapture, storageType]);

  /**
   * Handler principal do botão "Iniciar Captura"
   * Executa validações e fluxos condicionais antes de iniciar
   */
  const handleStartCapture = useCallback(async () => {
    setLocalError(null);

    // Validar sessão antes de qualquer operação
    const sessionValid = await validateSession();
    if (!sessionValid) {
      return;
    }

    if (!captureType) {
      setLocalError('Selecione um tipo de captura');
      return;
    }

    if (!hasReadInstructions || !acceptedTerms) {
      setLocalError('Leia todas as instruções e aceite os termos de uso');
      return;
    }

    // Verificar créditos
    const cost = getStorageCost(storageType);
    if (credits < cost) {
      setShowNoCredits(true);
      return;
    }

    // Verificar consentimento de geolocalização
    if (!geolocationProcessed) {
      await checkGeoConsent();
      if (shouldShowGeoConsent) {
        setShowGeolocationConsent(true);
        return;
      }
      setGeolocationProcessed(true);
    }

    // Despachar para o handler correto
    if (captureType === 'video') {
      await handleVideoCapture();
    } else {
      await handleScreenshotCapture();
    }
  }, [
    captureType, hasReadInstructions, acceptedTerms, storageType,
    credits, getStorageCost, geolocationProcessed,
    checkGeoConsent, shouldShowGeoConsent, validateSession,
    handleVideoCapture, handleScreenshotCapture,
  ]);

  /** Prossegue com captura após consentimento de geolocalização */
  const proceedAfterGeoConsent = useCallback(async () => {
    if (!captureType) {
      return;
    }
    if (captureType === 'video') {
      await handleVideoCapture();
    } else {
      await handleScreenshotCapture();
    }
  }, [captureType, handleVideoCapture, handleScreenshotCapture]);

  const handleGeoAllowAndContinue = useCallback(async (remember: boolean) => {
    await handleGeoAllow(remember);
    setShowGeolocationConsent(false);
    setGeolocationProcessed(true);
    await proceedAfterGeoConsent();
  }, [handleGeoAllow, proceedAfterGeoConsent]);

  const handleGeoDenyAndContinue = useCallback((remember: boolean) => {
    handleGeoDeny(remember);
    setShowGeolocationConsent(false);
    setGeolocationProcessed(true);
    proceedAfterGeoConsent();
  }, [handleGeoDeny, proceedAfterGeoConsent]);

  const handleBackFromNoCredits = useCallback(() => {
    setShowNoCredits(false);
  }, []);

  const handleBackFromGeo = useCallback(() => {
    setShowGeolocationConsent(false);
    resetGeoFlow();
  }, [resetGeoFlow]);

  /** Handler para seleção de item no menu lateral */
  const handleMenuItemSelect = useCallback((item: MenuItemId): void => {
    if (item === 'help') {
      chrome.tabs.create({ url: 'https://lexato.com.br/ajuda' });
    } else if (item === 'settings') {
      chrome.runtime.openOptionsPage();
    } else if (item === 'history') {
      chrome.tabs.create({ url: 'https://app.lexato.com.br/capturas' });
    } else if (item === 'diagnostic') {
      setActiveSection('diagnostic');
    } else if (item === 'capture') {
      setActiveSection('capture');
    }
    // Fechar menu após seleção
    setIsMenuOpen(false);
  }, []);

  const handleBackToCapture = useCallback(() => {
    setActiveSection('capture');
  }, []);

  // ========================================================================
  // Tela de carregamento
  // ========================================================================
  if (authLoading) {
    return (
      <div className="sidepanel-root">
        <div className="extension-glow" />
        <div className="flex flex-col items-center justify-center h-full relative z-10">
          <div
            className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--green-bright)', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '12px' }}>
            {t.common.loading}
          </p>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Tela de login
  // ========================================================================
  if (!isAuthenticated) {
    return (
      <div className="sidepanel-root">
        <div className="extension-glow" />
        <main className="flex-1 overflow-y-auto relative z-10 flex flex-col justify-center p-4">
          {authError && (
            <div
              className="mb-3 rounded-lg p-3 text-sm"
              role="alert"
              style={{
                backgroundColor: 'rgba(239, 83, 80, 0.1)',
                color: 'var(--color-error)',
              }}
            >
              {authError}
            </div>
          )}
          <LoginForm />
        </main>
      </div>
    );
  }

  // ========================================================================
  // Tela de diagnóstico
  // ========================================================================
  if (activeSection === 'diagnostic') {
    return (
      <div className="sidepanel-root">
         {/* Menu Lateral Deslizante */}
        <SlideMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          activeItem="diagnostic"
          onItemSelect={handleMenuItemSelect}
          userName={user?.name ?? undefined}
          userEmail={user?.email ?? undefined}
          avatarUrl={user?.avatarUrl ?? undefined}
          onLogout={logout}
        />
        
        {/* Radial glow de fundo */}
        <div className="extension-glow" />

        <div className="h-full flex flex-col bg-background relative z-10"> 
            <header className="extension-header-tabs" style={{ height: HEADER_HEIGHT }}>
                <Header
                credits={userCredits}
                usedThisMonth={user?.usedThisMonth}
                planName={user?.planName}
                onMenuClick={() => setIsMenuOpen(true)}
                />
            </header>

            <div className="flex-1 overflow-y-auto w-full">
                 <div className={activeSection === 'diagnostic' ? '' : 'p-4'}>
                    {activeSection === 'diagnostic' && (
                        <div className="p-4 pb-0">
                            <button 
                                onClick={handleBackToCapture}
                                className="mb-4 text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
                            >
                                ← Voltar para Captura
                            </button>
                        </div>
                    )}
                    <DiagnosticPanel />
                 </div>
            </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Verificar se deve mostrar modal de progresso de screenshot
  // ========================================================================
  const showScreenshotModal = isCapturing && captureProgress && isScreenshotProgress(captureProgress);

  // ========================================================================
  // Telas condicionais (créditos insuficientes, geolocalização)
  // ========================================================================
  if (showNoCredits) {
    return (
      <div className="sidepanel-root">
        <div className="extension-glow" />
        <header className="extension-header-tabs" style={{ height: HEADER_HEIGHT }}>
          <Header credits={userCredits} onMenuClick={() => setIsMenuOpen(true)} />
        </header>
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          <StepNoCredits credits={userCredits} onBack={handleBackFromNoCredits} />
        </div>
      </div>
    );
  }

  if (showGeolocationConsent) {
    return (
      <div className="sidepanel-root">
        <div className="extension-glow" />
        <header className="extension-header-tabs" style={{ height: HEADER_HEIGHT }}>
          <Header credits={userCredits} onMenuClick={() => setIsMenuOpen(true)} />
        </header>
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          <StepGeolocationConsent
            onAllow={handleGeoAllowAndContinue}
            onDeny={handleGeoDenyAndContinue}
            isLoading={isGeoLoading}
          />
          <button
            type="button"
            onClick={handleBackFromGeo}
            disabled={isGeoLoading}
            style={{
              padding: '8px',
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              cursor: isGeoLoading ? 'not-allowed' : 'pointer',
              opacity: isGeoLoading ? 0.5 : 1,
              textDecoration: 'underline',
              alignSelf: 'center',
              display: 'block',
              margin: '8px auto 0',
            }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Tela principal: wizard de captura completo
  // ========================================================================
  return (
    <div className="sidepanel-root">
      {/* Menu Lateral Deslizante */}
      <SlideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeItem="capture"
        onItemSelect={handleMenuItemSelect}
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        avatarUrl={user?.avatarUrl ?? undefined}
        onLogout={logout}
      />

      {/* Modal Imersivo de Progresso (Screenshot) */}
      {showScreenshotModal && (
        <CaptureProgressModal
          progress={captureProgress as ScreenshotCaptureProgress}
          onCancel={cancelCapture}
        />
      )}

      {/* Modal de Erro de Captura */}
      <CaptureErrorModal
        isOpen={!!errorDetails}
        error={errorDetails}
        onRetry={retryCapture}
        onCancel={clearErrorState}
        isRetrying={isRetrying}
      />

      {/* Radial glow de fundo */}
      <div className="extension-glow" />

      {/* Header — Hamburger | Logo | Créditos */}
      <header className="extension-header-tabs" style={{ height: HEADER_HEIGHT }}>
        <Header
          credits={userCredits}
          usedThisMonth={user?.usedThisMonth}
          planName={user?.planName}
          onMenuClick={() => setIsMenuOpen(true)}
        />
      </header>

      {/* Conteúdo principal scrollável */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
        {/* Verificação de URL bloqueada */}
        {!isLoadingTab && !podeCapturar ? (
          <BlockedUrlWarning {...(verificacaoUrl.motivo ? { motivo: verificacaoUrl.motivo } : {})} />
        ) : (
          <>
            {/* Erro */}
            {displayError && (
              <AlertBanner type="error" title="Erro" message={displayError} />
            )}

            {/* 1. Seletor de tipo com descrição */}
            <CaptureTypeCompact
              value={captureType}
              onChange={setCaptureType}
              disabled={isCapturing || isStarting}
            />

            {/* 2. Instruções scrolláveis (aparece após selecionar tipo) */}
            {captureType && (
              <InstructionsScrollable
                captureType={captureType}
                storageType={storageType}
                isolationPreview={isolationPreview}
                isLoadingPreview={isLoadingPreview}
                onReadComplete={setHasReadInstructions}
                hasRead={hasReadInstructions}
              />
            )}

            {/* 3. Rodapé: checkbox + botão (aparece após selecionar tipo) */}
            {captureType && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                {/* Checkbox de aceite */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: hasReadInstructions ? 'pointer' : 'not-allowed',
                    opacity: hasReadInstructions ? 1 : 0.4,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    disabled={!hasReadInstructions}
                    style={{
                      width: '16px',
                      height: '16px',
                      marginTop: '2px',
                      accentColor: 'var(--green-bright)',
                      cursor: hasReadInstructions ? 'pointer' : 'not-allowed',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Li e compreendi as instruções e aceito os{' '}
                    <a
                      href="https://lexato.com.br/termos-de-uso"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--green-bright)', textDecoration: 'none', fontWeight: 500 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Termos de Uso
                    </a>
                  </span>
                </label>

                {/* Aviso para não fechar o popup durante captura */}
                {captureType === 'screenshot' && (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 167, 38, 0.08)',
                      border: '1px solid rgba(255, 167, 38, 0.2)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFA726" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Não feche este popup durante a captura de screenshot</span>
                  </div>
                )}

                {/* Botão de iniciar */}
                <PrimaryButton
                  onClick={handleStartCapture}
                  disabled={!canStart}
                  loading={isStarting}
                  fullWidth
                  showArrow={false}
                >
                  {captureType === 'video' ? 'Iniciar Gravação' : 'Iniciar Captura'}
                </PrimaryButton>
              </div>
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
}

/**
 * Componente raiz do Popup — envolve com I18nProvider
 */
export default function PopupApp(): React.ReactElement {
  return (
    <I18nProvider>
      <PopupContent />
    </I18nProvider>
  );
}
