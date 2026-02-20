/**
 * Adapter de Chrome Storage para Zustand Persist
 *
 * Implementa interface StateStorage do Zustand para usar chrome.storage.sync
 * como backend de persistência. Permite sincronização entre dispositivos
 * do mesmo usuário Chrome.
 *
 * @requirements 4.6, 6.10
 * @module ChromeStorageAdapter
 */

import type { StateStorage } from 'zustand/middleware';
import { captureException } from '../lib/sentry';

/**
 * Adapter para chrome.storage.sync compatível com Zustand persist middleware
 *
 * Características:
 * - Usa chrome.storage.sync para sincronização entre dispositivos
 * - Operações assíncronas com Promises
 * - Tratamento de erros robusto
 * - Logs de debug para troubleshooting
 *
 * @example
 * ```typescript
 * import { create } from 'zustand';
 * import { persist, createJSONStorage } from 'zustand/middleware';
 * import { chromeStorageSyncAdapter } from './chrome-storage-adapter';
 *
 * const useStore = create(
 *   persist(
 *     (set) => ({ count: 0 }),
 *     {
 *       name: 'my-store',
 *       storage: createJSONStorage(() => chromeStorageSyncAdapter),
 *     }
 *   )
 * );
 * ```
 */
export const chromeStorageSyncAdapter: StateStorage = {
  /**
   * Recupera item do chrome.storage.sync
   *
   * @param name - Chave do item a recuperar
   * @returns Valor armazenado ou null se não existir
   */
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.sync.get(name);
      const value = result[name];

      if (value === undefined) {
        return null;
      }

      // Se já é string, retorna diretamente
      if (typeof value === 'string') {
        return value;
      }

      // Se é objeto, serializa para JSON
      return JSON.stringify(value);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'getItem' },
        key: name,
      });
      return null;
    }
  },

  /**
   * Armazena item no chrome.storage.sync
   *
   * @param name - Chave do item
   * @param value - Valor a armazenar (string JSON)
   */
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      // Tenta parsear como JSON para armazenar objeto nativo
      // Isso otimiza o uso de quota do chrome.storage.sync
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      await chrome.storage.sync.set({ [name]: parsedValue });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'setItem' },
        key: name,
      });
      throw error;
    }
  },

  /**
   * Remove item do chrome.storage.sync
   *
   * @param name - Chave do item a remover
   */
  removeItem: async (name: string): Promise<void> => {
    try {
      await chrome.storage.sync.remove(name);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'removeItem' },
        key: name,
      });
      throw error;
    }
  },
};

/**
 * Adapter para chrome.storage.local compatível com Zustand persist middleware
 *
 * Alternativa ao sync para dados maiores ou que não precisam sincronizar.
 * Limite de 5MB vs 100KB do sync.
 */
export const chromeStorageLocalAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get(name);
      const value = result[name];

      if (value === undefined) {
        return null;
      }

      if (typeof value === 'string') {
        return value;
      }

      return JSON.stringify(value);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'getItem-local' },
        key: name,
      });
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      await chrome.storage.local.set({ [name]: parsedValue });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'setItem-local' },
        key: name,
      });
      throw error;
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await chrome.storage.local.remove(name);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ChromeStorageAdapter', operation: 'removeItem-local' },
        key: name,
      });
      throw error;
    }
  },
};

/**
 * Cria listener para mudanças no chrome.storage
 *
 * Útil para sincronizar estado entre diferentes contextos da extensão
 * (popup, background, content scripts).
 *
 * @param storageArea - Área de storage ('sync' ou 'local')
 * @param key - Chave a monitorar
 * @param callback - Função chamada quando valor muda
 * @returns Função para remover listener
 */
export function createStorageChangeListener(
  storageArea: 'sync' | 'local',
  key: string,
  callback: (newValue: unknown, oldValue: unknown) => void
): () => void {
  const handleChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void => {
    if (areaName !== storageArea) {
      return;
    }

    const change = changes[key];
    if (change) {
      callback(change.newValue, change.oldValue);
    }
  };

  chrome.storage.onChanged.addListener(handleChange);

  return () => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
}

export default chromeStorageSyncAdapter;
