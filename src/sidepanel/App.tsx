/**
 * Componente raiz unificado do Side Panel - Lexato Chrome Extension
 *
 * Unifica a interface do popup (login, captura, histórico, diagnóstico)
 * com os controles de gravação de vídeo do Side Panel em um único ponto
 * de entrada. Gerencia o ViewState para determinar qual view renderizar.
 *
 * Fluxo de ViewState:
 * - loading: Verificando autenticação
 * - login: Usuário não autenticado -> LoginForm
 * - recording: Gravação de vídeo em andamento -> SidePanel (VideoRecording)
 * - main: Interface principal com navegação entre seções
 *
 * Requisitos atendidos:
 * - 2.1: Header com hamburger menu, logo e créditos
 * - 2.2: SlideMenu com navegação e logout
 * - 2.3: Navegação interna entre seções (capture, history, diagnostic)
 * - 2.4: Transição animada entre conteúdos (PageTransition)
 * - 2.5: VideoRecordingPanel integrado durante gravação de vídeo
 * - 2.6: CaptureProgressModal durante screenshot
 * - 2.7: CaptureErrorModal para erros de captura
 * - 3.1: Largura mínima de 360px
 * - 3.2: Altura 100% da janela
 * - 3.5: Tema escuro com fundo Onyx (#0F0E10)
 * - 4.1: Inicialização do useAuth
 * - 4.2: LoginForm quando não autenticado
 * - 4.3: Interface principal quando autenticado
 * - 5.1: Transição para VideoRecordingPanel durante captura de vídeo
 * - 5.2: Timer e estatísticas em tempo real durante gravação
 * - 5.3: Retorno à interface principal após gravação
 * - 7.2: I18nProvider para internacionalização
 *
 * @module App
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useCapture } from './hooks/useCapture';
import LoginForm from './components/auth/LoginForm';
import { CaptureWizard } from './components/capture/CaptureWizard/CaptureWizard';
import ProgressIndicator from './components/capture/ProgressIndicator';
import CaptureProgressModal from './components/capture/CaptureProgressModal';
import { CaptureErrorModal } from './components/capture/CaptureErrorModal';
import RecentCaptures from './components/history/RecentCaptures';
import { DiagnosticPanel } from './components/diagnostic/DiagnosticPanel';
import { Header } from './components/layout/Header';
import { SlideMenu, type MenuItemId } from './components/layout/SlideMenu/SlideMenu';
import SidePanel from './SidePanel';
import { ScrollIndicator } from '../components/shared/ScrollIndicator';
import { PageTransition } from '../components/shared/PageTransition';
import type { ScreenshotCaptureProgress } from '../types/capture.types';
import type { RecordingStatus } from './types';
import { I18nProvider, useI18n } from '../lib/i18n';

// Importar estilos de layout
import '../assets/styles/layout.css';

// =============================================================================
// Tipos
// =============================================================================

/** Identificador das seções de navegação interna */
type SectionId = 'capture' | 'history' | 'diagnostic';

/**
 * Estado da view principal do Side Panel
 *
 * Determina qual interface é renderizada:
 * - loading: Spinner enquanto verifica autenticação
 * - login: Formulário de login
 * - main: Interface principal com navegação entre seções
 * - recording: Painel de gravação de vídeo (SidePanel existente)
 */
type ViewState =
  | { mode: 'loading' }
  | { mode: 'login' }
  | { mode: 'main'; activeSection: SectionId }
  | { mode: 'recording' };

/** Altura do header */
const HEADER_HEIGHT = '56px';

// =============================================================================
// Componentes auxiliares
// =============================================================================

/**
 * Tela de carregamento inicial
 * Exibida enquanto o hook useAuth verifica o estado de autenticação
 */
