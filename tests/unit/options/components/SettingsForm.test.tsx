/**
 * Testes unitários para SettingsForm
 *
 * Testa formulário de configurações da extensão
 * Requisitos: 16.1, 16.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsForm from '@options/components/SettingsForm';

describe('SettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock do chrome.storage.local.get para retornar configurações padrão
    // @ts-expect-error - Mock simplificado para testes
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
  });

  describe('renderização inicial', () => {
    it('deve renderizar título e descrição', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Configurações Gerais')).toBeInTheDocument();
      });

      expect(screen.getByText('Configure suas preferências de captura')).toBeInTheDocument();
    });

    it('deve renderizar opções de tipo de armazenamento (Requisito 16.1)', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Tipo de Armazenamento Padrão')).toBeInTheDocument();
      });

      expect(screen.getByText('Padrão (5 anos)')).toBeInTheDocument();
      expect(screen.getByText('5 Anos')).toBeInTheDocument();
      expect(screen.getByText('10 Anos')).toBeInTheDocument();
      expect(screen.getByText('20 Anos')).toBeInTheDocument();
    });

    it('deve renderizar opções de qualidade de captura (Requisito 16.2)', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Qualidade de Captura')).toBeInTheDocument();
      });

      expect(screen.getByText('Alta Qualidade')).toBeInTheDocument();
      expect(screen.getByText('Qualidade Média')).toBeInTheDocument();
    });

    it('deve renderizar opção de notificações', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Notificações')).toBeInTheDocument();
      });

      expect(screen.getByText('Habilitar notificações')).toBeInTheDocument();
    });
  });

  describe('carregamento de configurações', () => {
    it('deve carregar configurações salvas do storage', async () => {
      // @ts-expect-error - Mock simplificado para testes
      vi.mocked(chrome.storage.local.get).mockResolvedValue({
        lexato_settings: {
          defaultStorageType: 'premium_5y',
          captureQuality: 'medium',
          notificationsEnabled: false,
        },
      });

      render(<SettingsForm />);

      await waitFor(() => {
        const premium5yRadio = screen.getByRole('radio', { name: /5 Anos/i });
        expect(premium5yRadio).toBeChecked();
      });

      const mediumQualityRadio = screen.getByRole('radio', { name: /Qualidade Média/i });
      expect(mediumQualityRadio).toBeChecked();

      const notificationsCheckbox = screen.getByRole('checkbox', { name: /Habilitar notificações/i });
      expect(notificationsCheckbox).not.toBeChecked();
    });

    it('deve usar configurações padrão quando storage vazio', async () => {
      // @ts-expect-error - Mock simplificado para testes
      vi.mocked(chrome.storage.local.get).mockResolvedValue({});

      render(<SettingsForm />);

      await waitFor(() => {
        const standardRadio = screen.getByRole('radio', { name: /Standard \(90 dias\)/i });
        expect(standardRadio).toBeChecked();
      });

      const highQualityRadio = screen.getByRole('radio', { name: /Alta Qualidade/i });
      expect(highQualityRadio).toBeChecked();

      const notificationsCheckbox = screen.getByRole('checkbox', { name: /Habilitar notificações/i });
      expect(notificationsCheckbox).toBeChecked();
    });
  });

  describe('alteração de tipo de armazenamento (Requisito 16.1)', () => {
    it('deve salvar novo tipo de armazenamento ao selecionar', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Padrão (5 anos)')).toBeInTheDocument();
      });

      const premium10yRadio = screen.getByRole('radio', { name: /10 Anos/i });
      fireEvent.click(premium10yRadio);

      await waitFor(() => {
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
          lexato_settings: expect.objectContaining({
            defaultStorageType: 'premium_10y',
          }),
        });
      });
    });

    it('deve exibir créditos necessários para cada opção', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('1 crédito(s)')).toBeInTheDocument();
      });

      expect(screen.getByText('5 crédito(s)')).toBeInTheDocument();
      expect(screen.getByText('10 crédito(s)')).toBeInTheDocument();
      expect(screen.getByText('20 crédito(s)')).toBeInTheDocument();
    });
  });

  describe('alteração de qualidade de captura (Requisito 16.2)', () => {
    it('deve salvar nova qualidade ao selecionar', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Alta Qualidade')).toBeInTheDocument();
      });

      const mediumQualityRadio = screen.getByRole('radio', { name: /Qualidade Média/i });
      fireEvent.click(mediumQualityRadio);

      await waitFor(() => {
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
          lexato_settings: expect.objectContaining({
            captureQuality: 'medium',
          }),
        });
      });
    });
  });

  describe('alteração de notificações', () => {
    it('deve salvar configuração de notificações ao alterar', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Habilitar notificações')).toBeInTheDocument();
      });

      const notificationsCheckbox = screen.getByRole('checkbox', { name: /Habilitar notificações/i });
      fireEvent.click(notificationsCheckbox);

      await waitFor(() => {
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
          lexato_settings: expect.objectContaining({
            notificationsEnabled: false,
          }),
        });
      });
    });
  });

  describe('feedback de salvamento', () => {
    it('deve exibir mensagem de sucesso ao salvar', async () => {
      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Padrão (5 anos)')).toBeInTheDocument();
      });

      const premium5yRadio = screen.getByRole('radio', { name: /5 Anos/i });
      fireEvent.click(premium5yRadio);

      await waitFor(() => {
        expect(screen.getByText('Configurações salvas com sucesso!')).toBeInTheDocument();
      });
    });

    it('deve exibir mensagem de erro quando salvamento falhar', async () => {
      vi.mocked(chrome.storage.local.set).mockRejectedValue(new Error('Storage error'));

      render(<SettingsForm />);

      await waitFor(() => {
        expect(screen.getByText('Padrão (5 anos)')).toBeInTheDocument();
      });

      const premium5yRadio = screen.getByRole('radio', { name: /5 Anos/i });
      fireEvent.click(premium5yRadio);

      await waitFor(() => {
        expect(screen.getByText('Erro ao salvar configurações. Tente novamente.')).toBeInTheDocument();
      });
    });
  });

  describe('estado de carregamento', () => {
    it('deve exibir skeleton durante carregamento', () => {
      // Simular carregamento lento
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<SettingsForm />);

      // Deve exibir skeleton (elementos com animate-pulse)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
