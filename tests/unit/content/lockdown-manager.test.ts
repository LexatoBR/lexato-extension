/**
 * Testes unitários para LockdownSecurityManager
 *
 * Testa todas as proteções de segurança do modo lockdown
 *
 * @see Requirements 5.1-5.18, 19.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LockdownSecurityManager } from '@content/lockdown-manager';
import { AuditLogger } from '@lib/audit-logger';

describe('LockdownSecurityManager', () => {
  let lockdown: LockdownSecurityManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    logger = new AuditLogger();
    lockdown = new LockdownSecurityManager(logger);

    // Mock window dimensions para DevTools detection
    Object.defineProperty(window, 'outerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 1080, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true, configurable: true });

    // Garantir que document.body existe
    if (!document.body) {
      document.body = document.createElement('body');
    }
  });

  afterEach(() => {
    // Garantir que lockdown seja desativado após cada teste
    if (lockdown.isLockdownActive()) {
      lockdown.deactivate();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('deve criar instância com estado inicial correto', () => {
      expect(lockdown.isLockdownActive()).toBe(false);
      expect(lockdown.getActiveProtections()).toHaveLength(0);
      expect(lockdown.getViolations()).toHaveLength(0);
    });
  });

  describe('activate', () => {
    it('deve ativar lockdown com sucesso', async () => {
      const result = await lockdown.activate();

      expect(result.success).toBe(true);
      expect(result.protections.length).toBeGreaterThan(0);
      expect(result.baselineSnapshot).toBeDefined();
      expect(lockdown.isLockdownActive()).toBe(true);
    });

    it('deve capturar baseline do DOM', async () => {
      const result = await lockdown.activate();

      expect(result.baselineSnapshot.hash).toBeDefined();
      expect(result.baselineSnapshot.hash.length).toBe(64); // SHA-256 hex
      expect(result.baselineSnapshot.timestamp).toBeGreaterThan(0);
    });

    it('deve retornar sucesso se já estiver ativo', async () => {
      await lockdown.activate();
      const result = await lockdown.activate();

      expect(result.success).toBe(true);
    });

    it('deve incluir proteções básicas', async () => {
      const result = await lockdown.activate();

      expect(result.protections).toContain('baseline-captured');
      expect(result.protections).toContain('keyboard-blocked');
      expect(result.protections).toContain('context-menu-blocked');
      expect(result.protections).toContain('selection-drag-blocked');
      expect(result.protections).toContain('printing-blocked');
      expect(result.protections).toContain('clipboard-blocked');
    });

    it('deve ativar lockdown mesmo com Side Panel aberto (sem falso-positivo de DevTools)', async () => {
      // Simular Side Panel aberto (~320px de diferença)
      // Antes causava falso-positivo de DevTools
      Object.defineProperty(window, 'innerWidth', { value: 1700, writable: true, configurable: true });

      const result = await lockdown.activate();

      // Deve ativar com sucesso - detecção por dimensões foi desabilitada
      // A proteção contra DevTools é feita pelo bloqueio de atalhos (lockdown-injector.ts)
      expect(result.success).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('deve desativar lockdown e retornar relatório', async () => {
      await lockdown.activate();
      const result = lockdown.deactivate();

      expect(result.protections.length).toBeGreaterThan(0);
      expect(result.violations).toBeDefined();
      expect(result.totalViolations).toBe(result.violations.length);
      expect(lockdown.isLockdownActive()).toBe(false);
    });

    it('deve retornar relatório vazio se não estiver ativo', () => {
      const result = lockdown.deactivate();

      expect(result.protections).toHaveLength(0);
      expect(result.violations).toHaveLength(0);
      expect(result.totalViolations).toBe(0);
    });

    it('deve limpar estado após desativação', async () => {
      await lockdown.activate();
      lockdown.deactivate();

      expect(lockdown.getActiveProtections()).toHaveLength(0);
      expect(lockdown.getViolations()).toHaveLength(0);
    });
  });

  describe('bloqueio de teclado (Requirement 5.1, 5.15)', () => {
    it('deve bloquear teclas normais e registrar violação', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'keyboard-blocked')).toBe(true);
    });

    it('deve permitir tecla Escape sem registrar violação', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(event);

      // Escape não deve gerar violação de keyboard-blocked
      const escapeViolations = lockdown.getViolations().filter(
        (v) => v.type === 'keyboard-blocked' && (v.details as { key?: string }).key === 'Escape'
      );
      expect(escapeViolations).toHaveLength(0);
    });

    it('deve bloquear keyup e keypress também', async () => {
      await lockdown.activate();

      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keypress', { key: 'c', bubbles: true, cancelable: true }));

      const violations = lockdown.getViolations();
      expect(violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('bloqueio de atalhos DevTools (Requirement 5.3)', () => {
    it('deve bloquear F12', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'F12',
        keyCode: 123,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'devtools-shortcut')).toBe(true);
    });

    it('deve bloquear Ctrl+Shift+I', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'I',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'devtools-shortcut')).toBe(true);
    });

    it('deve bloquear Ctrl+Shift+J', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'J',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'devtools-shortcut')).toBe(true);
    });

    it('deve bloquear Ctrl+Shift+C', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'C',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'devtools-shortcut')).toBe(true);
    });
  });

  describe('bloqueio de atalhos gerais (Requirement 5.3)', () => {
    it('deve bloquear Ctrl+U (View Source)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'U',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'blocked-shortcut')).toBe(true);
    });

    it('deve bloquear Ctrl+P (Print)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'P',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'blocked-shortcut')).toBe(true);
    });

    it('deve bloquear Ctrl+S (Save)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'S',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'blocked-shortcut')).toBe(true);
    });
  });

  describe('bloqueio de copiar/colar (Requirement 5.4)', () => {
    it('deve bloquear Ctrl+C (Copy)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'C',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'copy-paste-blocked')).toBe(true);
    });

    it('deve bloquear Ctrl+V (Paste)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'V',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'copy-paste-blocked')).toBe(true);
    });

    it('deve bloquear Ctrl+X (Cut)', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'X',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'copy-paste-blocked')).toBe(true);
    });

    it('deve bloquear eventos de clipboard via Event genérico', async () => {
      await lockdown.activate();

      // Usar Event genérico já que ClipboardEvent pode não estar disponível no jsdom
      const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
      document.dispatchEvent(copyEvent);

      const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
      document.dispatchEvent(pasteEvent);

      const cutEvent = new Event('cut', { bubbles: true, cancelable: true });
      document.dispatchEvent(cutEvent);

      const violations = lockdown.getViolations();
      expect(violations.some((v) => v.type === 'clipboard-copy-blocked')).toBe(true);
      expect(violations.some((v) => v.type === 'clipboard-paste-blocked')).toBe(true);
      expect(violations.some((v) => v.type === 'clipboard-cut-blocked')).toBe(true);
    });
  });

  describe('bloqueio de menu de contexto (Requirement 5.2)', () => {
    it('deve bloquear menu de contexto', async () => {
      await lockdown.activate();

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'context-menu-blocked')).toBe(true);
    });
  });

  describe('bloqueio de seleção e drag (Requirements 5.5, 5.6)', () => {
    it('deve bloquear selectstart', async () => {
      await lockdown.activate();

      const event = new Event('selectstart', { bubbles: true, cancelable: true });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'selection-blocked')).toBe(true);
    });

    it('deve bloquear dragstart via Event genérico', async () => {
      await lockdown.activate();

      // Usar Event genérico já que DragEvent pode não estar disponível no jsdom
      const event = new Event('dragstart', { bubbles: true, cancelable: true });
      document.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'drag-blocked')).toBe(true);
    });
  });

  describe('bloqueio de impressão (Requirement 5.7)', () => {
    it('deve bloquear beforeprint', async () => {
      await lockdown.activate();

      const event = new Event('beforeprint', { bubbles: true, cancelable: true });
      window.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'print-blocked')).toBe(true);
    });

    it('deve bloquear afterprint', async () => {
      await lockdown.activate();

      const event = new Event('afterprint', { bubbles: true, cancelable: true });
      window.dispatchEvent(event);

      expect(lockdown.getViolations().some((v) => v.type === 'print-blocked')).toBe(true);
    });
  });

  describe('detecção de DevTools (Requirement 5.12)', () => {
    it('deve retornar false sempre - detecção por dimensões desabilitada', () => {
      // A detecção por dimensões (outerWidth - innerWidth) foi desabilitada
      // porque causa falsos positivos com Side Panel do Chrome aberto (~320px).
      // A proteção contra DevTools é garantida pelo bloqueio de atalhos
      // no lockdown-injector.ts (mundo MAIN): F12, Ctrl+Shift+I/J/C, Ctrl+U.
      Object.defineProperty(window, 'innerWidth', { value: 1700, writable: true, configurable: true });
      expect(lockdown.isDevToolsOpen()).toBe(false);
    });

    it('deve retornar false com dimensões normais', () => {
      expect(lockdown.isDevToolsOpen()).toBe(false);
    });

    it('deve retornar false mesmo com diferença grande de altura', () => {
      Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true });
      expect(lockdown.isDevToolsOpen()).toBe(false);
    });
  });

  describe('monitoramento contínuo (Requirement 5.14)', () => {
    it('deve iniciar monitoramento contínuo', async () => {
      const result = await lockdown.activate();

      expect(result.protections).toContain('continuous-monitoring');
    });

    it('deve registrar callback de DevTools sem disparar por dimensões', async () => {
      // O callback de DevTools ainda pode ser registrado (para violações de atalhos
      // reportadas pelo mundo MAIN), mas o monitoramento por dimensões não o dispara mais.
      const callback = vi.fn();
      lockdown.onDevToolsDetected(callback);

      await lockdown.activate();

      // Simular diferença de dimensões (Side Panel aberto, por exemplo)
      Object.defineProperty(window, 'innerWidth', { value: 1700, writable: true, configurable: true });

      // Avançar o timer para o próximo ciclo de monitoramento
      vi.advanceTimersByTime(600);

      // Callback NÃO deve ser chamado - detecção por dimensões desabilitada
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('registro de violações (Requirement 5.17)', () => {
    it('deve registrar violações com timestamp', async () => {
      await lockdown.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      const violations = lockdown.getViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]?.timestamp).toBeGreaterThan(0);
      expect(violations[0]?.type).toBeDefined();
      expect(violations[0]?.details).toBeDefined();
    });

    it('deve acumular múltiplas violações', async () => {
      await lockdown.activate();

      // Gerar várias violações
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
      document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      const violations = lockdown.getViolations();
      expect(violations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('proteção de funções nativas (Requirement 5.11)', () => {
    it('deve tentar congelar protótipos sem causar erro', async () => {
      const result = await lockdown.activate();

      // A proteção pode ou não estar presente dependendo do ambiente
      // O importante é que não cause erro e o lockdown seja ativado
      expect(result.success).toBe(true);
    });
  });

  describe('getters', () => {
    it('deve retornar cópia das proteções ativas', async () => {
      await lockdown.activate();

      const protections1 = lockdown.getActiveProtections();
      const protections2 = lockdown.getActiveProtections();

      expect(protections1).not.toBe(protections2);
      expect(protections1).toEqual(protections2);
    });

    it('deve retornar cópia das violações', async () => {
      await lockdown.activate();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));

      const violations1 = lockdown.getViolations();
      const violations2 = lockdown.getViolations();

      expect(violations1).not.toBe(violations2);
      expect(violations1).toEqual(violations2);
    });
  });
});
