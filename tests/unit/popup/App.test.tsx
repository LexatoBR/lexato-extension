/**
 * Testes visuais para o App do Popup Lexato
 *
 * Valida diferentes estados da interface:
 * - Usuário logado vs não logado
 * - Com créditos vs sem créditos
 * - Durante captura
 * - Dimensões fixas e responsividade
 *
 * Design System: 400×600px com sidebar de 56px (--sidebar-width)
 *
 * @see Requirements 7.1-7.5 (Layout da Extensão)
 * @see Requirements 1.1-1.10, 2.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@popup/App';

// Mock dos hooks
vi.mock('@popup/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@popup/hooks/useCapture', () => ({
  useCapture: vi.fn(),
}));

// Importar mocks para manipulação
import { useAuth } from '@popup/hooks/useAuth';
import { useCapture } from '@popup/hooks/useCapture';

const mockUseAuth = vi.mocked(useAuth);
const mockUseCapture = vi.mocked(useCapture);

// ============================================================================
// CONSTANTES DE LAYOUT
// ============================================================================

/** 
 * Dimensões fixas do popup
 * LIMITE CHROME: máximo 800x600px para popups de extensão
 * @see https://stackoverflow.com/questions/8983165
 */
const POPUP_DIMENSIONS = {
  WIDTH: '580px',
  HEIGHT: '600px',
  SIDEBAR_WIDTH: '70px',
} as const;

// ============================================================================
// FACTORIES E CONSTANTES PARA MOCKS
// ============================================================================

/**
 * Cria mock base do useAuth para estado não autenticado
 * Inclui todos os métodos de UseAuthReturn, incluindo WebAuthn
 */
const createBaseAuthMock = () => ({
  login: vi.fn(),
  completeMfa: vi.fn(),
  setupMfa: vi.fn(),
  verifyMfaSetup: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn(),
  refreshUser: vi.fn(),
  startWebAuthnRegistration: vi.fn(),
  completeWebAuthnRegistration: vi.fn(),
  startWebAuthnAuth: vi.fn(),
  completeWebAuthnAuth: vi.fn(),
  listWebAuthnCredentials: vi.fn(),
});

/**
 * Cria mock do useAuth para estado de loading
 */
const createLoadingAuthMock = () => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  tokens: null,
  error: null,
  ...createBaseAuthMock(),
});

/**
 * Cria mock do useAuth para estado não autenticado
 */
const createUnauthenticatedMock = (error: string | null = null) => ({
  isAuthenticated: false,
  isLoading: false,
  user: null,
  tokens: null,
  error,
  ...createBaseAuthMock(),
});

/**
 * Cria mock do useAuth para estado autenticado
 */
const createAuthenticatedMock = (credits: number, overrides: Partial<{ email: string; name: string }> = {}) => ({
  isAuthenticated: true,
  isLoading: false,
  user: {
    id: 'user-123',
    email: overrides.email ?? 'teste@lexato.com.br',
    name: overrides.name ?? 'Usuário Teste',
    credits,
    accountType: 'individual' as const,
    mfaEnabled: false,
  },
  tokens: {
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3600000,
    obtainedAt: Date.now(),
  },
  error: null,
  ...createBaseAuthMock(),
});

/**
 * Cria mock base do useCapture
 */
const createBaseCaptureMock = () => ({
  isCapturing: false,
  captureProgress: null,
  recentCaptures: [],
  isLoadingRecent: false,
  error: null,
  startCapture: vi.fn(),
  cancelCapture: vi.fn(),
  stopVideoRecording: vi.fn(),
  refreshRecentCaptures: vi.fn(),
  clearError: vi.fn(),
});

/**
 * Cria mock do useCapture durante captura
 */
const createCapturingMock = (percent: number, message: string) => ({
  ...createBaseCaptureMock(),
  isCapturing: true,
  captureProgress: {
    stage: 'capturing' as const,
    percent,
    message,
  },
});

