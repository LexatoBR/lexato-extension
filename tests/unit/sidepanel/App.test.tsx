/**
 * Testes unitários para o App.tsx unificado do Side Panel
 *
 * Valida cenários específicos de renderização condicional:
 * - LoginForm quando não autenticado (Req 4.2)
 * - Interface principal quando autenticado (Req 4.3)
 * - VideoRecordingPanel durante gravação de vídeo (Req 2.5, 5.1)
 * - CaptureProgressModal durante screenshot (Req 2.6)
 * - CaptureErrorModal quando há erro (Req 2.7)
 * - Flag lexato_open_diagnostic abre seção de diagnóstico (Req 7.6)
 * - I18nProvider envolve o componente raiz (Req 7.2)
 *
 * @module App.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';

// =============================================================================
// Mocks dos componentes filhos
// =============================================================================

vi.mock('../../../src/sidepanel/components/capture/CaptureWizard/CaptureWizard', () => ({
  CaptureWizard: () => React.createElement('div', { 'data-testid': 'capture-wizard' }, 'CaptureWizard'),
  default: () => React.createElement('div', { 'data-testid': 'capture-wizard' }, 'CaptureWizard'),
}));

vi.mock('../../../src/sidepanel/components/history/RecentCaptures', () => ({
  default: () => React.createElement('div', { 'data-testid': 'recent-captures' }, 'RecentCaptures'),
}));

vi.mock('../../../src/sidepanel/components/diagnostic/DiagnosticPanel', () => ({
  DiagnosticPanel: () => React.createElement('div', { 'data-testid': 'diagnostic-panel' }, 'DiagnosticPanel'),
  default: () => React.createElement('div', { 'data-testid': 'diagnostic-panel' }, 'DiagnosticPanel'),
}));

vi.mock('../../../src/sidepanel/components/auth/LoginForm', () => ({
  default: () => React.createElement('div', { 'data-testid': 'login-form' }, 'LoginForm'),
}));

vi.mock('../../../src/sidepanel/SidePanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'video-recording' }, 'VideoRecording'),
}));

vi.mock('../../../src/sidepanel/components/layout/Header', () => ({
  Header: ({ onMenuClick }: { onMenuClick: () => void }) =>
    React.createElement('div', { 'data-testid': 'header', onClick: onMenuClick }, 'Header'),
}));

vi.mock('../../../src/sidepanel/components/layout/SlideMenu/SlideMenu', () => ({
  SlideMenu: ({ onItemSelect }: { onItemSelect: (item: string) => void }) =>
    React.createElement('div', {
      'data-testid': 'slide-menu',
      ref: (el: HTMLDivElement | null) => {
        if (el) {
          (el as unknown as Record<string, unknown>)['__onItemSelect'] = onItemSelect;
        }
      },
    }, 'SlideMenu'),
}));

vi.mock('../../../src/sidepanel/components/capture/CaptureProgressModal', () => ({
  default: () => React.createElement('div', { 'data-testid': 'capture-progress-modal' }, 'CaptureProgressModal'),
}));

vi.mock('../../../src/sidepanel/components/capture/CaptureErrorModal', () => ({
  CaptureErrorModal: () => React.createElement('div', { 'data-testid': 'capture-error-modal' }, 'CaptureErrorModal'),
}));

vi.mock('../../../src/sidepanel/components/capture/ProgressIndicator', () => ({
  default: () => React.createElement('div', { 'data-testid': 'progress-indicator' }),
}));

vi.mock('../../../src/components/shared/ScrollIndicator', () => ({
  ScrollIndicator: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'scroll-indicator' }, children),
}));

vi.mock('../../../src/components/shared/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'page-transition' }, children),
}));

// =============================================================================
// Mock do I18nProvider - rastreia se foi usado como wrapper
// =============================================================================

let i18nProviderRendered = false;

vi.mock('../../../src/lib/i18n', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => {
    i18nProviderRendered = true;
    return React.createElement('div', { 'data-testid': 'i18n-provider' }, children);
  },
  useI18n: () => ({
    t: {
      common: { loading: 'Carregando...' },
      header: { credits: 'creditos' },
    },
    locale: 'pt-BR',
    setLocale: vi.fn(),
  }),
}));

// Mock do CSS importado
vi.mock('../../../src/assets/styles/layout.css', () => ({}));

// =============================================================================
// Variáveis de controle dos mocks de hooks
// =============================================================================

let mockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  user: { name: 'Teste', email: 'teste@lexato.com', credits: 10, usedThisMonth: 2, planName: 'Pro', avatarUrl: null },
  error: null as string | null,
  logout: vi.fn(),
};

let mockCaptureState = {
  isCapturing: false,
  captureProgress: null as unknown,
  cancelCapture: vi.fn(),
  errorDetails: null as unknown,
  isRetrying: false,
  retryCapture: vi.fn(),
  clearErrorState: vi.fn(),
  startCapture: vi.fn(),
  recentCaptures: [],
  isLoadingRecent: false,
  refreshRecentCaptures: vi.fn(),
  error: null as string | null,
};

vi.mock('../../../src/sidepanel/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../../../src/sidepanel/hooks/useCapture', () => ({
  useCapture: () => mockCaptureState,
}));

// =============================================================================
// Import do componente sob teste (após todos os mocks)
// =============================================================================

import App from '../../../src/sidepanel/App';

// =============================================================================
// Função auxiliar para capturar o listener de mensagens do chrome.runtime
// =============================================================================

function getCapturedMessageListener(): ((message: unknown) => void) | null {
  const addListenerMock = vi.mocked(chrome.runtime.onMessage.addListener);
  const calls = addListenerMock.mock.calls;
  if (calls.length > 0) {
    return calls[calls.length - 1]![0] as (message: unknown) => void;
  }
  return null;
}

// =============================================================================
// Testes unitários
// =============================================================================

describe('App.tsx - Testes unitários do Side Panel unificado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18nProviderRendered = false;

    // Estado padrão: autenticado, sem captura
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      user: { name: 'Teste', email: 'teste@lexato.com', credits: 10, usedThisMonth: 2, planName: 'Pro', avatarUrl: null },
      error: null,
      logout: vi.fn(),
    };

    mockCaptureState = {
      isCapturing: false,
      captureProgress: null,
      cancelCapture: vi.fn(),
      errorDetails: null,
      isRetrying: false,
      retryCapture: vi.fn(),
      clearErrorState: vi.fn(),
      startCapture: vi.fn(),
      recentCaptures: [],
      isLoadingRecent: false,
      refreshRecentCaptures: vi.fn(),
      error: null,
    };

    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
  });

  /**
   * Req 4.2: LoginForm exibido quando não autenticado
   */
  it('deve exibir LoginForm quando o usuário não está autenticado', () => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;

    render(React.createElement(App));

    expect(screen.getByTestId('login-form')).toBeTruthy();
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('video-recording')).toBeNull();
  });

  /**
   * Req 4.3: Interface principal exibida quando autenticado
   */
  it('deve exibir interface principal com Header quando autenticado', () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;

    render(React.createElement(App));

    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByTestId('capture-wizard')).toBeTruthy();
    expect(screen.queryByTestId('login-form')).toBeNull();
  });

  /**
   * Req 2.5, 5.1: VideoRecordingPanel exibido durante gravação de vídeo
   */
  it('deve exibir VideoRecordingPanel durante gravação de vídeo', () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;

    render(React.createElement(App));

    // Capturar o listener registrado em chrome.runtime.onMessage
    const listener = getCapturedMessageListener();
    expect(listener).not.toBeNull();

    // Simular mensagem de gravação ativa
    act(() => {
      listener!({
        type: 'RECORDING_STATE_UPDATE',
        payload: { status: 'recording' },
      });
    });

    expect(screen.getByTestId('video-recording')).toBeTruthy();
    expect(screen.queryByTestId('header')).toBeNull();
    expect(screen.queryByTestId('login-form')).toBeNull();
  });

  /**
   * Req 2.6: CaptureProgressModal exibido durante screenshot
   */
  it('deve exibir CaptureProgressModal durante captura de screenshot', () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;

    // Progresso de screenshot: tem 'stage' mas NÃO tem 'state' nem 'elapsedMs'
    mockCaptureState.isCapturing = true;
    mockCaptureState.captureProgress = {
      stage: 'capturing',
      percent: 50,
      message: 'Capturando...',
      currentViewport: 1,
      totalViewports: 3,
    };

    render(React.createElement(App));

    expect(screen.getByTestId('capture-progress-modal')).toBeTruthy();
    // Interface principal ainda deve estar visível por trás do modal
    expect(screen.getByTestId('header')).toBeTruthy();
  });

  /**
   * Req 2.7: CaptureErrorModal exibido quando há erro
   */
  it('deve exibir CaptureErrorModal quando há erro de captura', () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;

    mockCaptureState.errorDetails = {
      code: 'TEST_ERROR',
      message: 'Erro de teste',
      isRecoverable: true,
    };

    render(React.createElement(App));

    expect(screen.getByTestId('capture-error-modal')).toBeTruthy();
    // Interface principal ainda deve estar visível por trás do modal
    expect(screen.getByTestId('header')).toBeTruthy();
  });

  /**
   * Req 7.6: Flag lexato_open_diagnostic abre seção de diagnóstico
   */
  it('deve abrir seção de diagnóstico quando flag lexato_open_diagnostic está ativa', async () => {
    mockAuthState.isAuthenticated = true;
    mockAuthState.isLoading = false;

    // Mock: chrome.storage.local.get retorna a flag ativa
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      lexato_open_diagnostic: true,
    });

    await act(async () => {
      render(React.createElement(App));
    });

    // DiagnosticPanel deve estar renderizado em vez do CaptureWizard
    expect(screen.getByTestId('diagnostic-panel')).toBeTruthy();
    expect(screen.queryByTestId('capture-wizard')).toBeNull();

    // A flag deve ter sido removida após leitura
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('lexato_open_diagnostic');
  });

  /**
   * Req 7.2: I18nProvider envolve o componente raiz
   */
  it('deve envolver o componente raiz com I18nProvider', () => {
    render(React.createElement(App));

    // Verifica que o I18nProvider foi renderizado como wrapper
    expect(i18nProviderRendered).toBe(true);
    expect(screen.getByTestId('i18n-provider')).toBeTruthy();
  });
});
