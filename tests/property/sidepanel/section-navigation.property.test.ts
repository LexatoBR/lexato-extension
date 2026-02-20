/**
 * Teste de propriedade: Navegacao entre secoes renderiza componente correto
 *
 * Property 1: Para qualquer SectionId valido ('capture', 'history', 'diagnostic'),
 * quando o usuario navega para essa secao, o Side Panel deve renderizar exatamente
 * o componente correspondente: CaptureWizard para 'capture', RecentCaptures para
 * 'history', DiagnosticPanel para 'diagnostic'.
 *
 * **Validates: Requirements 2.3**
 *
 * Feature: sidepanel-migration, Property 1: Navegacao entre secoes renderiza o componente correto
 *
 * @module section-navigation.property.test
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
      'data-on-item-select': 'true',
      // Expor a funcao para testes via atributo customizado
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
// Mapeamento SectionId -> data-testid esperado
// =============================================================================

type SectionId = 'capture' | 'history' | 'diagnostic';

const SECTION_TO_TESTID: Record<SectionId, string> = {
  capture: 'capture-wizard',
  history: 'recent-captures',
  diagnostic: 'diagnostic-panel',
};

const SECTION_TO_COMPONENT_NAME: Record<SectionId, string> = {
  capture: 'CaptureWizard',
  history: 'RecentCaptures',
  diagnostic: 'DiagnosticPanel',
};

// =============================================================================
// Testes de propriedade
// =============================================================================

describe('Property 1: Navegacao entre secoes renderiza o componente correto', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Resetar estado dos mocks para usuario autenticado
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
   * **Validates: Requirements 2.3**
   *
   * Para qualquer SectionId valido, o componente correspondente deve ser renderizado.
   * Usa fast-check para gerar SectionId aleatorio e verificar a renderizacao.
   */
  it('deve renderizar o componente correto para qualquer SectionId valido (100 iteracoes)', () => {
    const sectionArbitrary = fc.constantFrom<SectionId>('capture', 'history', 'diagnostic');

    fc.assert(
      fc.property(sectionArbitrary, (sectionId: SectionId) => {
        // Limpar DOM entre iteracoes
        document.body.innerHTML = '';

        // Renderizar o App - por padrao inicia na secao 'capture'
        const { unmount } = render(React.createElement(App));

        // Obter referencia ao SlideMenu para simular navegacao
        const slideMenu = screen.getByTestId('slide-menu');
        const onItemSelect = (slideMenu as unknown as Record<string, unknown>)['__onItemSelect'] as (item: string) => void;

        // Navegar para a secao gerada pelo fast-check
        act(() => {
          onItemSelect(sectionId);
        });

        // Verificar que o componente correto esta renderizado
        const expectedTestId = SECTION_TO_TESTID[sectionId];
        const expectedName = SECTION_TO_COMPONENT_NAME[sectionId];
        const element = screen.queryByTestId(expectedTestId);

        expect(element).not.toBeNull();
        expect(element?.textContent).toBe(expectedName);

        // Verificar que os outros componentes NAO estao renderizados
        const otherSections = (['capture', 'history', 'diagnostic'] as SectionId[]).filter(s => s !== sectionId);
        for (const otherSection of otherSections) {
          const otherTestId = SECTION_TO_TESTID[otherSection];
          expect(screen.queryByTestId(otherTestId)).toBeNull();
        }

        // Limpar para proxima iteracao
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * Propriedade complementar: a secao padrao ao carregar deve ser 'capture'.
   * Verifica que o CaptureWizard e renderizado sem navegacao explicita.
   */
  it('deve renderizar CaptureWizard como secao padrao ao carregar', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        document.body.innerHTML = '';

        const { unmount } = render(React.createElement(App));

        // Sem navegacao, a secao padrao deve ser 'capture'
        expect(screen.queryByTestId('capture-wizard')).not.toBeNull();
        expect(screen.queryByTestId('recent-captures')).toBeNull();
        expect(screen.queryByTestId('diagnostic-panel')).toBeNull();

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
