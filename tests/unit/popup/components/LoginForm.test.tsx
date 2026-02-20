/**
 * Testes unitários para LoginForm
 *
 * Testa formulário de login com fluxo em duas etapas:
 * 1. Etapa 'email': Campo de email + botões de login social
 * 2. Etapa 'password': Campo de senha + Cloudflare Turnstile
 * 3. Etapa 'mfa': Código TOTP (quando configurado)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginForm from '@popup/components/LoginForm';
import * as useAuthModule from '@popup/hooks/useAuth';

// Mock do hook useAuth
vi.mock('@popup/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock do Cloudflare Turnstile
const mockTurnstileRender = vi.fn().mockReturnValue('widget-id-123');
const mockTurnstileReset = vi.fn();
const mockTurnstileRemove = vi.fn();

beforeEach(() => {
  // Setup Turnstile mock
  window.turnstile = {
    render: mockTurnstileRender,
    reset: mockTurnstileReset,
    remove: mockTurnstileRemove,
    getResponse: vi.fn(),
    isExpired: vi.fn(),
    execute: vi.fn(),
  };
});

afterEach(() => {
  delete window.turnstile;
});

describe('LoginForm', () => {
  const mockUseAuth = vi.mocked(useAuthModule.useAuth);
  const mockLogin = vi.fn();
  const mockCompleteMfa = vi.fn();
  const mockClearError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      tokens: null,
      error: null,
      login: mockLogin,
      completeMfa: mockCompleteMfa,
      setupMfa: vi.fn(),
      verifyMfaSetup: vi.fn(),
      logout: vi.fn(),
      clearError: mockClearError,
      refreshUser: vi.fn(),
      startWebAuthnRegistration: vi.fn(),
      completeWebAuthnRegistration: vi.fn(),
      startWebAuthnAuth: vi.fn(),
      completeWebAuthnAuth: vi.fn(),
      listWebAuthnCredentials: vi.fn(),
    });
  });

  describe('Etapa 1 - Email', () => {
    it('deve renderizar formulário de email na primeira etapa', () => {
      render(<LoginForm />);

      // Verifica elementos da primeira etapa
      expect(screen.getByAltText('Lexato - Provas Digitais')).toBeInTheDocument();
      expect(screen.getByText(/Capture e autentique provas digitais/i)).toBeInTheDocument();
      expect(screen.getByText('Acessar conta')).toBeInTheDocument();
      expect(screen.getByText('Escolha como deseja entrar')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
      
      // Verifica botões de login social
      expect(screen.getByText('Google')).toBeInTheDocument();
      expect(screen.getByText('Microsoft')).toBeInTheDocument();
      expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    });

    it('deve exibir link para criar conta', () => {
      render(<LoginForm />);

      const link = screen.getByRole('link', { name: /Criar conta/i });
      expect(link).toHaveAttribute('href', 'https://lexato.com.br/cadastro');
    });

    it('deve exibir separador "ou use seu email"', () => {
      render(<LoginForm />);

      expect(screen.getByText('ou use seu email')).toBeInTheDocument();
    });

    it('deve exibir logo Lexato oficial', () => {
      render(<LoginForm />);

      const logo = screen.getByAltText('Lexato - Provas Digitais');
      expect(logo).toHaveAttribute('src', expect.stringContaining('lexato-logo.svg'));
    });

    it('deve exibir footer com termos, privacidade e versão', () => {
      render(<LoginForm />);

      const termosLink = screen.getByRole('link', { name: /Termos/i });
      expect(termosLink).toHaveAttribute('href', 'https://lexato.com.br/termos');

      const privacidadeLink = screen.getByRole('link', { name: /Privacidade/i });
      expect(privacidadeLink).toHaveAttribute('href', 'https://lexato.com.br/privacidade');

      const versao = screen.getByText('v1.0.0');
      expect(versao).toHaveAttribute('title', '✓ Versão mais recente');
    });
  });

  describe('Validação de email', () => {
    it('deve exibir erro quando email vazio', () => {
      render(<LoginForm />);

      // Submeter formulário sem preencher email
      const form = screen.getByPlaceholderText('seu@email.com').closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Digite seu email')).toBeInTheDocument();
    });

    it('deve exibir erro quando email inválido', () => {
      render(<LoginForm />);

      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'invalidemail' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Email inválido')).toBeInTheDocument();
    });

    it('deve avançar para etapa de senha com email válido', () => {
      render(<LoginForm />);

      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      // Verifica que avançou para etapa de senha
      expect(screen.getByText('Digite sua senha')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  describe('Etapa 2 - Senha', () => {
    const goToPasswordStep = () => {
      render(<LoginForm />);

      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);
    };

    it('deve exibir campo de senha na segunda etapa', () => {
      goToPasswordStep();

      expect(screen.getByLabelText('Senha')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    });

    it('deve exibir email do usuário', () => {
      goToPasswordStep();

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('deve exibir botão voltar', () => {
      goToPasswordStep();

      expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    });

    it('deve exibir link "Esqueci minha senha"', () => {
      goToPasswordStep();

      const link = screen.getByRole('link', { name: /Esqueci minha senha/i });
      expect(link).toHaveAttribute('href', 'https://lexato.com.br/recuperar-senha');
    });

    it('deve voltar para etapa de email ao clicar em voltar', () => {
      goToPasswordStep();

      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      // Verifica que voltou para etapa de email (logo + campo de email)
      expect(screen.getByAltText('Lexato - Provas Digitais')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    });
  });

  describe('Validação de senha', () => {
    const goToPasswordStep = () => {
      render(<LoginForm />);

      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);
    };

    it('deve exibir erro quando senha vazia', () => {
      goToPasswordStep();

      const form = screen.getByLabelText('Senha').closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Informe sua senha')).toBeInTheDocument();
    });

    it('deve exibir erro quando senha muito curta', () => {
      goToPasswordStep();

      const passwordInput = screen.getByLabelText('Senha');
      fireEvent.change(passwordInput, { target: { value: '123' } });

      const form = passwordInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Senha deve ter no mínimo 6 caracteres')).toBeInTheDocument();
    });

    it('deve exibir erro quando Turnstile não completado', () => {
      goToPasswordStep();

      const passwordInput = screen.getByLabelText('Senha');
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      const form = passwordInput.closest('form')!;
      fireEvent.submit(form);

      expect(screen.getByText('Complete a verificação de segurança')).toBeInTheDocument();
    });
  });

  describe('Submissão de login', () => {
    const setupLoginWithTurnstile = async () => {
      render(<LoginForm />);

      // Etapa 1: Email
      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      // Aguarda Turnstile carregar e simula callback
      await waitFor(() => {
        expect(mockTurnstileRender).toHaveBeenCalled();
      });

      // Simula callback do Turnstile com token
      const turnstileCallback = mockTurnstileRender.mock.calls[0]?.[1]?.callback;
      if (turnstileCallback) turnstileCallback('turnstile-token-123');

      // Etapa 2: Senha
      const passwordInput = screen.getByLabelText('Senha');
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      return passwordInput;
    };

    it('deve chamar login com credenciais e token Turnstile', async () => {
      mockLogin.mockResolvedValueOnce({ success: true });

      const passwordInput = await setupLoginWithTurnstile();

      fireEvent.submit(passwordInput.closest('form')!);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', 'turnstile-token-123');
      });
    });

    it('deve exibir "Entrando..." durante login', async () => {
      mockLogin.mockImplementation(() => new Promise(() => {})); // Never resolves

      const passwordInput = await setupLoginWithTurnstile();

      fireEvent.submit(passwordInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByText('Entrando...')).toBeInTheDocument();
      });
    });

    it('deve exibir erro do hook useAuth', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        tokens: null,
        error: 'Credenciais inválidas',
        login: mockLogin,
        completeMfa: mockCompleteMfa,
        setupMfa: vi.fn(),
        verifyMfaSetup: vi.fn(),
        logout: vi.fn(),
        clearError: mockClearError,
        refreshUser: vi.fn(),
        startWebAuthnRegistration: vi.fn(),
        completeWebAuthnRegistration: vi.fn(),
        startWebAuthnAuth: vi.fn(),
        completeWebAuthnAuth: vi.fn(),
        listWebAuthnCredentials: vi.fn(),
      });

      render(<LoginForm />);

      expect(screen.getByText('Credenciais inválidas')).toBeInTheDocument();
    });
  });

  describe('Fluxo MFA', () => {
    const setupMfaFlow = async () => {
      mockLogin.mockResolvedValueOnce({
        success: false,
        mfaRequired: true,
        mfaSession: 'mfa-session-123',
      });

      render(<LoginForm />);

      // Etapa 1: Email
      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      // Aguarda Turnstile e simula callback
      await waitFor(() => {
        expect(mockTurnstileRender).toHaveBeenCalled();
      });
      const turnstileCallback = mockTurnstileRender.mock.calls[0]?.[1]?.callback;
      if (turnstileCallback) turnstileCallback('turnstile-token-123');

      // Etapa 2: Senha
      const passwordInput = screen.getByLabelText('Senha');
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.submit(passwordInput.closest('form')!);

      // Aguarda transição para MFA
      await waitFor(() => {
        expect(screen.getByText('Verificação em duas etapas')).toBeInTheDocument();
      });
    };

    it('deve exibir formulário MFA quando mfaRequired', async () => {
      await setupMfaFlow();

      expect(screen.getByLabelText('Código de verificação')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument();
    });

    it('deve validar código MFA de 6 dígitos', async () => {
      await setupMfaFlow();

      const mfaInput = screen.getByLabelText('Código de verificação');
      fireEvent.change(mfaInput, { target: { value: '123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

      expect(screen.getByText('Código deve ter 6 dígitos')).toBeInTheDocument();
    });

    it('deve chamar completeMfa com código válido', async () => {
      mockCompleteMfa.mockResolvedValueOnce({ success: true });

      await setupMfaFlow();

      const mfaInput = screen.getByLabelText('Código de verificação');
      fireEvent.change(mfaInput, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

      await waitFor(() => {
        expect(mockCompleteMfa).toHaveBeenCalledWith('123456', 'mfa-session-123');
      });
    });

    it('deve permitir voltar para tela de senha', async () => {
      await setupMfaFlow();

      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

      expect(screen.getByText('Digite sua senha')).toBeInTheDocument();
    });
  });

  describe('Login social', () => {
    it('deve abrir login Google em nova aba', () => {
      const mockOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<LoginForm />);

      fireEvent.click(screen.getByLabelText('Continuar com Google'));

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google'),
        '_blank'
      );

      mockOpen.mockRestore();
    });

    it('deve abrir login Microsoft em nova aba', () => {
      const mockOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<LoginForm />);

      fireEvent.click(screen.getByLabelText('Continuar com Microsoft'));

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('/auth/microsoft'),
        '_blank'
      );

      mockOpen.mockRestore();
    });

    it('deve abrir login LinkedIn em nova aba', () => {
      const mockOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<LoginForm />);

      fireEvent.click(screen.getByLabelText('Continuar com LinkedIn'));

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('/auth/linkedin'),
        '_blank'
      );

      mockOpen.mockRestore();
    });
  });

  describe('Limpeza de erros', () => {
    it('deve limpar erro ao digitar no campo de email', () => {
      render(<LoginForm />);

      // Gerar erro
      const form = screen.getByPlaceholderText('seu@email.com').closest('form')!;
      fireEvent.submit(form);
      expect(screen.getByText('Digite seu email')).toBeInTheDocument();

      // Digitar no campo
      const emailInput = screen.getByPlaceholderText('seu@email.com');
      fireEvent.change(emailInput, { target: { value: 't' } });

      // clearError deve ser chamado
      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