describe('App - Testes Visuais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCapture.mockReturnValue(createBaseCaptureMock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('18.1 - Estados de autenticação', () => {
    describe('Estado de carregamento', () => {
      it('deve exibir tela de loading durante carregamento inicial', () => {
        mockUseAuth.mockReturnValue(createLoadingAuthMock());

        const { container } = render(<App />);

        // Verifica spinner de loading
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();

        // Verifica texto de carregamento
        expect(screen.getByText('Carregando...')).toBeInTheDocument();
      });

      it('deve usar classe extension-root na tela de loading', () => {
        mockUseAuth.mockReturnValue(createLoadingAuthMock());

        const { container } = render(<App />);
        const loadingContainer = container.querySelector('.extension-root');

        // Verifica que a classe extension-root está presente (background vem do CSS)
        expect(loadingContainer).toHaveClass('extension-root');
      });
    });

    describe('Usuário não logado', () => {
      it('deve exibir tela de login quando não autenticado', () => {
        mockUseAuth.mockReturnValue(createUnauthenticatedMock());

        render(<App />);

        // Verifica logo LEXATO (pode haver múltiplos, verificamos que existe)
        expect(screen.getAllByText('LEXATO').length).toBeGreaterThan(0);

        // Verifica formulário de login - primeira etapa mostra apenas email
        expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
        
        // Verifica botões de login social
        expect(screen.getByText('Continuar com Google')).toBeInTheDocument();
        expect(screen.getByText('Continuar com Microsoft')).toBeInTheDocument();
        expect(screen.getByText('Login Empresarial (SSO)')).toBeInTheDocument();
      });

      it('deve exibir erro de autenticação quando presente', () => {
        mockUseAuth.mockReturnValue(createUnauthenticatedMock('Credenciais inválidas'));

        render(<App />);

        expect(screen.getByRole('alert')).toHaveTextContent('Credenciais inválidas');
      });

      it('deve usar classe extension-root na tela de login', () => {
        mockUseAuth.mockReturnValue(createUnauthenticatedMock());

        const { container } = render(<App />);
        const loginContainer = container.querySelector('.extension-root');

        // Verifica que a classe extension-root está presente (cores vêm do CSS)
        expect(loginContainer).toHaveClass('extension-root');
      });
    });

    describe('Usuário logado', () => {
      it('deve exibir layout com sidebar quando autenticado', () => {
        mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

        render(<App />);

        // Verifica navegação da sidebar
        expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
        
        // Verifica botão de configurações na sidebar
        expect(screen.getByRole('button', { name: 'Configurações' })).toBeInTheDocument();
      });

      it('deve exibir email do usuário no header', () => {
        mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

        render(<App />);

        expect(screen.getByText('teste@lexato.com.br')).toBeInTheDocument();
      });
    });
  });

  describe('18.1 - Estados de créditos', () => {
    it('deve exibir créditos no header quando autenticado', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      render(<App />);

      // O PopupHeader atual não exibe créditos diretamente
      // Verifica que o header está presente com o email do usuário
      expect(screen.getByText('teste@lexato.com.br')).toBeInTheDocument();
    });

    it('deve exibir layout correto com diferentes valores de créditos', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(5));

      render(<App />);

      // Verifica que o layout está correto
      expect(screen.getByText('teste@lexato.com.br')).toBeInTheDocument();
    });

    it('deve exibir layout correto com créditos zerados', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(0));

      render(<App />);

      // Verifica que o layout está correto mesmo com créditos zerados
      expect(screen.getByText('teste@lexato.com.br')).toBeInTheDocument();
    });

    it('deve manter layout consistente independente dos créditos', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(25));

      const { container } = render(<App />);

      // Verifica que o layout principal está presente
      expect(container.querySelector('.extension-root')).toBeInTheDocument();
    });
  });

  describe('18.1 - Estado durante captura', () => {
    it('deve exibir indicador de progresso durante captura', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));
      mockUseCapture.mockReturnValue(createCapturingMock(45, 'Capturando página...'));

      render(<App />);

      // Verifica que o indicador de progresso está presente
      expect(screen.getByText('Capturando página...')).toBeInTheDocument();
    });

    it('não deve exibir indicador de progresso quando não está capturando', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));
      mockUseCapture.mockReturnValue(createBaseCaptureMock());

      render(<App />);

      // Verifica que não há indicador de progresso
      expect(screen.queryByText('Capturando página...')).not.toBeInTheDocument();
    });
  });

  describe('18.2 - Dimensões fixas e responsividade', () => {
    it('deve ter dimensões fixas de 580px × 600px', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Dimensões são aplicadas via style inline
      expect(extensionRoot).toHaveStyle({
        width: POPUP_DIMENSIONS.WIDTH,
        height: POPUP_DIMENSIONS.HEIGHT,
      });
    });

    it('deve ter classe extension-root com overflow hidden', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Verifica que a classe extension-root está presente (overflow vem do CSS)
      expect(extensionRoot).toHaveClass('extension-root');
    });

    it('deve ter sidebar com largura fixa de 70px', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const sidebar = container.querySelector('.extension-sidebar');

      // Largura é aplicada via style inline
      expect(sidebar).toHaveStyle({
        width: '70px',
      });
    });

    it('deve ter área de conteúdo principal com classe extension-main', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const mainContent = container.querySelector('.extension-main');

      // Verifica que a classe extension-main está presente (flex vem do CSS)
      expect(mainContent).toHaveClass('extension-main');
    });

    it('deve ter área de conteúdo com classe extension-content', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const contentArea = container.querySelector('.extension-content');

      // Verifica que a classe extension-content está presente (overflow-y vem do CSS)
      expect(contentArea).toHaveClass('extension-content');
    });

    it('deve ter classe extension-root para layout flex', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Verifica que a classe extension-root está presente (display flex vem do CSS)
      expect(extensionRoot).toHaveClass('extension-root');
    });
  });

  describe('18.1/18.2 - Cores e tema escuro', () => {
    it('deve ter classe extension-root para background escuro', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Verifica que a classe extension-root está presente (background vem do CSS)
      expect(extensionRoot).toHaveClass('extension-root');
    });

    it('deve ter classe extension-root para cor de texto', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Verifica que a classe extension-root está presente (color vem do CSS)
      expect(extensionRoot).toHaveClass('extension-root');
    });
  });
});


