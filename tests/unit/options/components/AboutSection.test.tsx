/**
 * Testes unitários para AboutSection
 *
 * Testa exibição de informações sobre a extensão
 * Requisitos: 16.5, 16.6, 16.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AboutSection from '@options/components/AboutSection';

describe('AboutSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock do chrome.runtime.getManifest
    vi.mocked(chrome.runtime.getManifest).mockReturnValue({
      version: '1.2.3',
      name: 'Lexato - Provas Digitais',
      description: 'Extensão para captura de provas digitais',
      manifest_version: 3,
    } as chrome.runtime.Manifest);

    // Mock do chrome.tabs.create
    // @ts-expect-error - Mock simplificado para testes
    vi.mocked(chrome.tabs.create).mockResolvedValue({} as chrome.tabs.Tab);
  });

  describe('renderização inicial', () => {
    it('deve renderizar título da seção', () => {
      render(<AboutSection />);

      expect(screen.getByText('Sobre')).toBeInTheDocument();
    });

    it('deve renderizar nome da extensão', () => {
      render(<AboutSection />);

      expect(screen.getByText('Lexato - Provas Digitais')).toBeInTheDocument();
    });

    it('deve renderizar descrição da extensão', () => {
      render(<AboutSection />);

      expect(screen.getByText(/Provas Digitais com Validade Jurídica/i)).toBeInTheDocument();
    });
  });

  describe('versão da extensão (Requisito 16.5)', () => {
    it('deve exibir versão da extensão', () => {
      render(<AboutSection />);

      expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    });

    it('deve exibir badge de Manifest V3', () => {
      render(<AboutSection />);

      expect(screen.getByText('Manifest V3')).toBeInTheDocument();
    });

    it('deve exibir versão nas informações técnicas', () => {
      render(<AboutSection />);

      // Procurar na seção de informações técnicas
      const versionElements = screen.getAllByText('1.2.3');
      expect(versionElements.length).toBeGreaterThan(0);
    });
  });

  describe('link para documentação (Requisito 16.6)', () => {
    it('deve renderizar link de documentação', () => {
      render(<AboutSection />);

      expect(screen.getByText('Documentação')).toBeInTheDocument();
      expect(screen.getByText('Guias, tutoriais e referência da API')).toBeInTheDocument();
    });

    it('deve abrir documentação em nova aba ao clicar', () => {
      render(<AboutSection />);

      const docButton = screen.getByText('Documentação').closest('button');
      expect(docButton).toBeInTheDocument();

      fireEvent.click(docButton!);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://docs.lexato.com.br',
      });
    });
  });

  describe('link para política de privacidade (Requisito 16.7)', () => {
    it('deve renderizar link de política de privacidade', () => {
      render(<AboutSection />);

      expect(screen.getByText('Política de Privacidade')).toBeInTheDocument();
      expect(screen.getByText('Como tratamos seus dados')).toBeInTheDocument();
    });

    it('deve abrir política de privacidade em nova aba ao clicar', () => {
      render(<AboutSection />);

      const privacyButton = screen.getByText('Política de Privacidade').closest('button');
      expect(privacyButton).toBeInTheDocument();

      fireEvent.click(privacyButton!);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://lexato.com.br/privacidade',
      });
    });
  });

  describe('outros links úteis', () => {
    it('deve renderizar link de suporte', () => {
      render(<AboutSection />);

      expect(screen.getByText('Suporte')).toBeInTheDocument();
      expect(screen.getByText('Central de ajuda e contato')).toBeInTheDocument();
    });

    it('deve abrir suporte em nova aba ao clicar', () => {
      render(<AboutSection />);

      const supportButton = screen.getByText('Suporte').closest('button');
      fireEvent.click(supportButton!);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://lexato.com.br/suporte',
      });
    });

    it('deve renderizar link de termos de uso', () => {
      render(<AboutSection />);

      expect(screen.getByText('Termos de Uso')).toBeInTheDocument();
      expect(screen.getByText('Condições de uso do serviço')).toBeInTheDocument();
    });

    it('deve abrir termos de uso em nova aba ao clicar', () => {
      render(<AboutSection />);

      const termsButton = screen.getByText('Termos de Uso').closest('button');
      fireEvent.click(termsButton!);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://lexato.com.br/termos',
      });
    });

    it('deve renderizar link do GitHub', () => {
      render(<AboutSection />);

      expect(screen.getByText('Código Fonte')).toBeInTheDocument();
      expect(screen.getByText('Repositório público no GitHub')).toBeInTheDocument();
    });

    it('deve abrir GitHub em nova aba ao clicar', () => {
      render(<AboutSection />);

      const githubButton = screen.getByText('Código Fonte').closest('button');
      fireEvent.click(githubButton!);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://github.com/lexato/chrome-extension',
      });
    });
  });

  describe('informações técnicas', () => {
    it('deve exibir seção de informações técnicas', () => {
      render(<AboutSection />);

      expect(screen.getByText('Informações Técnicas')).toBeInTheDocument();
    });

    it('deve exibir framework React 19', () => {
      render(<AboutSection />);

      expect(screen.getByText('React 19')).toBeInTheDocument();
    });

    it('deve exibir bundler Vite + CRXJS', () => {
      render(<AboutSection />);

      expect(screen.getByText('Vite + CRXJS')).toBeInTheDocument();
    });

    it('deve exibir Manifest V3 nas informações técnicas', () => {
      render(<AboutSection />);

      expect(screen.getByText('V3')).toBeInTheDocument();
    });
  });

  describe('copyright', () => {
    it('deve exibir copyright', () => {
      render(<AboutSection />);

      expect(screen.getByText(/© 2026 Lexato/i)).toBeInTheDocument();
    });
  });
});
