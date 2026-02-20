/**
 * Testes unitários para NotificationManager
 *
 * Testa gerenciamento de notificações do sistema.
 *
 * @module NotificationManagerTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NotificationManager,
  getNotificationManager,
  resetNotificationManager,
  type NotificationData,
} from '../../../src/background/notification-manager';
import { AuditLogger } from '../../../src/lib/audit-logger';

describe('NotificationManager', () => {
  let manager: NotificationManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationManager();
    logger = new AuditLogger();
    manager = new NotificationManager(logger);

    // Mock chrome.storage.local.get para retornar notificações habilitadas
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys?: string | string[] | Record<string, unknown> | null) =>
        Promise.resolve({
          lexato_settings: { notificationsEnabled: true },
        })
    );

    // Mock chrome.notifications.create para chamar callback
    vi.mocked(chrome.notifications.create).mockImplementation((...args: unknown[]) => {
      // A API pode ser chamada com (id, options, callback) ou (options, callback)
      const callback = args[args.length - 1] as ((id: string) => void) | undefined;
      const notificationId = typeof args[0] === 'string' ? args[0] : `lexato_${Date.now()}`;
      if (typeof callback === 'function') {
        callback(notificationId);
      }
    });

    // Mock chrome.notifications.clear para chamar callback
    vi.mocked(chrome.notifications.clear).mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as ((wasCleared: boolean) => void) | undefined;
      if (typeof callback === 'function') {
        callback(true);
      }
    });

    // Mock chrome.runtime.getURL
    vi.mocked(chrome.runtime.getURL).mockImplementation(
      (path: string) => `chrome-extension://test-id/${path}`
    );

    // Mock chrome.tabs.create
    vi.mocked(chrome.tabs.create).mockImplementation(() => Promise.resolve({} as chrome.tabs.Tab));
  });

  afterEach(() => {
    resetNotificationManager();
  });

  describe('initialize', () => {
    it('deve registrar listener de clique', () => {
      manager.initialize();

      expect(chrome.notifications.onClicked.addListener).toHaveBeenCalledTimes(1);
    });

    it('não deve registrar listener duplicado', () => {
      manager.initialize();
      manager.initialize();

      expect(chrome.notifications.onClicked.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('areNotificationsEnabled', () => {
    it('deve retornar true quando habilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: true } })
      );

      const enabled = await manager.areNotificationsEnabled();

      expect(enabled).toBe(true);
    });

    it('deve retornar false quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const enabled = await manager.areNotificationsEnabled();

      expect(enabled).toBe(false);
    });

    it('deve retornar true quando configuração não existe', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(() => Promise.resolve({}));

      const enabled = await manager.areNotificationsEnabled();

      expect(enabled).toBe(true);
    });

    it('deve retornar true em caso de erro', async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(new Error('Storage error'));

      const enabled = await manager.areNotificationsEnabled();

      expect(enabled).toBe(true);
    });
  });

  describe('notify', () => {
    it('deve criar notificação com dados corretos', async () => {
      const data: NotificationData = {
        type: 'info',
        title: 'Teste',
        message: 'Mensagem de teste',
      };

      const notificationId = await manager.notify(data);

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      // Verificar argumentos da chamada
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![0]).toContain('lexato_');
      expect(callArgs![1]).toMatchObject({
        type: 'basic',
        title: 'Teste',
        message: 'Mensagem de teste',
      });
    });

    it('não deve criar notificação quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const data: NotificationData = {
        type: 'info',
        title: 'Teste',
        message: 'Mensagem',
      };

      const notificationId = await manager.notify(data);

      expect(notificationId).toBeNull();
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('deve criar notificação com force mesmo quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const data: NotificationData = {
        type: 'error',
        title: 'Erro Crítico',
        message: 'Mensagem importante',
      };

      const notificationId = await manager.notify(data, { force: true });

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
    });

    it('deve armazenar dados da notificação', async () => {
      const data: NotificationData = {
        type: 'capture_complete',
        title: 'Captura',
        message: 'Concluída',
        captureId: 'cap-123',
      };

      const notificationId = await manager.notify(data);

      expect(notificationId).toBeTruthy();
      if (notificationId) {
        const storedData = manager.getNotificationData(notificationId);
        expect(storedData).toEqual(data);
      }
    });

    it('deve retornar null em caso de erro', async () => {
      vi.mocked(chrome.notifications.create).mockImplementation((...args: unknown[]) => {
        // Simular erro do Chrome
        Object.defineProperty(chrome.runtime, 'lastError', {
          value: { message: 'Create failed' },
          configurable: true,
        });
        const callback = args[args.length - 1] as ((id: string) => void) | undefined;
        if (typeof callback === 'function') {
          callback('');
        }
        Object.defineProperty(chrome.runtime, 'lastError', {
          value: undefined,
          configurable: true,
        });
      });

      const data: NotificationData = {
        type: 'info',
        title: 'Teste',
        message: 'Mensagem',
      };

      const notificationId = await manager.notify(data);

      expect(notificationId).toBeNull();
    });
  });

  describe('notifyCaptureComplete', () => {
    it('deve criar notificação de screenshot concluído', async () => {
      const notificationId = await manager.notifyCaptureComplete('cap-123', 'screenshot');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Captura Concluída',
      });
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.message).toContain('Screenshot');
    });

    it('deve criar notificação de vídeo concluído', async () => {
      const notificationId = await manager.notifyCaptureComplete('cap-456', 'video');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Captura Concluída',
      });
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.message).toContain('Vídeo');
    });
  });

  describe('notifyUploadComplete', () => {
    it('deve criar notificação de upload concluído', async () => {
      const notificationId = await manager.notifyUploadComplete('cap-789');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Upload Concluído',
      });
    });
  });

  describe('notifyCertificationReady', () => {
    it('deve criar notificação de certificação pronta', async () => {
      const notificationId = await manager.notifyCertificationReady('cap-abc');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.title).toContain('Certificação Pronta');
      expect(options.requireInteraction).toBe(true);
    });

    it('deve incluir URL do certificado quando fornecida', async () => {
      const certUrl = 'https://example.com/cert.pdf';
      const notificationId = await manager.notifyCertificationReady('cap-def', certUrl);

      expect(notificationId).toBeTruthy();
      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.actionUrl).toBe(certUrl);
      }
    });
  });

  describe('notifyError', () => {
    it('deve criar notificação de erro', async () => {
      const notificationId = await manager.notifyError(
        'Erro de Captura',
        'Falha ao capturar página',
        'cap-err'
      );

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Erro de Captura',
        message: 'Falha ao capturar página',
        priority: 2,
        requireInteraction: true,
      });
    });
  });

  describe('notifyWarning', () => {
    it('deve criar notificação de aviso', async () => {
      const notificationId = await manager.notifyWarning('Aviso', 'Mensagem de aviso');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Aviso',
        priority: 1,
      });
    });
  });

  describe('notifyInfo', () => {
    it('deve criar notificação informativa', async () => {
      const notificationId = await manager.notifyInfo('Info', 'Mensagem informativa');

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Info',
        priority: 0,
      });
    });
  });

  describe('clear', () => {
    it('deve limpar notificação existente', async () => {
      // Restaurar mock padrão para clear
      vi.mocked(chrome.notifications.clear).mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1] as ((wasCleared: boolean) => void) | undefined;
        if (typeof callback === 'function') {
          callback(true);
        }
      });

      const data: NotificationData = {
        type: 'info',
        title: 'Teste',
        message: 'Mensagem',
      };

      const notificationId = await manager.notify(data);
      expect(manager.getActiveCount()).toBe(1);

      if (notificationId) {
        const cleared = await manager.clear(notificationId);

        expect(cleared).toBe(true);
        expect(chrome.notifications.clear).toHaveBeenCalled();
        expect(manager.getActiveCount()).toBe(0);
      }
    });

    it('deve retornar false em caso de erro', async () => {
      vi.mocked(chrome.notifications.clear).mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1] as ((wasCleared: boolean) => void) | undefined;
        if (typeof callback === 'function') {
          callback(false);
        }
      });

      const cleared = await manager.clear('invalid-id');

      expect(cleared).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('deve limpar todas as notificações', async () => {
      await manager.notify({ type: 'info', title: 'T1', message: 'M1' });
      await manager.notify({ type: 'info', title: 'T2', message: 'M2' });
      expect(manager.getActiveCount()).toBe(2);

      await manager.clearAll();

      expect(manager.getActiveCount()).toBe(0);
    });
  });

  describe('click callback', () => {
    it('deve chamar callback ao clicar em notificação', async () => {
      manager.initialize();
      const callback = vi.fn();
      manager.setClickCallback(callback);

      const data: NotificationData = {
        type: 'capture_complete',
        title: 'Captura',
        message: 'Concluída',
        captureId: 'cap-click',
        actionUrl: 'https://example.com',
      };

      const notificationId = await manager.notify(data);

      if (notificationId) {
        // Simular clique
        const clickHandler = vi.mocked(chrome.notifications.onClicked.addListener).mock.calls[0]?.[0];
        if (clickHandler) {
          clickHandler(notificationId);
        }

        expect(callback).toHaveBeenCalledWith(notificationId, data);
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
      }
    });
  });

  describe('getNotificationManager singleton', () => {
    it('deve retornar mesma instância', () => {
      const instance1 = getNotificationManager();
      const instance2 = getNotificationManager();

      expect(instance1).toBe(instance2);
    });

    it('deve criar nova instância após reset', () => {
      const instance1 = getNotificationManager();
      resetNotificationManager();
      const instance2 = getNotificationManager();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getActiveCount', () => {
    it('deve retornar contagem correta', async () => {
      expect(manager.getActiveCount()).toBe(0);

      await manager.notify({ type: 'info', title: 'T1', message: 'M1' });
      expect(manager.getActiveCount()).toBe(1);

      await manager.notify({ type: 'info', title: 'T2', message: 'M2' });
      expect(manager.getActiveCount()).toBe(2);
    });
  });
});


describe('Notificações de Preview (Requisito 12)', () => {
  let manager: NotificationManager;
  let logger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationManager();
    logger = new AuditLogger();
    manager = new NotificationManager(logger);

    // Mock chrome.storage.local.get para retornar notificações habilitadas
    vi.mocked(chrome.storage.local.get).mockImplementation(
      () => Promise.resolve({ lexato_settings: { notificationsEnabled: true } })
    );

    // Mock chrome.notifications.create para chamar callback
    vi.mocked(chrome.notifications.create).mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as ((id: string) => void) | undefined;
      const notificationId = typeof args[0] === 'string' ? args[0] : `lexato_${Date.now()}`;
      if (typeof callback === 'function') {
        callback(notificationId);
      }
    });

    // Mock chrome.runtime.getURL
    vi.mocked(chrome.runtime.getURL).mockImplementation(
      (path: string) => `chrome-extension://test-id/${path}`
    );

    // Mock chrome.tabs.create
    vi.mocked(chrome.tabs.create).mockImplementation(() => Promise.resolve({} as chrome.tabs.Tab));
  });

  afterEach(() => {
    resetNotificationManager();
  });

  describe('notifyPreviewReminder (13.1)', () => {
    it('deve criar notificação de lembrete com título correto', async () => {
      const evidenceId = 'evidence-123';
      const notificationId = await manager.notifyPreviewReminder(evidenceId);

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: 'Captura Pendente',
      });
    });

    it('deve incluir mensagem sobre 15 minutos', async () => {
      const evidenceId = 'evidence-456';
      await manager.notifyPreviewReminder(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.message).toContain('15 minutos');
    });

    it('deve incluir URL de preview correta', async () => {
      const evidenceId = 'evidence-789';
      const notificationId = await manager.notifyPreviewReminder(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.actionUrl).toBe(`https://app.lexato.com.br/preview/${evidenceId}`);
        expect(data?.captureId).toBe(evidenceId);
      }
    });

    it('deve ter prioridade média (1)', async () => {
      const evidenceId = 'evidence-priority';
      await manager.notifyPreviewReminder(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.priority).toBe(1);
    });

    it('deve ter tipo preview_reminder', async () => {
      const evidenceId = 'evidence-type';
      const notificationId = await manager.notifyPreviewReminder(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.type).toBe('preview_reminder');
      }
    });
  });

  describe('notifyPreviewUrgent (13.2)', () => {
    it('deve criar notificação urgente com título correto', async () => {
      const evidenceId = 'evidence-urgent-123';
      const notificationId = await manager.notifyPreviewUrgent(evidenceId);

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: '⚠️ Captura Expirando!',
      });
    });

    it('deve incluir mensagem sobre 5 minutos', async () => {
      const evidenceId = 'evidence-urgent-456';
      await manager.notifyPreviewUrgent(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.message).toContain('5 minutos');
    });

    it('deve incluir URL de preview correta', async () => {
      const evidenceId = 'evidence-urgent-789';
      const notificationId = await manager.notifyPreviewUrgent(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.actionUrl).toBe(`https://app.lexato.com.br/preview/${evidenceId}`);
        expect(data?.captureId).toBe(evidenceId);
      }
    });

    it('deve ter prioridade alta (2)', async () => {
      const evidenceId = 'evidence-urgent-priority';
      await manager.notifyPreviewUrgent(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.priority).toBe(2);
    });

    it('deve requerer interação (não fecha automaticamente)', async () => {
      const evidenceId = 'evidence-urgent-interaction';
      await manager.notifyPreviewUrgent(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.requireInteraction).toBe(true);
    });

    it('deve ter tipo preview_urgent', async () => {
      const evidenceId = 'evidence-urgent-type';
      const notificationId = await manager.notifyPreviewUrgent(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.type).toBe('preview_urgent');
      }
    });
  });

  describe('notifyPreviewExpired (13.3)', () => {
    it('deve criar notificação de expiração com título correto', async () => {
      const evidenceId = 'evidence-expired-123';
      const notificationId = await manager.notifyPreviewExpired(evidenceId);

      expect(notificationId).toBeTruthy();
      expect(chrome.notifications.create).toHaveBeenCalled();
      
      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![1]).toMatchObject({
        title: '❌ Captura Expirada',
      });
    });

    it('deve incluir mensagem sobre expiração e descarte', async () => {
      const evidenceId = 'evidence-expired-456';
      await manager.notifyPreviewExpired(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.message).toContain('expirou');
      expect(options.message).toContain('descartada');
    });

    it('deve redirecionar para lista de evidências (não preview)', async () => {
      const evidenceId = 'evidence-expired-789';
      const notificationId = await manager.notifyPreviewExpired(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.actionUrl).toBe('https://app.lexato.com.br/evidencias');
        expect(data?.captureId).toBe(evidenceId);
      }
    });

    it('deve ter prioridade alta (2)', async () => {
      const evidenceId = 'evidence-expired-priority';
      await manager.notifyPreviewExpired(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.priority).toBe(2);
    });

    it('deve requerer interação (não fecha automaticamente)', async () => {
      const evidenceId = 'evidence-expired-interaction';
      await manager.notifyPreviewExpired(evidenceId);

      const callArgs = vi.mocked(chrome.notifications.create).mock.calls[0];
      const options = callArgs![1] as chrome.notifications.NotificationOptions;
      expect(options.requireInteraction).toBe(true);
    });

    it('deve ter tipo preview_expired', async () => {
      const evidenceId = 'evidence-expired-type';
      const notificationId = await manager.notifyPreviewExpired(evidenceId);

      if (notificationId) {
        const data = manager.getNotificationData(notificationId);
        expect(data?.type).toBe('preview_expired');
      }
    });
  });

  describe('Respeito às configurações do usuário (13.5)', () => {
    it('não deve criar notificação de lembrete quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const notificationId = await manager.notifyPreviewReminder('evidence-disabled');

      expect(notificationId).toBeNull();
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('não deve criar notificação urgente quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const notificationId = await manager.notifyPreviewUrgent('evidence-disabled');

      expect(notificationId).toBeNull();
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('não deve criar notificação de expiração quando desabilitado', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation(
        () => Promise.resolve({ lexato_settings: { notificationsEnabled: false } })
      );

      const notificationId = await manager.notifyPreviewExpired('evidence-disabled');

      expect(notificationId).toBeNull();
      expect(chrome.notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('Click handler para abrir preview (13.4)', () => {
    it('deve abrir URL de preview ao clicar em notificação de lembrete', async () => {
      manager.initialize();
      const evidenceId = 'evidence-click-reminder';
      const notificationId = await manager.notifyPreviewReminder(evidenceId);

      if (notificationId) {
        // Simular clique
        const clickHandler = vi.mocked(chrome.notifications.onClicked.addListener).mock.calls[0]?.[0];
        if (clickHandler) {
          clickHandler(notificationId);
        }

        expect(chrome.tabs.create).toHaveBeenCalledWith({
          url: `https://app.lexato.com.br/preview/${evidenceId}`,
        });
      }
    });

    it('deve abrir URL de preview ao clicar em notificação urgente', async () => {
      manager.initialize();
      const evidenceId = 'evidence-click-urgent';
      const notificationId = await manager.notifyPreviewUrgent(evidenceId);

      if (notificationId) {
        // Simular clique
        const clickHandler = vi.mocked(chrome.notifications.onClicked.addListener).mock.calls[0]?.[0];
        if (clickHandler) {
          clickHandler(notificationId);
        }

        expect(chrome.tabs.create).toHaveBeenCalledWith({
          url: `https://app.lexato.com.br/preview/${evidenceId}`,
        });
      }
    });

    it('deve abrir lista de evidências ao clicar em notificação de expiração', async () => {
      manager.initialize();
      const evidenceId = 'evidence-click-expired';
      const notificationId = await manager.notifyPreviewExpired(evidenceId);

      if (notificationId) {
        // Simular clique
        const clickHandler = vi.mocked(chrome.notifications.onClicked.addListener).mock.calls[0]?.[0];
        if (clickHandler) {
          clickHandler(notificationId);
        }

        expect(chrome.tabs.create).toHaveBeenCalledWith({
          url: 'https://app.lexato.com.br/evidencias',
        });
      }
    });
  });
});