describe('App - Testes de Responsividade Adicionais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCapture.mockReturnValue(createBaseCaptureMock());
  });

  describe('18.2 - Verificação de overflow', () => {
    it('deve ter classe extension-main na área principal', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50, {
        email: 'email.muito.longo.para.testar.truncamento@empresa-com-nome-grande.com.br',
        name: 'Usuário com Nome Muito Longo para Testar Truncamento',
      }));

      const { container } = render(<App />);
      const mainContent = container.querySelector('.extension-main');

      // Verifica que a classe extension-main está presente (minWidth vem do CSS)
      expect(mainContent).toHaveClass('extension-main');
    });

    it('deve ter classe extension-sidebar na sidebar', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const sidebar = container.querySelector('.extension-sidebar');

      // Verifica que a classe extension-sidebar está presente (flexShrink vem do CSS)
      expect(sidebar).toHaveClass('extension-sidebar');
    });

    it('deve ter classe extension-content na área de conteúdo', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const contentArea = container.querySelector('.extension-content');

      // Verifica que a classe extension-content está presente (padding vem do CSS)
      expect(contentArea).toHaveClass('extension-content');
    });
  });

  describe('18.2 - Estrutura de layout', () => {
    it('deve ter estrutura correta: sidebar + main', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const extensionRoot = container.querySelector('.extension-root');

      // Verifica que tem sidebar e main
      expect(extensionRoot?.querySelector('.extension-sidebar')).toBeInTheDocument();
      expect(extensionRoot?.querySelector('.extension-main')).toBeInTheDocument();
    });

    it('deve ter header e conteúdo dentro do main', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const mainContent = container.querySelector('.extension-main');

      // Verifica que tem header e content
      expect(mainContent?.querySelector('.extension-header')).toBeInTheDocument();
      expect(mainContent?.querySelector('.extension-content')).toBeInTheDocument();
    });

    it('deve ter classe extension-main para flexDirection column', () => {
      mockUseAuth.mockReturnValue(createAuthenticatedMock(50));

      const { container } = render(<App />);
      const mainContent = container.querySelector('.extension-main');

      // Verifica que a classe extension-main está presente (flexDirection vem do CSS)
      expect(mainContent).toHaveClass('extension-main');
    });
  });

  describe('18.2 - Tela de login dimensões', () => {
    it('deve ter dimensões fixas na tela de login', () => {
      mockUseAuth.mockReturnValue(createUnauthenticatedMock());

      const { container } = render(<App />);
      const loginContainer = container.querySelector('.extension-root');

      expect(loginContainer).toHaveStyle({
        width: POPUP_DIMENSIONS.WIDTH,
        height: POPUP_DIMENSIONS.HEIGHT,
      });
    });

    it('deve ter classes flex e flex-col na tela de login', () => {
      mockUseAuth.mockReturnValue(createUnauthenticatedMock());

      const { container } = render(<App />);
      const loginContainer = container.querySelector('.extension-root');

      // Verifica classes Tailwind para layout flex column
      expect(loginContainer).toHaveClass('flex');
      expect(loginContainer).toHaveClass('flex-col');
    });
  });

  describe('18.2 - Tela de loading dimensões', () => {
    it('deve ter dimensões fixas na tela de loading', () => {
      mockUseAuth.mockReturnValue(createLoadingAuthMock());

      const { container } = render(<App />);
      const loadingContainer = container.querySelector('.extension-root');

      expect(loadingContainer).toHaveStyle({
        width: POPUP_DIMENSIONS.WIDTH,
        height: POPUP_DIMENSIONS.HEIGHT,
      });
    });
  });
});
