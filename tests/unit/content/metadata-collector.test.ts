/**
 * Testes unitários para MetadataCollector
 *
 * Testa coleta de metadados da página, ambiente, rede, logs e cookies.
 *
 * @see Requirements 9.1-9.10, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MetadataCollector,
  collectBasicPageMetadata,
  collectEnvironmentInfo,
  collectVisibleCookies,
  generateISOTimestamp,
} from '@content/metadata-collector';
import { AuditLogger } from '@lib/audit-logger';

describe('MetadataCollector', () => {
  let logger: AuditLogger;
  let collector: MetadataCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    collector = new MetadataCollector(logger);
  });

  afterEach(() => {
    collector.cleanup();
  });

  describe('constructor', () => {
    it('deve criar instância com configuração padrão', () => {
      const config = collector.getConfig();
      expect(config.collectHeaders).toBe(true);
      expect(config.collectCookies).toBe(true);
      expect(config.collectConsoleLogs).toBe(true);
      expect(config.headersTimeout).toBe(5000);
      expect(config.maxConsoleLogs).toBe(100);
    });

    it('deve aceitar configuração customizada', () => {
      const customCollector = new MetadataCollector(logger, {
        collectHeaders: false,
        maxConsoleLogs: 50,
      });
      const config = customCollector.getConfig();
      expect(config.collectHeaders).toBe(false);
      expect(config.maxConsoleLogs).toBe(50);
    });
  });

  // ==========================================================================
  // Testes de Metadados Básicos (Requirements 9.1, 9.2, 9.3)
  // ==========================================================================

  describe('collectBasicMetadata', () => {
    it('deve coletar URL, título e timestamp', () => {
      const metadata = collector.collectBasicMetadata();

      expect(metadata.url).toBe(window.location.href);
      expect(metadata.title).toBeDefined();
      expect(metadata.timestamp).toBeDefined();
    });
  });

  describe('collectUrl (Requirement 9.1)', () => {
    it('deve coletar URL completa da página', () => {
      const url = collector.collectUrl();
      expect(url).toBe(window.location.href);
    });
  });

  describe('collectTitle (Requirement 9.2)', () => {
    it('deve coletar título da página', () => {
      const originalTitle = document.title;
      document.title = 'Título de Teste';

      const title = collector.collectTitle();
      expect(title).toBe('Título de Teste');

      document.title = originalTitle;
    });

    it('deve retornar string vazia se não houver título', () => {
      const originalTitle = document.title;
      document.title = '';

      const title = collector.collectTitle();
      expect(title).toBe('');

      document.title = originalTitle;
    });
  });

  describe('collectTimestamp (Requirement 9.3)', () => {
    it('deve coletar timestamp ISO 8601', () => {
      const timestamp = collector.collectTimestamp();

      // Verificar formato ISO 8601
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // Verificar que é uma data válida
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });

    it('deve retornar timestamp próximo ao momento atual', () => {
      const before = Date.now();
      const timestamp = collector.collectTimestamp();
      const after = Date.now();

      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

  // ==========================================================================
  // Testes de Ambiente (Requirements 9.4, 9.5, 9.6)
  // ==========================================================================

  describe('collectEnvironmentMetadata', () => {
    it('deve coletar metadados de ambiente completos', () => {
      const metadata = collector.collectEnvironmentMetadata();

      expect(metadata.userAgent).toBeDefined();
      expect(metadata.extensionVersion).toBeDefined();
      expect(metadata.viewport).toBeDefined();
      expect(metadata.pageSize).toBeDefined();
      expect(metadata.viewportsCaptured).toBe(1);
    });
  });

  describe('collectUserAgent (Requirement 9.4)', () => {
    it('deve coletar User-Agent do navegador', () => {
      const userAgent = collector.collectUserAgent();
      expect(userAgent).toBe(navigator.userAgent);
      expect(userAgent.length).toBeGreaterThan(0);
    });
  });

  describe('collectExtensionVersion (Requirement 9.5)', () => {
    it('deve retornar versão da extensão ou padrão', () => {
      const version = collector.collectExtensionVersion();
      // Em ambiente de teste com mock do chrome, pode retornar a versão mockada
      // ou '0.0.0' se chrome.runtime não estiver disponível
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);
      // Verificar formato de versão (X.Y.Z ou 0.0.0)
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('collectViewportDimensions (Requirement 9.6)', () => {
    it('deve coletar dimensões do viewport', () => {
      const viewport = collector.collectViewportDimensions();

      expect(viewport.width).toBe(window.innerWidth);
      expect(viewport.height).toBe(window.innerHeight);
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.height).toBeGreaterThan(0);
    });
  });

  describe('collectPageSize', () => {
    it('deve coletar dimensões da página completa', () => {
      const pageSize = collector.collectPageSize();

      // Em jsdom, as dimensões podem ser 0, então verificamos apenas que são números
      expect(typeof pageSize.width).toBe('number');
      expect(typeof pageSize.height).toBe('number');
      expect(pageSize.width).toBeGreaterThanOrEqual(0);
      expect(pageSize.height).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Testes de Rede (Requirement 9.7)
  // ==========================================================================

  describe('collectHttpHeaders (Requirement 9.7)', () => {
    it('deve retornar undefined em caso de erro de fetch', async () => {
      // Mock fetch para simular erro
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const headers = await collector.collectHttpHeaders();
      expect(headers).toBeUndefined();

      global.fetch = originalFetch;
    });

    it('deve coletar headers quando fetch bem-sucedido', async () => {
      // Mock fetch com headers
      const mockHeaders = new Headers({
        'content-type': 'text/html',
        'x-custom-header': 'value',
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        headers: mockHeaders,
      });

      const headers = await collector.collectHttpHeaders();

      expect(headers).toBeDefined();
      expect(headers?.['content-type']).toBe('text/html');
      expect(headers?.['x-custom-header']).toBe('value');

      global.fetch = originalFetch;
    });

    it('deve filtrar headers sensíveis', async () => {
      // Mock fetch com headers sensíveis
      const mockHeaders = new Headers({
        'content-type': 'text/html',
        'authorization': 'Bearer secret-token',
        'cookie': 'session=abc123',
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        headers: mockHeaders,
      });

      const headers = await collector.collectHttpHeaders();

      expect(headers).toBeDefined();
      expect(headers?.['content-type']).toBe('text/html');
      expect(headers?.['authorization']).toBeUndefined();
      expect(headers?.['cookie']).toBeUndefined();

      global.fetch = originalFetch;
    });
  });

  // ==========================================================================
  // Testes de Logs do Console (Requirement 9.8)
  // ==========================================================================

  describe('Console capture (Requirement 9.8)', () => {
    it('deve iniciar e parar captura de logs', () => {
      collector.startConsoleCapture();
      expect(collector.getConsoleLogs()).toHaveLength(0);

      collector.stopConsoleCapture();
      expect(collector.getConsoleLogs()).toHaveLength(0);
    });

    it('deve capturar console.error', () => {
      collector.startConsoleCapture();

      console.error('Erro de teste');

      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('error');
      expect(logs[0]?.message).toContain('Erro de teste');

      collector.stopConsoleCapture();
    });

    it('deve capturar console.warn', () => {
      collector.startConsoleCapture();

      console.warn('Aviso de teste');

      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(1);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[0]?.message).toContain('Aviso de teste');

      collector.stopConsoleCapture();
    });

    it('deve capturar múltiplos logs', () => {
      collector.startConsoleCapture();

      console.error('Erro 1');
      console.warn('Aviso 1');
      console.error('Erro 2');

      const logs = collector.getConsoleLogs();
      expect(logs.length).toBe(3);

      collector.stopConsoleCapture();
    });

    it('deve respeitar limite máximo de logs', () => {
      const limitedCollector = new MetadataCollector(logger, { maxConsoleLogs: 2 });
      limitedCollector.startConsoleCapture();

      console.error('Erro 1');
      console.error('Erro 2');
      console.error('Erro 3'); // Deve ser ignorado

      const logs = limitedCollector.getConsoleLogs();
      expect(logs.length).toBe(2);

      limitedCollector.stopConsoleCapture();
    });

    it('deve limpar logs capturados', () => {
      collector.startConsoleCapture();
      console.error('Erro');
      collector.stopConsoleCapture();

      expect(collector.getConsoleLogs().length).toBe(1);

      collector.clearConsoleLogs();
      expect(collector.getConsoleLogs().length).toBe(0);
    });

    it('deve incluir timestamp nos logs', () => {
      collector.startConsoleCapture();

      const before = Date.now();
      console.error('Erro com timestamp');
      const after = Date.now();

      const logs = collector.getConsoleLogs();
      expect(logs[0]?.timestamp).toBeGreaterThanOrEqual(before);
      expect(logs[0]?.timestamp).toBeLessThanOrEqual(after);

      collector.stopConsoleCapture();
    });
  });

  // ==========================================================================
  // Testes de Cookies (Requirement 9.9)
  // ==========================================================================

  describe('collectCookies (Requirement 9.9)', () => {
    it('deve retornar array vazio se não houver cookies', () => {
      // Limpar cookies
      const originalCookie = document.cookie;
      Object.defineProperty(document, 'cookie', {
        value: '',
        writable: true,
        configurable: true,
      });

      const cookies = collector.collectCookies();
      expect(cookies).toEqual([]);

      Object.defineProperty(document, 'cookie', {
        value: originalCookie,
        writable: true,
        configurable: true,
      });
    });

    it('deve coletar cookies visíveis', () => {
      Object.defineProperty(document, 'cookie', {
        value: 'name=value; other=data',
        writable: true,
        configurable: true,
      });

      const cookies = collector.collectCookies();
      expect(cookies).toContain('name=value');
      expect(cookies).toContain('other=data');
    });

    it('deve mascarar cookies sensíveis', () => {
      Object.defineProperty(document, 'cookie', {
        value: 'session_token=secret123; normal=value',
        writable: true,
        configurable: true,
      });

      const cookies = collector.collectCookies();
      expect(cookies).toContain('session_token=***REDACTED***');
      expect(cookies).toContain('normal=value');
    });
  });

  // ==========================================================================
  // Testes de Geração de JSON (Requirement 9.10)
  // ==========================================================================

  describe('generateJson (Requirement 9.10)', () => {
    it('deve gerar JSON estruturado', () => {
      const metadata = {
        url: 'https://example.com',
        title: 'Test',
        timestamp: '2024-01-01T00:00:00.000Z',
        userAgent: 'Test Agent',
        extensionVersion: '1.0.0',
        viewport: { width: 1920, height: 1080 },
        pageSize: { width: 1920, height: 3000 },
        viewportsCaptured: 1,
      };

      const json = collector.generateJson(metadata);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      // Verificar que é JSON válido
      const parsed = JSON.parse(json);
      expect(parsed.url).toBe('https://example.com');
      expect(parsed.title).toBe('Test');
    });

    it('deve ordenar chaves do JSON', () => {
      const metadata = {
        zebra: 'z',
        alpha: 'a',
        beta: 'b',
      };

      const json = collector.generateJson(metadata as unknown as import('@content/metadata-collector').CollectedMetadata);
      const keys = Object.keys(JSON.parse(json));

      expect(keys[0]).toBe('alpha');
      expect(keys[1]).toBe('beta');
      expect(keys[2]).toBe('zebra');
    });

    it('deve ordenar chaves aninhadas', () => {
      const metadata = {
        viewport: { height: 1080, width: 1920 },
        url: 'https://example.com',
      };

      const json = collector.generateJson(metadata as unknown as import('@content/metadata-collector').CollectedMetadata);
      const parsed = JSON.parse(json);

      // Verificar ordem das chaves do objeto aninhado
      const viewportKeys = Object.keys(parsed.viewport);
      expect(viewportKeys[0]).toBe('height');
      expect(viewportKeys[1]).toBe('width');
    });
  });

  // ==========================================================================
  // Testes de Coleta Completa
  // ==========================================================================

  describe('collect', () => {
    it('deve coletar todos os metadados', async () => {
      // Mock fetch para headers
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const result = await collector.collect();

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadataJson).toBeDefined();

      // Verificar metadados básicos
      expect(result.metadata?.url).toBe(window.location.href);
      expect(result.metadata?.timestamp).toBeDefined();
      expect(result.metadata?.userAgent).toBe(navigator.userAgent);

      global.fetch = originalFetch;
    });

    it('deve continuar mesmo se coleta de headers falhar', async () => {
      // Mock fetch para simular erro
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await collector.collect();

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.httpHeaders).toBeUndefined();

      global.fetch = originalFetch;
    });

    it('deve respeitar configuração de coleta', async () => {
      const limitedCollector = new MetadataCollector(logger, {
        collectHeaders: false,
        collectCookies: false,
        collectConsoleLogs: false,
      });

      const result = await limitedCollector.collect();

      expect(result.success).toBe(true);
      expect(result.metadata?.httpHeaders).toBeUndefined();
      expect(result.metadata?.cookies).toBeUndefined();
      expect(result.metadata?.consoleLogs).toBeUndefined();
    });
  });

  // ==========================================================================
  // Testes de Limpeza
  // ==========================================================================

  describe('cleanup', () => {
    it('deve limpar recursos e restaurar estado', () => {
      collector.startConsoleCapture();
      console.error('Erro');

      collector.cleanup();

      expect(collector.getConsoleLogs()).toHaveLength(0);
    });
  });
});

// ==========================================================================
// Testes de Funções Auxiliares
// ==========================================================================

describe('Funções auxiliares', () => {
  describe('collectBasicPageMetadata', () => {
    it('deve coletar metadados básicos', () => {
      const metadata = collectBasicPageMetadata();

      expect(metadata.url).toBe(window.location.href);
      expect(metadata.title).toBeDefined();
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('collectEnvironmentInfo', () => {
    it('deve coletar informações de ambiente', () => {
      const info = collectEnvironmentInfo();

      expect(info.userAgent).toBe(navigator.userAgent);
      expect(info.extensionVersion).toBeDefined();
      expect(info.viewport.width).toBeGreaterThan(0);
      expect(info.viewport.height).toBeGreaterThan(0);
    });
  });

  describe('collectVisibleCookies', () => {
    it('deve coletar cookies visíveis', () => {
      Object.defineProperty(document, 'cookie', {
        value: 'test=value',
        writable: true,
        configurable: true,
      });

      const cookies = collectVisibleCookies();
      expect(cookies).toContain('test=value');
    });

    it('deve retornar array vazio se não houver cookies', () => {
      Object.defineProperty(document, 'cookie', {
        value: '',
        writable: true,
        configurable: true,
      });

      const cookies = collectVisibleCookies();
      expect(cookies).toEqual([]);
    });
  });

  describe('generateISOTimestamp', () => {
    it('deve gerar timestamp ISO 8601', () => {
      const timestamp = generateISOTimestamp();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // Verificar que é uma data válida
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });
  });
});
