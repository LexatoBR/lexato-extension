/**
 * Testes unitários para AccountInfo
 *
 * Testa exibição de informações da conta e logout
 * Requisitos: 16.3, 16.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountInfo from '@options/components/AccountInfo';
import type { AuthUser } from '@/types/auth.types';

describe('AccountInfo', () => {
  const mockUser: AuthUser = {
    id: 'user-123-abc',
    email: 'usuario@exemplo.com',
    name: 'João Silva',
    accountType: 'individual',
    credits: 50,
    mfaEnabled: true,
  };

  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
  });

  describe('estado não autenticado', () => {
    it('deve exibir mensagem quando não autenticado', () => {
      render(
        <AccountInfo
          isAuthenticated={false}
          user={null}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('Conta')).toBeInTheDocument();
      expect(screen.getByText('Não autenticado')).toBeInTheDocument();
      expect(screen.getByText(/Faça login no popup/i)).toBeInTheDocument();
    });

    it('não deve exibir botão de logout quando não autenticado', () => {
      render(
        <AccountInfo
          isAuthenticated={false}
          user={null}
          onLogout={mockLogout}
        />
      );

      expect(screen.queryByRole('button', { name: /Sair/i })).not.toBeInTheDocument();
    });
  });

  describe('exibição de informações da conta (Requisito 16.3)', () => {
    it('deve exibir nome e email do usuário', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });

    it('deve exibir avatar com inicial do nome', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      // Avatar deve conter a inicial "J"
      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('deve exibir avatar com inicial do email quando nome não disponível', () => {
      const userWithoutName: AuthUser = {
        id: mockUser.id,
        email: mockUser.email,
        accountType: mockUser.accountType,
        credits: mockUser.credits,
        mfaEnabled: mockUser.mfaEnabled,
      };

      render(
        <AccountInfo
          isAuthenticated={true}
          user={userWithoutName}
          onLogout={mockLogout}
        />
      );

      // Avatar deve conter a inicial "U" (de usuario@exemplo.com)
      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('deve exibir tipo de conta individual', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('Individual')).toBeInTheDocument();
    });

    it('deve exibir tipo de conta empresarial', () => {
      const enterpriseUser: AuthUser = {
        ...mockUser,
        accountType: 'enterprise',
        enterpriseId: 'enterprise-123',
      };

      render(
        <AccountInfo
          isAuthenticated={true}
          user={enterpriseUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('Empresarial')).toBeInTheDocument();
    });

    it('deve exibir saldo de créditos', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('deve exibir status de MFA habilitado', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('Habilitado')).toBeInTheDocument();
    });

    it('deve exibir status de MFA desabilitado', () => {
      const userWithoutMfa: AuthUser = {
        ...mockUser,
        mfaEnabled: false,
      };

      render(
        <AccountInfo
          isAuthenticated={true}
          user={userWithoutMfa}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('Desabilitado')).toBeInTheDocument();
    });

    it('deve exibir ID do usuário', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByText('user-123-abc')).toBeInTheDocument();
    });
  });

  describe('logout (Requisito 16.4)', () => {
    it('deve exibir botão de logout', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      expect(screen.getByRole('button', { name: /Sair da Conta/i })).toBeInTheDocument();
    });

    it('deve exibir confirmação ao clicar em logout', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      const logoutButton = screen.getByRole('button', { name: /Sair da Conta/i });
      fireEvent.click(logoutButton);

      expect(screen.getByText('Tem certeza que deseja sair?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    });

    it('deve cancelar logout ao clicar em Cancelar', () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      // Clicar em logout
      fireEvent.click(screen.getByRole('button', { name: /Sair da Conta/i }));

      // Clicar em cancelar
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      // Deve voltar ao estado inicial
      expect(screen.queryByText('Tem certeza que deseja sair?')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sair da Conta/i })).toBeInTheDocument();
    });

    it('deve chamar onLogout ao confirmar', async () => {
      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      // Clicar em logout
      fireEvent.click(screen.getByRole('button', { name: /Sair da Conta/i }));

      // Confirmar logout
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });
    });

    it('deve exibir "Saindo..." durante logout', async () => {
      mockLogout.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      // Clicar em logout
      fireEvent.click(screen.getByRole('button', { name: /Sair da Conta/i }));

      // Confirmar logout
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(screen.getByText('Saindo...')).toBeInTheDocument();
      });
    });

    it('deve desabilitar botões durante logout', async () => {
      mockLogout.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <AccountInfo
          isAuthenticated={true}
          user={mockUser}
          onLogout={mockLogout}
        />
      );

      // Clicar em logout
      fireEvent.click(screen.getByRole('button', { name: /Sair da Conta/i }));

      // Confirmar logout
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      });
    });
  });
});
