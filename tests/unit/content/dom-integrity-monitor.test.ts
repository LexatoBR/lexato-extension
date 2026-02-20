/**
 * Testes unitários para DOMIntegrityMonitor
 *
 * Testa monitoramento de integridade do DOM durante captura de evidências
 *
 * @see Requirements 5.9, 5.10, 5.13, 5.16, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMIntegrityMonitor, MutationInfo } from '@content/dom-integrity-monitor';
import { AuditLogger } from '@lib/audit-logger';

describe('DOMIntegrityMonitor', () => {
  let monitor: DOMIntegrityMonitor;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger();
    monitor = new DOMIntegrityMonitor(logger);

    // Garantir que document.body existe
    if (!document.body) {
      document.body = document.createElement('body');
    }

    // Limpar body para testes consistentes
    document.body.innerHTML = '<div id="test-container"></div>';
  });

  afterEach(() => {
    // Garantir que monitor seja parado após cada teste
    if (monitor.isMonitorActive()) {
      monitor.stop();
    }
  });

  describe('constructor', () => {
    it('deve criar instância com estado inicial correto', () => {
      expect(monitor.isMonitorActive()).toBe(false);
      expect(monitor.getBaseline()).toBeNull();
      expect(monitor.getMutations()).toHaveLength(0);
      expect(monitor.getMutationCount()).toBe(0);
    });
  });

  describe('captureBaseline (Requirement 5.16)', () => {
    it('deve capturar baseline do DOM com hash, elementCount e textContentLength', async () => {
      const baseline = await monitor.captureBaseline();

      expect(baseline.hash).toBeDefined();
      expect(baseline.hash.length).toBe(64); // SHA-256 hex
      expect(baseline.elementCount).toBeGreaterThan(0);
      expect(baseline.textContentLength).toBeGreaterThanOrEqual(0);
      expect(baseline.timestamp).toBeGreaterThan(0);
    });

    it('deve armazenar baseline internamente', async () => {
      await monitor.captureBaseline();

      const storedBaseline = monitor.getBaseline();
      expect(storedBaseline).not.toBeNull();
      expect(storedBaseline?.hash.length).toBe(64);
    });

    it('deve retornar cópia do baseline (não referência)', async () => {
      await monitor.captureBaseline();

      const baseline1 = monitor.getBaseline();
      const baseline2 = monitor.getBaseline();

      expect(baseline1).not.toBe(baseline2);
      expect(baseline1).toEqual(baseline2);
    });

    it('deve calcular hash diferente para DOMs diferentes', async () => {
      const baseline1 = await monitor.captureBaseline();

      // Modificar DOM
      document.body.innerHTML = '<div id="different-content">Novo conteúdo</div>';

      // Criar novo monitor para capturar novo baseline
      const monitor2 = new DOMIntegrityMonitor(logger);
      const baseline2 = await monitor2.captureBaseline();

      expect(baseline1.hash).not.toBe(baseline2.hash);
    });
  });

  describe('start (Requirement 5.10)', () => {
    it('deve iniciar monitoramento com MutationObserver', async () => {
      await monitor.start();

      expect(monitor.isMonitorActive()).toBe(true);
    });

    it('deve capturar baseline automaticamente se não existir', async () => {
      expect(monitor.getBaseline()).toBeNull();

      await monitor.start();

      expect(monitor.getBaseline()).not.toBeNull();
    });

    it('deve usar baseline existente se já capturado', async () => {
      const baseline = await monitor.captureBaseline();
      await monitor.start();

      expect(monitor.getBaseline()?.timestamp).toBe(baseline.timestamp);
    });

    it('não deve reiniciar se já estiver ativo', async () => {
      await monitor.start();
      const baseline1 = monitor.getBaseline();

      await monitor.start(); // Segunda chamada
      const baseline2 = monitor.getBaseline();

      expect(baseline1?.timestamp).toBe(baseline2?.timestamp);
    });

    it('deve detectar mutações de childList', async () => {
      const mutations: MutationInfo[] = [];
      await monitor.start((mutation) => mutations.push(mutation));

      // Adicionar elemento
      const newElement = document.createElement('div');
      newElement.id = 'new-element';
      document.body.appendChild(newElement);

      // Aguardar processamento do MutationObserver
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mutations.length).toBeGreaterThan(0);
      expect(mutations.some((m) => m.type === 'childList')).toBe(true);
    });

    it('deve detectar mutações de attributes', async () => {
      const mutations: MutationInfo[] = [];
      await monitor.start((mutation) => mutations.push(mutation));

      // Modificar atributo
      const container = document.getElementById('test-container');
      container?.setAttribute('data-test', 'value');

      // Aguardar processamento
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mutations.some((m) => m.type === 'attributes')).toBe(true);
    });

    it('deve detectar mutações de characterData', async () => {
      const mutations: MutationInfo[] = [];

      // Criar nó de texto
      const textNode = document.createTextNode('Texto original');
      document.body.appendChild(textNode);

      await monitor.start((mutation) => mutations.push(mutation));

      // Modificar texto
      textNode.textContent = 'Texto modificado';

      // Aguardar processamento
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mutations.some((m) => m.type === 'characterData')).toBe(true);
    });

    it('deve incrementar contador de mutações', async () => {
      await monitor.start();

      expect(monitor.getMutationCount()).toBe(0);

      // Adicionar elementos
      document.body.appendChild(document.createElement('span'));
      document.body.appendChild(document.createElement('p'));

      // Aguardar processamento
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(monitor.getMutationCount()).toBeGreaterThan(0);
    });
  });

  describe('bloqueio de elementos perigosos (Requirement 5.9)', () => {
    it('deve bloquear criação de iframe', async () => {
      const dangerousElements: string[] = [];
      monitor.onDangerousElement((tagName) => dangerousElements.push(tagName));

      await monitor.start();

      // Tentar adicionar iframe
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      // Aguardar processamento
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dangerousElements).toContain('iframe');
      // Elemento deve ter sido removido
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('deve bloquear criação de script', async () => {
      const dangerousElements: string[] = [];
      monitor.onDangerousElement((tagName) => dangerousElements.push(tagName));

      await monitor.start();

      // Tentar adicionar script
      const script = document.createElement('script');
      document.body.appendChild(script);

      // Aguardar processamento
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dangerousElements).toContain('script');
      expect(document.querySelector('script')).toBeNull();
    });

    it('deve bloquear criação de object', async () => {
      const dangerousElements: string[] = [];
      monitor.onDangerousElement((tagName) => dangerousElements.push(tagName));

      await monitor.start();

      const obj = document.createElement('object');
      document.body.appendChild(obj);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dangerousElements).toContain('object');
    });

    it('deve bloquear criação de embed', async () => {
      const dangerousElements: string[] = [];
      monitor.onDangerousElement((tagName) => dangerousElements.push(tagName));

      await monitor.start();

      const embed = document.createElement('embed');
      document.body.appendChild(embed);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dangerousElements).toContain('embed');
    });

    it('deve bloquear criação de frame', async () => {
      const dangerousElements: string[] = [];
      monitor.onDangerousElement((tagName) => dangerousElements.push(tagName));

      await monitor.start();

      const frame = document.createElement('frame');
      document.body.appendChild(frame);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(dangerousElements).toContain('frame');
    });

    it('deve marcar mutação como bloqueada', async () => {
      const mutations: MutationInfo[] = [];
      await monitor.start((mutation) => mutations.push(mutation));

      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mutations.some((m) => m.blocked === true)).toBe(true);
    });
  });

  describe('observação de Shadow DOM (Requirement 5.13)', () => {
    it('deve observar Shadow DOM existente', async () => {
      // Criar elemento com Shadow DOM antes de iniciar monitor
      const hostElement = document.createElement('div');
      hostElement.id = 'shadow-host';
      document.body.appendChild(hostElement);

      const shadowRoot = hostElement.attachShadow({ mode: 'open' });
      shadowRoot.innerHTML = '<span>Shadow content</span>';

      const mutations: MutationInfo[] = [];
      await monitor.start((mutation) => mutations.push(mutation));

      // Modificar conteúdo do Shadow DOM
      const newSpan = document.createElement('span');
      newSpan.textContent = 'New shadow content';
      shadowRoot.appendChild(newSpan);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mutations.some((m) => m.isShadowDOM === true)).toBe(true);
    });

    it('deve observar novos Shadow DOMs criados após início', async () => {
      const mutations: MutationInfo[] = [];
      await monitor.start((mutation) => mutations.push(mutation));

      // Criar elemento com Shadow DOM após iniciar monitor
      const hostElement = document.createElement('div');
      hostElement.id = 'new-shadow-host';
      document.body.appendChild(hostElement);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const shadowRoot = hostElement.attachShadow({ mode: 'open' });
      shadowRoot.innerHTML = '<span>New shadow content</span>';

      // Modificar Shadow DOM
      const newElement = document.createElement('div');
      shadowRoot.appendChild(newElement);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Deve ter detectado mutações (pelo menos a adição do host)
      expect(mutations.length).toBeGreaterThan(0);
    });
  });

  describe('verifyIntegrity', () => {
    it('deve retornar hashMatch true quando DOM não foi modificado', async () => {
      await monitor.captureBaseline();
      await monitor.start();

      const result = await monitor.verifyIntegrity();

      expect(result.hashMatch).toBe(true);
      expect(result.elementCountMatch).toBe(true);
    });

    it('deve retornar hashMatch false quando DOM foi modificado', async () => {
      await monitor.captureBaseline();
      await monitor.start();

      // Modificar DOM
      document.body.innerHTML = '<div>Conteúdo completamente diferente</div>';

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await monitor.verifyIntegrity();

      expect(result.hashMatch).toBe(false);
    });

    it('deve retornar elementCountMatch false quando elementos foram adicionados', async () => {
      await monitor.captureBaseline();
      const initialCount = monitor.getBaseline()?.elementCount ?? 0;

      await monitor.start();

      // Adicionar muitos elementos
      for (let i = 0; i < 10; i++) {
        document.body.appendChild(document.createElement('div'));
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await monitor.verifyIntegrity();

      expect(result.currentElementCount).toBeGreaterThan(initialCount);
      expect(result.elementCountMatch).toBe(false);
    });

    it('deve incluir contagem de mutações detectadas', async () => {
      await monitor.start();

      document.body.appendChild(document.createElement('div'));
      document.body.appendChild(document.createElement('span'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await monitor.verifyIntegrity();

      expect(result.mutationsDetected).toBeGreaterThan(0);
    });
  });

  describe('stop', () => {
    it('deve parar monitoramento', async () => {
      await monitor.start();
      expect(monitor.isMonitorActive()).toBe(true);

      monitor.stop();
      expect(monitor.isMonitorActive()).toBe(false);
    });

    it('deve retornar estatísticas ao parar', async () => {
      await monitor.start();

      document.body.appendChild(document.createElement('div'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const stats = monitor.stop();

      expect(stats.totalMutations).toBeGreaterThan(0);
      expect(stats.baseline).not.toBeNull();
      expect(stats.mutations.length).toBeGreaterThan(0);
    });

    it('deve parar de detectar mutações após stop', async () => {
      await monitor.start();
      monitor.stop();

      const countBefore = monitor.getMutationCount();

      document.body.appendChild(document.createElement('div'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(monitor.getMutationCount()).toBe(countBefore);
    });
  });

  describe('reset', () => {
    it('deve resetar todo o estado', async () => {
      await monitor.start();

      document.body.appendChild(document.createElement('div'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      monitor.reset();

      expect(monitor.isMonitorActive()).toBe(false);
      expect(monitor.getBaseline()).toBeNull();
      expect(monitor.getMutations()).toHaveLength(0);
      expect(monitor.getMutationCount()).toBe(0);
    });
  });

  describe('getMutations', () => {
    it('deve retornar cópia das mutações (não referência)', async () => {
      await monitor.start();

      document.body.appendChild(document.createElement('div'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      const mutations1 = monitor.getMutations();
      const mutations2 = monitor.getMutations();

      expect(mutations1).not.toBe(mutations2);
      expect(mutations1).toEqual(mutations2);
    });

    it('deve incluir informações completas da mutação', async () => {
      await monitor.start();

      const newDiv = document.createElement('div');
      newDiv.id = 'test-div';
      document.body.appendChild(newDiv);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mutations = monitor.getMutations();
      const addMutation = mutations.find((m) => m.type === 'childList' && (m.addedNodes ?? 0) > 0);

      expect(addMutation).toBeDefined();
      expect(addMutation?.timestamp).toBeGreaterThan(0);
      expect(addMutation?.mutationNumber).toBeGreaterThan(0);
      expect(addMutation?.target).toBeDefined();
    });
  });
});
