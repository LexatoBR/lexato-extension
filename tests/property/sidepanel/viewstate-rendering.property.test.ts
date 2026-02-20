/**
 * Teste de propriedade: ViewState determina a view renderizada corretamente
 *
 * Property 2: Para qualquer ViewState valido, o Side Panel deve renderizar
 * a view correspondente:
 * - { mode: 'loading' } renderiza a tela de carregamento (spinner + "Carregando...")
 * - { mode: 'login' } renderiza o LoginForm
 * - { mode: 'main', activeSection } renderiza a interface principal com a secao ativa
 * - { mode: 'recording' } renderiza o VideoRecordingPanel (SidePanel)
 *
 * Nenhum ViewState valido deve resultar em tela em branco ou componente incorreto.
 *
 * **Validates: Requirements 2.5, 2.6, 2.7, 4.2, 4.3**
 *
 * Feature: sidepanel-migration, Property 2: ViewState determina a view renderizada corretamente
 *
 * @module viewstate-rendering.property.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import React from 'react';
import { render, screen, act } from '@testing-library/react';

// =============================================================================
// Mocks dos componentes filhos
// Cada componente renderiza um data-testid unico para identificacao
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
  default: () => React.createElement('div', { 'data-testid': 'capture-progress-modal' }),
}));

vi.mock('../../../src/sidepanel/components/capture/CaptureErrorModal', () => ({
  CaptureErrorModal: () => React.createElement('div', { 'data-testid': 'capture-error-modal' }),
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

// Mock do I18nProvider - renderiza filhos diretamente
vi.mock('../../../src/lib/i18n', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
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
// Variaveis de controle dos mocks de hooks
// =============================================================================

/** Estado mock do useAuth - configuravel por teste */
let mockAuthState = {
  isAuthenticated: true,
  isLoading: false,
  user: { name: 'Teste', email: 'teste@lexato.com', credits: 10, usedThisMonth: 2, planName: 'Pro', avatarUrl: null },
  error: null as string | null,
  logout: vi.fn(),
};

/** Estado mock do useCapture */
let mockCaptureState = {
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
  error: null as string | null,
};

vi.mock('../../../src/sidepanel/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../../../src/sidepanel/hooks/useCapture', () => ({
  useCapture: () => mockCaptureState,
}));

// =============================================================================
// Import do componente sob teste (apos todos os mocks)
// =============================================================================

import App from '../../../src/sidepanel/App';

// =============================================================================
// Tipos e constantes
// =============================================================================

type SectionId = 'capture' | 'history' | 'diagnostic';

type ViewState =
  | { mode: 'loading' }
  | { mode: 'login' }
  | { mode: 'main'; activeSection: SectionId }
  | { mode: 'recording' };

/** Mapeamento de secao para data-testid esperado */
const SECTION_TO_TESTID: Record<SectionId, string> = {
  capture: 'capture-wizard',
  history: 'recent-captures',
  diagnostic: 'diagnostic-panel',
};

// =============================================================================
// Arbitrarios fast-check
// =============================================================================

/** Gerador de SectionId aleatorio */
const sectionIdArbitrary = fc.constantFrom<SectionId>('capture', 'history', 'diagnostic');

/** Gerador de ViewState aleatorio valido */
const viewStateArbitrary: fc.Arbitrary<ViewState> = fc.oneof(
  fc.constant<ViewState>({ mode: 'loading' }),
  fc.constant<ViewState>({ mode: 'login' }),
  sectionIdArbitrary.map<ViewState>((section) => ({ mode: 'main', activeSection: section })),
  fc.constant<ViewState>({ mode: 'recording' }),
);

// =============================================================================
// Funcoes auxiliares
// =============================================================================

/**
 * Captura o listener registrado em chrome.runtime.onMessage.addListener
 * para simular mensagens de gravacao de video
 */
function getCapturedMessageListener(): ((message: unknown) => void) | null {
  const addListenerMock = vi.mocked(chrome.runtime.onMessage.addListener);
  const calls = addListenerMock.mock.calls;
  if (calls.length > 0) {
    // Retorna o ultimo listener registrado
    return calls[calls.length - 1]![0] as (message: unknown) => void;
  }
  return null;
}

/**
 * Configura os mocks de acordo com o ViewState desejado
 */