function LoadingScreen(): React.ReactElement {
  const { t } = useI18n();
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

/**
 * Tela de login (usuário não autenticado)
 * Exibe o LoginForm com mensagem de erro opcional
 */
function LoginScreen({ error }: { error: string | null }): React.ReactElement {
  return (
    <div className="sidepanel-root">
      <div className="extension-glow" />
      <main className="flex-1 overflow-hidden relative z-10 flex flex-col justify-center p-4">
        {error && (
          <div
            className="mb-3 rounded-lg p-3 text-sm"
            role="alert"
            style={{
              backgroundColor: 'rgba(239, 83, 80, 0.1)',
              color: 'var(--color-error)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {error}
          </div>
        )}
        <LoginForm />
      </main>
    </div>
  );
}

// =============================================================================
// Funções utilitárias
// =============================================================================

/**
 * Verifica se o progresso é de screenshot (não vídeo)
 * Screenshots têm 'stage' mas não têm 'state' nem 'elapsedMs'
 */
function isScreenshotProgress(
  progress: unknown
): progress is ScreenshotCaptureProgress {
  return (
    progress !== null &&
    typeof progress === 'object' &&
    'stage' in progress &&
    !('state' in progress) &&
    !('elapsedMs' in progress)
  );
}

// =============================================================================
// Componente principal (dentro do I18nProvider)
// =============================================================================

/**
 * Conteúdo principal do Side Panel unificado
 *
 * Gerencia o ViewState baseado nos hooks useAuth e useCapture,
 * e renderiza a interface apropriada para cada estado.
 */
function AppContent(): React.ReactElement {
  const { isAuthenticated, isLoading: authLoading, user, error: authError, logout } = useAuth();
  const {
    isCapturing,
    captureProgress,
    cancelCapture,
    startCapture,
    errorDetails,
    isRetrying,
    retryCapture,
    clearErrorState,
  } = useCapture();

  const [activeSection, setActiveSection] = useState<SectionId>('capture');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVideoRecording, setIsVideoRecording] = useState(false);

  // =========================================================================
  // Verificação da flag lexato_open_diagnostic ao carregar
  // Atalho Ctrl+Shift+D seta esta flag antes de abrir o Side Panel
  // =========================================================================
  useEffect(() => {
    chrome.storage.local.get('lexato_open_diagnostic').then((result) => {
      if (result['lexato_open_diagnostic']) {
        setActiveSection('diagnostic');
        chrome.storage.local.remove('lexato_open_diagnostic');
      }
    });
  }, []);

  // =========================================================================
  // Verificação do modo vídeo ao carregar
  // O popup seta lexato_sidepanel_mode='video' antes de abrir o Side Panel
  // Quando detectado, inicia automaticamente a captura de vídeo
  // =========================================================================
  const videoAutoStartTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || authLoading) {
      return;
    }

    // Prevenir dupla execução — o useEffect pode disparar múltiplas vezes
    // quando isAuthenticated/authLoading mudam em sequência rápida
    if (videoAutoStartTriggeredRef.current) {
      return;
    }

    chrome.storage.session.get(['lexato_sidepanel_mode', 'lexato_video_tab_id']).then(async (result) => {
      const mode = result['lexato_sidepanel_mode'] as string | undefined;

      if (mode === 'video') {
        // Marcar como já disparado ANTES de qualquer operação assíncrona
        // para evitar race condition entre múltiplas execuções do useEffect
        if (videoAutoStartTriggeredRef.current) {
          return;
        }
        videoAutoStartTriggeredRef.current = true;

        // Limpar flags imediatamente para evitar re-trigger
        await chrome.storage.session.remove(['lexato_sidepanel_mode', 'lexato_video_tab_id']);

        // Iniciar captura de vídeo automaticamente
        // O streamId já foi salvo pelo popup via OPEN_SIDEPANEL_FOR_VIDEO
        try {
          await startCapture('video', 'standard');
        } catch (err) {
          console.error('[App] Erro ao auto-iniciar captura de vídeo:', err);
          // Permitir nova tentativa em caso de erro
          videoAutoStartTriggeredRef.current = false;
        }
      }
    });
  }, [isAuthenticated, authLoading, startCapture]);

  // =========================================================================
  // Detecção de gravação de vídeo via mensagens do Service Worker
  // O SidePanel.tsx gerencia o estado de gravação internamente,
  // mas precisamos saber quando estamos em modo de gravação para
  // alternar o ViewState
  // =========================================================================
  useEffect(() => {
    /**
     * Listener para mensagens de estado de gravação
     * Detecta quando uma gravação de vídeo está ativa
     */
    const handleRecordingMessage = (
      message: { type: string; payload?: { status?: RecordingStatus } },
    ): void => {
      if (message?.type === 'RECORDING_STATE_UPDATE' && message.payload) {
        const status = message.payload.status;
        // Gravação ativa: preparing, recording ou stopping
        const isActive = status === 'preparing' || status === 'recording' || status === 'stopping';
        setIsVideoRecording(isActive);
      }
    };

    chrome.runtime.onMessage.addListener(handleRecordingMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRecordingMessage);
    };
  }, []);

  // =========================================================================
  // Determinação do ViewState
  // =========================================================================
  const viewState: ViewState = (() => {
    if (authLoading) {
      return { mode: 'loading' as const };
    }
    if (!isAuthenticated) {
      return { mode: 'login' as const };
    }
    if (isVideoRecording) {
      return { mode: 'recording' as const };
    }
    return { mode: 'main' as const, activeSection };
  })();

  // =========================================================================
  // Renderização por ViewState
  // =========================================================================

  // Estado de carregamento
  if (viewState.mode === 'loading') {
    return <LoadingScreen />;
  }

  // Tela de login
  if (viewState.mode === 'login') {
    return <LoginScreen error={authError} />;
  }

  // Gravação de vídeo em andamento - delega para o SidePanel existente
  if (viewState.mode === 'recording') {
    return <SidePanel />;
  }

  // =========================================================================
  // Interface principal (autenticado, sem gravação de vídeo)
  // =========================================================================

  // Verifica se deve mostrar o modal imersivo de screenshot
  const showScreenshotModal = isCapturing && captureProgress && isScreenshotProgress(captureProgress);

  // Créditos do usuário
  const userCredits = user?.credits ?? 0;

  /**
   * Handler para seleção de item no menu lateral
   */
  const handleMenuItemSelect = (item: MenuItemId): void => {
    if (item === 'help') {
      window.open('https://lexato.com.br/ajuda', '_blank');
    } else if (item === 'settings') {
      chrome.runtime.openOptionsPage();
    } else {
      setActiveSection(item);
    }
  };

  /**
   * Renderiza o conteúdo da seção ativa
   */
  const renderSectionContent = (): React.ReactElement => {
    switch (activeSection) {
      case 'capture':
        return <CaptureWizard />;
      case 'history':
        return <RecentCaptures />;
      case 'diagnostic':
        return <DiagnosticPanel />;
      default:
        return <CaptureWizard />;
    }
  };

  return (
    <div className="sidepanel-root">
      {/* Menu Lateral Deslizante */}
      <SlideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeItem={activeSection}
        onItemSelect={handleMenuItemSelect}
        userName={user?.name ?? undefined}
        userEmail={user?.email ?? undefined}
        avatarUrl={user?.avatarUrl ?? undefined}
        onLogout={logout}
      />

      {/* Modal Imersivo de Progresso (Screenshot) */}
      {showScreenshotModal && (
        <CaptureProgressModal
          progress={captureProgress}
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

      {/* Header - Hamburger | Logo | Créditos */}
      <header className="extension-header-tabs" style={{ height: HEADER_HEIGHT }}>
        <Header
          credits={userCredits}
          usedThisMonth={user?.usedThisMonth}
          planName={user?.planName}
          onMenuClick={() => setIsMenuOpen(true)}
        />
      </header>

      {/* Conteúdo com ScrollIndicator */}
      <div className="extension-content-no-tabs">
        <ScrollIndicator
          gradientColor="#0F0E10"
          gradientHeight={32}
          transitionDuration={200}
        >
          {/* Indicador de progresso para vídeo (inline, não modal) */}
          {isCapturing && captureProgress && !isScreenshotProgress(captureProgress) && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <ProgressIndicator progress={captureProgress} />
            </div>
          )}

          {/* Conteúdo da seção ativa com transição */}
          <PageTransition pageKey={activeSection} duration={300}>
            {renderSectionContent()}
          </PageTransition>
        </ScrollIndicator>
      </div>
    </div>
  );
}

// =============================================================================
// Componente raiz exportado
// =============================================================================

/**
 * Componente raiz do Side Panel - envolve com I18nProvider
 *
 * O I18nProvider fornece contexto de internacionalização para
 * todos os componentes filhos, suportando pt-BR, en e es.
 */
export default function App(): React.ReactElement {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
