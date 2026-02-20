/**
 * Testes unitários para o módulo PermissionPreflight
 *
 * Verifica o comportamento do pré-flight de permissões que deve ser
 * executado no popup/sidepanel antes de iniciar capturas.
 *
 * @module PermissionPreflightTest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runPermissionPreflight,
  preflightScreenshotPermissions,
  preflightVideoPermissions,
  preflightNotificationPermission,
  notifyServiceWorkerPermissionsGranted,
} from '../../../../src/lib/permissions/permission-preflight';
import { permissionHelper } from '../../../../src/lib/permissions/permission-helper';
import type { OptionalPermission } from '../../../../src/lib/permissions/permission-helper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/lib/permissions/permission-helper', () => {
  return {
    permissionHelper: {
      hasPermission: vi.fn(),
      requestPermission: vi.fn(),
      withPermission: vi.fn(),
      clearCache: vi.fn(),
    },
  };
});

// Mock do chrome.runtime.sendMessage
const mockSendMessage = vi.fn();
globalThis.chrome = {
  ...globalThis.chrome,
  runtime: {
    ...globalThis.chrome?.runtime,
    sendMessage: mockSendMessage,
  },
} as unknown as typeof chrome;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedHasPermission = vi.mocked(permissionHelper.hasPermission);
const mockedRequestPermission = vi.mocked(permissionHelper.requestPermission);

function setupPermissionMocks(
  alreadyGranted: OptionalPermission[] = [],
  userGrants: OptionalPermission[] = [],
) {
  mockedHasPermission.mockImplementation(async (perm: OptionalPermission) => {
    return alreadyGranted.includes(perm);
  });

  mockedRequestPermission.mockImplementation(async (perm: OptionalPermission) => {
    return userGrants.includes(perm);
  });
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('PermissionPreflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
  });

  describe('runPermissionPreflight', () => {
    it('deve retornar allGranted=true quando todas as permissões já estão concedidas', async () => {
      setupPermissionMocks(['management', 'geolocation'], []);

      const result = await runPermissionPreflight(['management', 'geolocation']);

      expect(result.allGranted).toBe(true);
      expect(result.granted).toEqual(['management', 'geolocation']);
      expect(result.denied).toEqual([]);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].wasAlreadyGranted).toBe(true);
      expect(result.results[1].wasAlreadyGranted).toBe(true);
      // Não deve chamar requestPermission se já concedida
      expect(mockedRequestPermission).not.toHaveBeenCalled();
    });

    it('deve solicitar permissões não concedidas e retornar resultado correto', async () => {
      setupPermissionMocks([], ['management', 'geolocation']);

      const result = await runPermissionPreflight(['management', 'geolocation']);

      expect(result.allGranted).toBe(true);
      expect(result.granted).toEqual(['management', 'geolocation']);
      expect(result.denied).toEqual([]);
      expect(mockedRequestPermission).toHaveBeenCalledTimes(2);
    });

    it('deve registrar permissões recusadas pelo usuário', async () => {
      setupPermissionMocks([], ['management']); // Apenas management concedida

      const result = await runPermissionPreflight(['management', 'geolocation']);

      expect(result.allGranted).toBe(false);
      expect(result.granted).toEqual(['management']);
      expect(result.denied).toEqual(['geolocation']);
    });

    it('deve misturar permissões já concedidas com novas solicitações', async () => {
      setupPermissionMocks(['management'], ['notifications']);

      const result = await runPermissionPreflight(['management', 'geolocation', 'notifications']);

      expect(result.allGranted).toBe(false);
      expect(result.granted).toEqual(['management', 'notifications']);
      expect(result.denied).toEqual(['geolocation']);
      // management já concedida, não deve solicitar
      expect(mockedRequestPermission).toHaveBeenCalledTimes(2);
      expect(mockedRequestPermission).toHaveBeenCalledWith('geolocation');
      expect(mockedRequestPermission).toHaveBeenCalledWith('notifications');
    });

    it('deve retornar lista vazia quando nenhuma permissão é solicitada', async () => {
      const result = await runPermissionPreflight([]);

      expect(result.allGranted).toBe(true);
      expect(result.granted).toEqual([]);
      expect(result.denied).toEqual([]);
      expect(result.results).toHaveLength(0);
    });

    it('deve marcar wasAlreadyGranted=false para permissões recém-concedidas', async () => {
      setupPermissionMocks([], ['tabCapture']);

      const result = await runPermissionPreflight(['tabCapture']);

      expect(result.results[0].wasAlreadyGranted).toBe(false);
      expect(result.results[0].granted).toBe(true);
    });
  });

  describe('preflightScreenshotPermissions', () => {
    it('deve solicitar management, geolocation e notifications', async () => {
      setupPermissionMocks([], ['management', 'geolocation', 'notifications']);

      const result = await preflightScreenshotPermissions();

      expect(result.allGranted).toBe(true);
      expect(result.granted).toContain('management');
      expect(result.granted).toContain('geolocation');
      expect(result.granted).toContain('notifications');
      expect(result.granted).not.toContain('tabCapture');
    });
  });

  describe('preflightVideoPermissions', () => {
    it('deve solicitar tabCapture, management, geolocation e notifications', async () => {
      setupPermissionMocks(
        [],
        ['tabCapture', 'management', 'geolocation', 'notifications'],
      );

      const result = await preflightVideoPermissions();

      expect(result.allGranted).toBe(true);
      expect(result.granted).toContain('tabCapture');
      expect(result.granted).toContain('management');
      expect(result.granted).toContain('geolocation');
      expect(result.granted).toContain('notifications');
    });

    it('deve permitir degradação graciosa quando apenas tabCapture é concedida', async () => {
      setupPermissionMocks([], ['tabCapture']);

      const result = await preflightVideoPermissions();

      expect(result.allGranted).toBe(false);
      expect(result.granted).toContain('tabCapture');
      expect(result.denied).toContain('management');
      expect(result.denied).toContain('geolocation');
      expect(result.denied).toContain('notifications');
    });
  });

  describe('preflightNotificationPermission', () => {
    it('deve retornar true quando permissão já está concedida', async () => {
      setupPermissionMocks(['notifications'], []);

      const result = await preflightNotificationPermission();

      expect(result).toBe(true);
      expect(mockedRequestPermission).not.toHaveBeenCalled();
    });

    it('deve solicitar e retornar true quando usuário concede', async () => {
      setupPermissionMocks([], ['notifications']);

      const result = await preflightNotificationPermission();

      expect(result).toBe(true);
      expect(mockedRequestPermission).toHaveBeenCalledWith('notifications');
    });

    it('deve retornar false quando usuário recusa', async () => {
      setupPermissionMocks([], []);

      const result = await preflightNotificationPermission();

      expect(result).toBe(false);
    });
  });

  describe('notifyServiceWorkerPermissionsGranted', () => {
    it('deve enviar mensagem com permissões concedidas', async () => {
      await notifyServiceWorkerPermissionsGranted(['management', 'tabCapture']);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'PERMISSIONS_GRANTED',
        permissions: ['management', 'tabCapture'],
      });
    });

    it('não deve enviar mensagem quando lista está vazia', async () => {
      await notifyServiceWorkerPermissionsGranted([]);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('não deve lançar erro quando Service Worker não está ativo', async () => {
      mockSendMessage.mockRejectedValue(new Error('Could not establish connection'));

      // Não deve lançar exceção
      await expect(
        notifyServiceWorkerPermissionsGranted(['management']),
      ).resolves.toBeUndefined();
    });
  });
});
