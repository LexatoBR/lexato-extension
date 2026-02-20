/**
 * Teste de propriedade para CSP Builder - ausência de wildcards genéricos
 *
 * **Feature: cws-pre-publish-fixes, Property 2: CSP de produção não contém wildcards genéricos**
 * **Validates: Requirements 2.1, 2.2**
 *
 * Propriedade: Para qualquer chamada a buildCSP(false) (modo produção),
 * a string CSP resultante não deve conter os padrões `https://*` nem `http://*`,
 * e cada domínio na diretiva connect-src deve ser um domínio específico
 * (não wildcard de protocolo).
 *
 * @module csp-no-wildcards.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildCSP,
  buildConnectSrc,
  CSP_CONNECT_PRODUCTION_DOMAINS,
} from '../../src/lib/csp/csp-builder';

// ---------------------------------------------------------------------------
// Padrões proibidos no CSP de produção
// ---------------------------------------------------------------------------

/** Wildcards genéricos que invalidam o CSP de produção */
const FORBIDDEN_WILDCARDS = ['https://*', 'http://*'] as const;

/** Domínios de APIs de terceiros que não devem estar no CSP (agora via backend proxy) */
const FORBIDDEN_THIRD_PARTY_DOMAINS = [
  'api.whoisfreaks.com',
  'www.whoisxmlapi.com',
  'ssl-certificates.whoisxmlapi.com',
] as const;

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 2: CSP de produção não contém wildcards genéricos', () => {
  /**
   * Propriedade 2a: buildCSP(false) nunca contém wildcards genéricos.
   *
   * Verifica que a string CSP de produção não contém `https://*` nem `http://*`
   * como tokens isolados (wildcards de protocolo puro, não wildcards de subdomínio
   * como `https://*.lexato.com.br`).
   */
  it('buildCSP(false) nunca contém https://* ou http://* como wildcard genérico', () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (isDev) => {
          const csp = buildCSP(isDev);
          const tokens = csp.split(/[\s;]+/);

          for (const wildcard of FORBIDDEN_WILDCARDS) {
            // Verifica que nenhum token é exatamente o wildcard genérico
            expect(tokens).not.toContain(wildcard);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2b: buildConnectSrc(false) nunca contém wildcards genéricos.
   *
   * Verifica a diretiva connect-src isoladamente, tokenizando por espaço
   * para distinguir `https://*` (proibido) de `https://*.dominio.com` (permitido).
   */
  it('buildConnectSrc(false) nunca contém wildcards genéricos', () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (isDev) => {
          const connectSrc = buildConnectSrc(isDev);
          const tokens = connectSrc.split(/\s+/);

          for (const wildcard of FORBIDDEN_WILDCARDS) {
            expect(tokens).not.toContain(wildcard);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2c: Nenhum domínio em CSP_CONNECT_PRODUCTION_DOMAINS
   * é um wildcard genérico de protocolo.
   *
   * Verifica que cada entrada no array de domínios de produção é um
   * domínio específico (pode ter wildcard de subdomínio como *.lexato.com.br,
   * mas não wildcard de protocolo como https://*).
   */
  it('CSP_CONNECT_PRODUCTION_DOMAINS não contém wildcards de protocolo', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CSP_CONNECT_PRODUCTION_DOMAINS),
        (domain) => {
          // Não deve ser wildcard genérico de protocolo
          expect(domain).not.toBe('https://*');
          expect(domain).not.toBe('http://*');

          // Se contém wildcard, deve ser de subdomínio (ex: https://*.lexato.com.br)
          if (domain.includes('*')) {
            // O wildcard deve estar após o protocolo e antes de um domínio real
            const afterProtocol = domain.replace(/^(https?|wss?):\/\//, '');
            expect(afterProtocol).not.toBe('*');
            // Deve ter pelo menos um ponto após o wildcard (*.dominio.tld)
            expect(afterProtocol).toMatch(/\*\..+\..+/);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2d: CSP de produção não contém domínios de APIs de terceiros
   * que agora são acessadas via backend proxy.
   *
   * Verifica que whoisfreaks.com e whoisxmlapi.com foram removidos.
   */
  it('CSP de produção não contém domínios de APIs de terceiros removidos', () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (isDev) => {
          const csp = buildCSP(isDev);

          for (const domain of FORBIDDEN_THIRD_PARTY_DOMAINS) {
            expect(csp).not.toContain(domain);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2e: Cada domínio no CSP de produção deve começar com
   * um protocolo válido (https://, wss://) seguido de um domínio específico.
   *
   * Gera índices aleatórios no array de domínios e verifica o formato.
   */
  it('cada domínio de produção tem protocolo e host específicos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: CSP_CONNECT_PRODUCTION_DOMAINS.length - 1 }),
        (index) => {
          const domain = CSP_CONNECT_PRODUCTION_DOMAINS[index];
          if (!domain) {
            return;
          }

          // Deve começar com protocolo válido
          expect(domain).toMatch(/^(https?|wss?):\/\//);

          // Após o protocolo, deve ter conteúdo (não apenas *)
          const host = domain.replace(/^(https?|wss?):\/\//, '');
          expect(host.length).toBeGreaterThan(1);

          // Se é wildcard de subdomínio, deve ter domínio real após o *
          if (host.startsWith('*.')) {
            const realDomain = host.slice(2);
            expect(realDomain).toContain('.');
            expect(realDomain.length).toBeGreaterThan(3);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