function configureMocksForViewState(viewState: ViewState): void {
  switch (viewState.mode) {
    case 'loading':
      mockAuthState.isLoading = true;
      mockAuthState.isAuthenticated = false;
      break;
    case 'login':
      mockAuthState.isLoading = false;
      mockAuthState.isAuthenticated = false;
      break;
    case 'main':
      mockAuthState.isLoading = false;
      mockAuthState.isAuthenticated = true;
      break;
    case 'recording':
      mockAuthState.isLoading = false;
      mockAuthState.isAuthenticated = true;
      break;
  }
}

/**
 * Verifica que a view correta esta renderizada para o ViewState dado
 */
function assertCorrectViewRendered(viewState: ViewState): void {
  switch (viewState.mode) {
    case 'loading': {
      // Deve exibir spinner e texto "Carregando..."
      expect(screen.getByText('Carregando...')).toBeTruthy();
      // Nao deve exibir login, header ou video recording
      expect(screen.queryByTestId('login-form')).toBeNull();
      expect(screen.queryByTestId('header')).toBeNull();
      expect(screen.queryByTestId('video-recording')).toBeNull();
      break;
    }
    case 'login': {
      // Deve exibir LoginForm
      expect(screen.getByTestId('login-form')).toBeTruthy();
      // Nao deve exibir header ou video recording
      expect(screen.queryByTestId('header')).toBeNull();
      expect(screen.queryByTestId('video-recording')).toBeNull();
      break;
    }
    case 'main': {
      // Deve exibir Header e a secao ativa
      expect(screen.getByTestId('header')).toBeTruthy();
      const expectedTestId = SECTION_TO_TESTID[viewState.activeSection];
      expect(screen.getByTestId(expectedTestId)).toBeTruthy();
      // Nao deve exibir login ou video recording
      expect(screen.queryByTestId('login-form')).toBeNull();
      expect(screen.queryByTestId('video-recording')).toBeNull();
      break;
    }
    case 'recording': {
      // Deve exibir VideoRecordingPanel (SidePanel)
      expect(screen.getByTestId('video-recording')).toBeTruthy();
      // Nao deve exibir login ou header da interface principal
      expect(screen.queryByTestId('login-form')).toBeNull();
      expect(screen.queryByTestId('header')).toBeNull();
      break;
    }
  }
}

// =============================================================================
// Testes de propriedade
// =============================================================================

describe('Property 2: ViewState determina a view renderizada corretamente', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Resetar estado dos mocks para valores padrao
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

    // Mock do chrome.storage.local.get para nao abrir diagnostico automaticamente
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
  });

  /**
   * **Validates: Requirements 2.5, 2.6, 2.7, 4.2, 4.3**
   *
   * Para qualquer ViewState valido gerado aleatoriamente, o App deve
   * renderizar a view correspondente sem erros.
   */
  it('deve renderizar a view correta para qualquer ViewState valido (100 iteracoes)', () => {
    fc.assert(
      fc.property(viewStateArbitrary, (viewState: ViewState) => {
        // Limpar DOM e mocks entre iteracoes
        document.body.innerHTML = '';
        vi.clearAllMocks();
        vi.mocked(chrome.storage.local.get).mockResolvedValue({});

        // Configurar mocks de acordo com o ViewState
        configureMocksForViewState(viewState);

        // Renderizar o App
        const { unmount } = render(React.createElement(App));

        // Para o modo 'recording', precisamos simular a mensagem RECORDING_STATE_UPDATE
        // O App registra um listener em chrome.runtime.onMessage no useEffect
        if (viewState.mode === 'recording') {
          const listener = getCapturedMessageListener();
          expect(listener).not.toBeNull();

          // Simular mensagem de gravacao ativa
          act(() => {
            listener!({
              type: 'RECORDING_STATE_UPDATE',
              payload: { status: 'recording' },
            });
          });
        }

        // Para o modo 'main' com secao diferente de 'capture', navegar via SlideMenu
        if (viewState.mode === 'main' && viewState.activeSection !== 'capture') {
          const slideMenu = screen.getByTestId('slide-menu');
          const onItemSelect = (slideMenu as unknown as Record<string, unknown>)['__onItemSelect'] as (item: string) => void;

          act(() => {
            onItemSelect(viewState.activeSection);
          });
        }

        // Verificar que a view correta esta renderizada
        assertCorrectViewRendered(viewState);

        // Limpar para proxima iteracao
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
