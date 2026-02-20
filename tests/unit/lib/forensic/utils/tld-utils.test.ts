/**
 * Testes para TLD Utils
 *
 * Verifica extração correta de domínios raiz para consultas WHOIS/DNS
 * incluindo subdomínios e TLDs de segundo nível.
 */

import { describe, it, expect } from 'vitest';
import {
  extractRootDomain,
  extractHostname,
  hasSecondLevelTld,
  getSecondLevelTld,
  isBrazilianDomain,
  SECOND_LEVEL_TLDS,
} from '../../../../../src/lib/forensic/utils/tld-utils';

describe('TLD Utils', () => {
  describe('extractRootDomain', () => {
    describe('Domínios brasileiros (.br)', () => {
      it('deve extrair domínio raiz de .com.br', () => {
        expect(extractRootDomain('example.com.br')).toBe('example.com.br');
        expect(extractRootDomain('www.example.com.br')).toBe('example.com.br');
        expect(extractRootDomain('sub.example.com.br')).toBe('example.com.br');
        expect(extractRootDomain('deep.sub.example.com.br')).toBe('example.com.br');
      });

      it('deve extrair domínio raiz de .adv.br (advocacia)', () => {
        expect(extractRootDomain('exemplo-advocacia.adv.br')).toBe('exemplo-advocacia.adv.br');
        expect(extractRootDomain('www.exemplo-advocacia.adv.br')).toBe('exemplo-advocacia.adv.br');
        expect(extractRootDomain('contato.exemplo-advocacia.adv.br')).toBe('exemplo-advocacia.adv.br');
      });

      it('deve extrair domínio raiz de .gov.br', () => {
        expect(extractRootDomain('receita.gov.br')).toBe('receita.gov.br');
        expect(extractRootDomain('www.receita.gov.br')).toBe('receita.gov.br');
        expect(extractRootDomain('ecac.receita.gov.br')).toBe('receita.gov.br');
      });

      it('deve extrair domínio raiz de .edu.br', () => {
        expect(extractRootDomain('usp.edu.br')).toBe('usp.edu.br');
        expect(extractRootDomain('www.usp.edu.br')).toBe('usp.edu.br');
        expect(extractRootDomain('sistemas.usp.edu.br')).toBe('usp.edu.br');
      });

      it('deve extrair domínio raiz de .org.br', () => {
        expect(extractRootDomain('oab.org.br')).toBe('oab.org.br');
        expect(extractRootDomain('www.oab.org.br')).toBe('oab.org.br');
      });

      it('deve extrair domínio raiz de cidades brasileiras', () => {
        expect(extractRootDomain('prefeitura.rio.br')).toBe('prefeitura.rio.br');
        expect(extractRootDomain('www.prefeitura.sampa.br')).toBe('prefeitura.sampa.br');
      });

      it('deve extrair domínio raiz de profissões brasileiras', () => {
        expect(extractRootDomain('escritorio.arq.br')).toBe('escritorio.arq.br');
        expect(extractRootDomain('clinica.med.br')).toBe('clinica.med.br');
        expect(extractRootDomain('empresa.eng.br')).toBe('empresa.eng.br');
      });
    });

    describe('Domínios internacionais com TLD de segundo nível', () => {
      it('deve extrair domínio raiz de .co.uk', () => {
        expect(extractRootDomain('example.co.uk')).toBe('example.co.uk');
        expect(extractRootDomain('www.example.co.uk')).toBe('example.co.uk');
        expect(extractRootDomain('shop.example.co.uk')).toBe('example.co.uk');
      });

      it('deve extrair domínio raiz de .com.au', () => {
        expect(extractRootDomain('example.com.au')).toBe('example.com.au');
        expect(extractRootDomain('www.example.com.au')).toBe('example.com.au');
      });

      it('deve extrair domínio raiz de .co.jp', () => {
        expect(extractRootDomain('toyota.co.jp')).toBe('toyota.co.jp');
        expect(extractRootDomain('www.toyota.co.jp')).toBe('toyota.co.jp');
      });

      it('deve extrair domínio raiz de .com.ar', () => {
        expect(extractRootDomain('mercadolibre.com.ar')).toBe('mercadolibre.com.ar');
      });

      it('deve extrair domínio raiz de .com.mx', () => {
        expect(extractRootDomain('empresa.com.mx')).toBe('empresa.com.mx');
      });
    });

    describe('Domínios com TLD simples', () => {
      it('deve extrair domínio raiz de .com', () => {
        expect(extractRootDomain('google.com')).toBe('google.com');
        expect(extractRootDomain('www.google.com')).toBe('google.com');
        expect(extractRootDomain('mail.google.com')).toBe('google.com');
        expect(extractRootDomain('deep.sub.google.com')).toBe('google.com');
      });

      it('deve extrair domínio raiz de .org', () => {
        expect(extractRootDomain('wikipedia.org')).toBe('wikipedia.org');
        expect(extractRootDomain('en.wikipedia.org')).toBe('wikipedia.org');
      });

      it('deve extrair domínio raiz de .net', () => {
        expect(extractRootDomain('example.net')).toBe('example.net');
      });

      it('deve extrair domínio raiz de .io', () => {
        expect(extractRootDomain('github.io')).toBe('github.io');
        expect(extractRootDomain('user.github.io')).toBe('github.io');
      });

      it('deve extrair domínio raiz de .dev', () => {
        expect(extractRootDomain('web.dev')).toBe('web.dev');
      });
    });

    describe('URLs completas', () => {
      it('deve extrair de URLs com protocolo HTTP', () => {
        expect(extractRootDomain('http://www.example.com.br/page')).toBe('example.com.br');
      });

      it('deve extrair de URLs com protocolo HTTPS', () => {
        expect(extractRootDomain('https://www.example.com.br/page?q=1')).toBe('example.com.br');
      });

      it('deve extrair de URLs com porta', () => {
        expect(extractRootDomain('https://www.example.com.br:8080/page')).toBe('example.com.br');
      });

      it('deve extrair de URLs com path complexo', () => {
        expect(extractRootDomain('https://sub.example.co.uk/path/to/page.html')).toBe('example.co.uk');
      });
    });

    describe('Casos especiais', () => {
      it('deve tratar domínio sem subdomínio', () => {
        expect(extractRootDomain('example.com')).toBe('example.com');
      });

      it('deve remover www automaticamente', () => {
        expect(extractRootDomain('www.example.com')).toBe('example.com');
        expect(extractRootDomain('WWW.EXAMPLE.COM')).toBe('example.com');
      });

      it('deve converter para lowercase', () => {
        expect(extractRootDomain('EXAMPLE.COM.BR')).toBe('example.com.br');
        expect(extractRootDomain('Example.Co.Uk')).toBe('example.co.uk');
      });

      it('deve tratar input inválido graciosamente', () => {
        expect(extractRootDomain('localhost')).toBe('localhost');
        expect(extractRootDomain('')).toBe('');
      });
    });
  });

  describe('extractHostname', () => {
    it('deve extrair hostname de URL completa', () => {
      expect(extractHostname('https://www.example.com/page')).toBe('www.example.com');
      expect(extractHostname('http://sub.example.com.br:8080/path')).toBe('sub.example.com.br');
    });

    it('deve retornar input se não for URL válida', () => {
      expect(extractHostname('example.com')).toBe('example.com');
      expect(extractHostname('invalid')).toBe('invalid');
    });
  });

  describe('hasSecondLevelTld', () => {
    it('deve retornar true para domínios com TLD de segundo nível', () => {
      expect(hasSecondLevelTld('example.com.br')).toBe(true);
      expect(hasSecondLevelTld('example.co.uk')).toBe(true);
      expect(hasSecondLevelTld('example.adv.br')).toBe(true);
      expect(hasSecondLevelTld('www.example.gov.br')).toBe(true);
    });

    it('deve retornar false para domínios com TLD simples', () => {
      expect(hasSecondLevelTld('example.com')).toBe(false);
      expect(hasSecondLevelTld('example.org')).toBe(false);
      expect(hasSecondLevelTld('example.io')).toBe(false);
    });
  });

  describe('getSecondLevelTld', () => {
    it('deve retornar TLD de segundo nível correto', () => {
      expect(getSecondLevelTld('example.com.br')).toBe('com.br');
      expect(getSecondLevelTld('example.co.uk')).toBe('co.uk');
      expect(getSecondLevelTld('example.adv.br')).toBe('adv.br');
    });

    it('deve retornar null para TLD simples', () => {
      expect(getSecondLevelTld('example.com')).toBeNull();
      expect(getSecondLevelTld('example.org')).toBeNull();
    });
  });

  describe('isBrazilianDomain', () => {
    it('deve retornar true para domínios .br', () => {
      expect(isBrazilianDomain('example.com.br')).toBe(true);
      expect(isBrazilianDomain('example.adv.br')).toBe(true);
      expect(isBrazilianDomain('example.gov.br')).toBe(true);
    });

    it('deve retornar false para domínios não brasileiros', () => {
      expect(isBrazilianDomain('example.com')).toBe(false);
      expect(isBrazilianDomain('example.co.uk')).toBe(false);
      expect(isBrazilianDomain('example.com.ar')).toBe(false);
    });
  });

  describe('SECOND_LEVEL_TLDS', () => {
    it('deve conter TLDs brasileiros principais', () => {
      expect(SECOND_LEVEL_TLDS).toContain('com.br');
      expect(SECOND_LEVEL_TLDS).toContain('adv.br');
      expect(SECOND_LEVEL_TLDS).toContain('gov.br');
      expect(SECOND_LEVEL_TLDS).toContain('edu.br');
      expect(SECOND_LEVEL_TLDS).toContain('org.br');
    });

    it('deve conter TLDs internacionais principais', () => {
      expect(SECOND_LEVEL_TLDS).toContain('co.uk');
      expect(SECOND_LEVEL_TLDS).toContain('com.au');
      expect(SECOND_LEVEL_TLDS).toContain('co.jp');
      expect(SECOND_LEVEL_TLDS).toContain('com.ar');
    });

    it('deve estar ordenado por tamanho decrescente', () => {
      for (let i = 0; i < SECOND_LEVEL_TLDS.length - 1; i++) {
        const current = SECOND_LEVEL_TLDS[i];
        const next = SECOND_LEVEL_TLDS[i + 1];
        // Garante que ambos elementos existem antes de comparar
        expect(current).toBeDefined();
        expect(next).toBeDefined();
        if (current && next) {
          expect(current.length).toBeGreaterThanOrEqual(next.length);
        }
      }
    });
  });
});
