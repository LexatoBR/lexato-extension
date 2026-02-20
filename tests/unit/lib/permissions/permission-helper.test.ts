/**
 * Testes unitários para o módulo PermissionHelper
 *
 * Testa verificação, solicitação, cache e degradação graciosa
 * de permissões opcionais da extensão Lexato.
 *
 * @module PermissionHelper.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createPermissionHelper,
  type PermissionHelper,
  type OptionalPermission,
  type PermissionCacheData,
} from '@lib/permissions/permission-helper';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

/** TTL padrão do cache: 5 minutos */
const DEFAULT_TTL = 5 * 60 * 1000;

/** Chave de armazenamento do cache */
const CACHE_KEY = 'permissionCache';

/**
 * Referências tipadas para os mocks do chrome.
 * Evita problemas de tipagem com vi.mocked() sobre o objeto global chrome.
 */
const sessionGet = chrome.storage.session.get as unknown as Mock;
const sessionSet = chrome.storage.session.set as unknown as Mock;
const sessionRemove = chrome.storage.session.remove as unknown as Mock;
const permContains = chrome.permissions.contains as unknown as Mock;
const permRequest = chrome.permissions.request as unknown as Mock;

/**
 * Configura o mock de chrome.storage.session.get para retornar dados específicos.
 */
function mockSessionGet(data: PermissionCacheData | null): void {
  sessionGet.mockResolvedValue(data ? { [CACHE_KEY]: data } : {});
}

/**
 * Configura o mock de chrome.storage.session.get para retornar cache
 * com uma permissão específica já verificada.
 */
