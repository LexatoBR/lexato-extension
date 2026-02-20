/**
 * Testes unitários para o CSP condicional por ambiente no manifest.
 *
 * Testa o módulo csp-builder.ts que contém a lógica pura de construção
 * do CSP, separada do manifest.ts para evitar dependência do CRXJS/esbuild.
 *
 * Verifica que o CSP gerado é correto baseado no modo de build:
 * - Produção: sem referências a localhost
 * - Desenvolvimento: com origens localhost para dev server
 * - Ambos: mantém todos os domínios de serviços externos
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.3
 */

import { describe, it, expect } from 'vitest';
import {
  buildCSP,
  buildConnectSrc,
  CSP_BASE,
  CSP_CONNECT_PRODUCTION,
  CSP_CONNECT_PRODUCTION_DOMAINS,
  CSP_CONNECT_DEV,
  LOCALHOST_PATTERNS,
} from '../../../src/lib/csp/csp-builder';

// ---------------------------------------------------------------------------
// Domínios de serviços externos que devem estar presentes em AMBOS os modos
// ---------------------------------------------------------------------------
const REQUIRED_PRODUCTION_DOMAINS = [
  // API principal Lexato + Supabase via domínio customizado
  'https://*.lexato.com.br',
  'wss://*.lexato.com.br',
  // Armazenamento e WebSocket AWS
  'https://*.s3.sa-east-1.amazonaws.com',
  'https://*.execute-api.sa-east-1.amazonaws.com',
  'wss://*.execute-api.sa-east-1.amazonaws.com',
  // Monitoramento de erros
  'https://*.sentry.io',
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  // Coleta forense de metadados
  'https://ipinfo.io',
  'https://ip-api.com',
  'https://dns.google',
  'https://cloudflare-dns.com',
  'https://archive.org',
  'https://web.archive.org',
  'https://api.whoisfreaks.com',
  // Blockchain RPCs
  'https://polygon-rpc.com',
  'https://*.polygon-rpc.com',
  'https://arb1.arbitrum.io',
  'https://*.arbitrum.io',
  'https://mainnet.optimism.io',
  'https://*.optimism.io',
];

describe('CSP condicional por ambiente', () => {
  describe('buildCSP - modo production (isDev = false)', () => {
    const csp = buildCSP(false);

    it('NÃO inclui referências a localhost no CSP', () => {
      for (const pattern of LOCALHOST_PATTERNS) {
        expect(csp).not.toContain(pattern);
      }
    });

    it('mantém todos os domínios de serviços externos no CSP', () => {
      for (const domain of REQUIRED_PRODUCTION_DOMAINS) {
        expect(csp).toContain(domain);
      }
    });

    it('inclui diretivas base de segurança (script-src e object-src)', () => {
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(csp).toContain("object-src 'self'");
    });

    it('inclui connect-src com self', () => {
      expect(csp).toContain("connect-src 'self'");
    });
  });

  describe('buildCSP - modo development (isDev = true)', () => {
    const csp = buildCSP(true);

    it('inclui referências a localhost no CSP', () => {
      for (const pattern of LOCALHOST_PATTERNS) {
        expect(csp).toContain(pattern);
      }
    });

    it('mantém todos os domínios de serviços externos no CSP', () => {
      for (const domain of REQUIRED_PRODUCTION_DOMAINS) {
        expect(csp).toContain(domain);
      }
    });

    it('inclui diretivas base de segurança (script-src e object-src)', () => {
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
      expect(csp).toContain("object-src 'self'");
    });
  });

  describe('buildConnectSrc', () => {
    it('retorna connect-src sem localhost em produção', () => {
      const connectSrc = buildConnectSrc(false);

      expect(connectSrc).toMatch(/^connect-src 'self'/);
      for (const pattern of LOCALHOST_PATTERNS) {
        expect(connectSrc).not.toContain(pattern);
      }
    });

    it('retorna connect-src com localhost em desenvolvimento', () => {
      const connectSrc = buildConnectSrc(true);

      expect(connectSrc).toMatch(/^connect-src 'self'/);
      for (const pattern of LOCALHOST_PATTERNS) {
        expect(connectSrc).toContain(pattern);
      }
    });
  });

  describe('Diferença entre produção e desenvolvimento', () => {
    it('CSP de desenvolvimento é mais longo que o de produção', () => {
      const prodCSP = buildCSP(false);
      const devCSP = buildCSP(true);

      expect(devCSP.length).toBeGreaterThan(prodCSP.length);
    });

    it('CSP de produção e desenvolvimento diferem apenas no localhost', () => {
      const prodCSP = buildCSP(false);
      const devCSP = buildCSP(true);

      // Removendo os padrões de localhost do CSP de dev, deve ser igual ao de produção
      let devCSPWithoutLocalhost = devCSP;
      for (const pattern of LOCALHOST_PATTERNS) {
        // Remove o padrão com wildcard (ex: "http://localhost:*")
        devCSPWithoutLocalhost = devCSPWithoutLocalhost.replace(
          new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\s*', 'g'),
          ''
        );
      }
      // Normaliza espaços para comparação
      const normalizedProd = prodCSP.replace(/\s+/g, ' ').trim();
      const normalizedDev = devCSPWithoutLocalhost.replace(/\s+/g, ' ').trim();
      expect(normalizedDev).toBe(normalizedProd);
    });
  });

  describe('Formato e estrutura do CSP', () => {
    it('CSP contém exatamente três diretivas separadas por ponto-e-vírgula', () => {
      const csp = buildCSP(false);

      const directives = csp.split(';').map((d) => d.trim());
      expect(directives.length).toBe(3);
      expect(directives[0]).toMatch(/^script-src /);
      expect(directives[1]).toMatch(/^object-src /);
      expect(directives[2]).toMatch(/^connect-src /);
    });

    it('CSP_BASE contém script-src e object-src', () => {
      expect(CSP_BASE).toContain("script-src 'self'");
      expect(CSP_BASE).toContain("object-src 'self'");
      expect(CSP_BASE).toContain('wasm-unsafe-eval');
    });
  });

  describe('Constantes exportadas', () => {
    it('CSP_CONNECT_PRODUCTION_DOMAINS contém todos os domínios esperados', () => {
      for (const domain of REQUIRED_PRODUCTION_DOMAINS) {
        expect(CSP_CONNECT_PRODUCTION_DOMAINS).toContain(domain);
      }
    });

    it('CSP_CONNECT_PRODUCTION é a junção dos domínios com espaço', () => {
      expect(CSP_CONNECT_PRODUCTION).toBe(CSP_CONNECT_PRODUCTION_DOMAINS.join(' '));
    });

    it('CSP_CONNECT_DEV contém todos os padrões de localhost', () => {
      for (const pattern of LOCALHOST_PATTERNS) {
        expect(CSP_CONNECT_DEV).toContain(pattern);
      }
    });

    it('LOCALHOST_PATTERNS contém os 4 padrões esperados', () => {
      expect(LOCALHOST_PATTERNS).toHaveLength(4);
      expect(LOCALHOST_PATTERNS).toContain('http://localhost:');
      expect(LOCALHOST_PATTERNS).toContain('ws://localhost:');
      expect(LOCALHOST_PATTERNS).toContain('http://127.0.0.1:');
      expect(LOCALHOST_PATTERNS).toContain('ws://127.0.0.1:');
    });
  });
});