function mockCachedPermission(
  permission: OptionalPermission,
  granted: boolean,
  ageMs: number = 0,
): void {
  const cache: PermissionCacheData = {
    state: { [permission]: granted },
    lastChecked: { [permission]: Date.now() - ageMs },
    ttl: DEFAULT_TTL,
  };
  mockSessionGet(cache);
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('PermissionHelper', () => {
  let helper: PermissionHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    // Padrão: cache vazio
    mockSessionGet(null);
    helper = createPermissionHelper();
  });

  // =========================================================================
  // hasPermission
  // =========================================================================

  describe('hasPermission', () => {
    it('deve consultar chrome.permissions.contains quando cache está vazio', async () => {
      permContains.mockResolvedValue(true);

      const result = await helper.hasPermission('management');

      expect(permContains).toHaveBeenCalledWith({
        permissions: ['management'],
      });
      expect(result).toBe(true);
    });

    it('deve retornar false quando permissão não está concedida', async () => {
      permContains.mockResolvedValue(false);

      const result = await helper.hasPermission('geolocation');

      expect(result).toBe(false);
    });

    it('deve usar cache quando entrada é válida (dentro do TTL)', async () => {
      // Cache com permissão concedida há 1 minuto (dentro do TTL de 5 min)
      mockCachedPermission('notifications', true, 60_000);

      const result = await helper.hasPermission('notifications');

      expect(result).toBe(true);
      // Não deve chamar a API do Chrome quando o cache é válido
      expect(permContains).not.toHaveBeenCalled();
    });

    it('deve ignorar cache quando TTL expirou', async () => {
      // Cache com permissão verificada há 6 minutos (TTL de 5 min expirado)
      mockCachedPermission('tabCapture', true, 6 * 60 * 1000);
      permContains.mockResolvedValue(false);

      const result = await helper.hasPermission('tabCapture');

      // Deve consultar a API pois o cache expirou
      expect(permContains).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('deve atualizar cache após consultar chrome.permissions.contains', async () => {
      permContains.mockResolvedValue(true);

      await helper.hasPermission('management');

      expect(sessionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          [CACHE_KEY]: expect.objectContaining({
            state: expect.objectContaining({ management: true }),
            lastChecked: expect.objectContaining({
              management: expect.any(Number),
            }),
            ttl: DEFAULT_TTL,
          }),
        }),
      );
    });

    it('deve retornar false quando chrome.permissions.contains lança erro', async () => {
      permContains.mockRejectedValue(new Error('API indisponível'));

      const result = await helper.hasPermission('management');

      expect(result).toBe(false);
    });

    it('deve retornar false para permissão inválida', async () => {
      const result = await helper.hasPermission(
        'invalidPermission' as OptionalPermission,
      );

      expect(result).toBe(false);
      expect(permContains).not.toHaveBeenCalled();
    });

    it('deve retornar false quando cache tem estado false e está dentro do TTL', async () => {
      mockCachedPermission('geolocation', false, 60_000);

      const result = await helper.hasPermission('geolocation');

      expect(result).toBe(false);
      expect(permContains).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // requestPermission
  // =========================================================================

  describe('requestPermission', () => {
    it('deve chamar chrome.permissions.request quando cache está vazio', async () => {
      permRequest.mockResolvedValue(true);

      const result = await helper.requestPermission('management');

      expect(permRequest).toHaveBeenCalledWith({
        permissions: ['management'],
      });
      expect(result).toBe(true);
    });

    it('deve retornar true sem chamar request quando cache indica permissão concedida', async () => {
      mockCachedPermission('notifications', true, 60_000);

      const result = await helper.requestPermission('notifications');

      expect(result).toBe(true);
      expect(permRequest).not.toHaveBeenCalled();
    });

    it('deve chamar request quando cache indica permissão recusada', async () => {
      mockCachedPermission('tabCapture', false, 60_000);
      permRequest.mockResolvedValue(true);

      const result = await helper.requestPermission('tabCapture');

      expect(permRequest).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('deve retornar false quando usuário recusa a permissão', async () => {
      permRequest.mockResolvedValue(false);

      const result = await helper.requestPermission('geolocation');

      expect(result).toBe(false);
    });

    it('deve atualizar cache após solicitação bem-sucedida', async () => {
      permRequest.mockResolvedValue(true);

      await helper.requestPermission('management');

      expect(sessionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          [CACHE_KEY]: expect.objectContaining({
            state: expect.objectContaining({ management: true }),
          }),
        }),
      );
    });

    it('deve atualizar cache com false quando usuário recusa', async () => {
      permRequest.mockResolvedValue(false);

      await helper.requestPermission('geolocation');

      expect(sessionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          [CACHE_KEY]: expect.objectContaining({
            state: expect.objectContaining({ geolocation: false }),
          }),
        }),
      );
    });

    it('deve retornar false quando chrome.permissions.request lança erro', async () => {
      permRequest.mockRejectedValue(
        new Error('This function must be called during a user gesture'),
      );

      const result = await helper.requestPermission('management');

      expect(result).toBe(false);
    });

    it('deve retornar false para permissão inválida', async () => {
      const result = await helper.requestPermission(
        'invalidPermission' as OptionalPermission,
      );

      expect(result).toBe(false);
      expect(permRequest).not.toHaveBeenCalled();
    });

    it('deve chamar request quando cache expirou mesmo com permissão concedida', async () => {
      // Cache expirado (6 minutos, TTL é 5)
      mockCachedPermission('management', true, 6 * 60 * 1000);
      permRequest.mockResolvedValue(true);

      const result = await helper.requestPermission('management');

      expect(permRequest).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // withPermission
  // =========================================================================

  describe('withPermission', () => {
    it('deve executar onGranted quando permissão está concedida', async () => {
      permContains.mockResolvedValue(true);
      const onGranted = vi.fn().mockResolvedValue('resultado-captura');

      const result = await helper.withPermission('management', onGranted);

      expect(onGranted).toHaveBeenCalled();
      expect(result).toBe('resultado-captura');
    });

    it('deve executar onDenied quando permissão é recusada', async () => {
      permContains.mockResolvedValue(false);
      const onGranted = vi.fn().mockResolvedValue('captura');
      const onDenied = vi.fn().mockResolvedValue('sem-captura');

      const result = await helper.withPermission(
        'geolocation',
        onGranted,
        onDenied,
      );

      expect(onGranted).not.toHaveBeenCalled();
      expect(onDenied).toHaveBeenCalled();
      expect(result).toBe('sem-captura');
    });

    it('deve retornar undefined quando permissão é recusada e não há onDenied', async () => {
      permContains.mockResolvedValue(false);
      const onGranted = vi.fn().mockResolvedValue('captura');

      const result = await helper.withPermission('tabCapture', onGranted);

      expect(onGranted).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('não deve lançar exceção quando permissão é recusada (degradação graciosa)', async () => {
      permContains.mockResolvedValue(false);

      await expect(
        helper.withPermission('notifications', async () => 'ok'),
      ).resolves.toBeUndefined();
    });

    it('deve propagar erro do onGranted', async () => {
      permContains.mockResolvedValue(true);
      const onGranted = vi.fn().mockRejectedValue(new Error('falha na captura'));

      await expect(
        helper.withPermission('management', onGranted),
      ).rejects.toThrow('falha na captura');
    });

    it('deve usar cache para verificação de permissão', async () => {
      mockCachedPermission('management', true, 60_000);
      const onGranted = vi.fn().mockResolvedValue('ok');

      await helper.withPermission('management', onGranted);

      expect(permContains).not.toHaveBeenCalled();
      expect(onGranted).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // clearCache
  // =========================================================================

  describe('clearCache', () => {
    it('deve remover cache do chrome.storage.session', async () => {
      await helper.clearCache();

      expect(sessionRemove).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('não deve lançar erro se chrome.storage.session.remove falhar', async () => {
      sessionRemove.mockRejectedValue(new Error('storage indisponível'));

      await expect(helper.clearCache()).resolves.toBeUndefined();
    });

    it('deve forçar nova consulta à API após limpar cache', async () => {
      // Primeiro: cache com permissão concedida
      mockCachedPermission('management', true, 60_000);
      const result1 = await helper.hasPermission('management');
      expect(result1).toBe(true);
      expect(permContains).not.toHaveBeenCalled();

      // Limpar cache
      await helper.clearCache();

      // Agora o cache está vazio - deve consultar a API
      mockSessionGet(null);
      permContains.mockResolvedValue(false);

      const result2 = await helper.hasPermission('management');
      expect(result2).toBe(false);
      expect(permContains).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Resiliência do cache
  // =========================================================================

  describe('resiliência do cache', () => {
    it('deve funcionar quando chrome.storage.session.get falha', async () => {
      sessionGet.mockRejectedValue(new Error('session storage indisponível'));
      permContains.mockResolvedValue(true);

      const result = await helper.hasPermission('management');

      // Deve fazer fallback para a API do Chrome
      expect(result).toBe(true);
    });

    it('deve funcionar quando chrome.storage.session.set falha', async () => {
      sessionSet.mockRejectedValue(new Error('session storage indisponível'));
      permContains.mockResolvedValue(true);

      // Não deve lançar erro mesmo com falha no cache
      const result = await helper.hasPermission('management');
      expect(result).toBe(true);
    });

    it('deve ignorar cache corrompido (sem campo state)', async () => {
      sessionGet.mockResolvedValue({
        [CACHE_KEY]: { ttl: 300000 } as unknown as PermissionCacheData,
      });
      permContains.mockResolvedValue(true);

      const result = await helper.hasPermission('management');

      // Deve consultar a API pois o cache está corrompido
      expect(permContains).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('deve ignorar cache corrompido (sem campo ttl)', async () => {
      sessionGet.mockResolvedValue({
        [CACHE_KEY]: {
          state: { management: true },
          lastChecked: { management: Date.now() },
        } as unknown as PermissionCacheData,
      });
      permContains.mockResolvedValue(false);

      const result = await helper.hasPermission('management');

      expect(permContains).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Todas as permissões opcionais
  // =========================================================================

  describe('cobertura de todas as permissões opcionais', () => {
    const allPermissions: OptionalPermission[] = [
      'management',
      'geolocation',
      'notifications',
      'tabCapture',
    ];

    it.each(allPermissions)(
      'deve verificar permissão "%s" via chrome.permissions.contains',
      async (permission) => {
        permContains.mockResolvedValue(true);

        const result = await helper.hasPermission(permission);

        expect(permContains).toHaveBeenCalledWith({
          permissions: [permission],
        });
        expect(result).toBe(true);
      },
    );

    it.each(allPermissions)(
      'deve solicitar permissão "%s" via chrome.permissions.request',
      async (permission) => {
        permRequest.mockResolvedValue(true);

        const result = await helper.requestPermission(permission);

        expect(permRequest).toHaveBeenCalledWith({
          permissions: [permission],
        });
        expect(result).toBe(true);
      },
    );
  });
});
