/**
 * StorageCollector - Coleta dados de storage local
 *
 * NOTA: Este collector usa APIs que podem não estar disponíveis no Service Worker
 * (localStorage, sessionStorage, window). Quando executado no SW, retorna dados
 * parciais baseados apenas no indexedDB global.
 *
 * @module StorageCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { StorageInfo } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao window (não disponível em Service Worker)
 */
function hasWindowAccess(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Coletor de informações de storage do navegador
 */
export class StorageCollector extends BaseCollector<StorageInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'storage', timeout);
  }

  protected async doCollect(): Promise<StorageInfo> {
    const hasWindow = hasWindowAccess();
    
    const info: StorageInfo = {
      localStorageKeys: [],
      localStorageSize: 0,
      sessionStorageKeys: [],
      sessionStorageSize: 0,
      // indexedDB está disponível globalmente, mas 'in window' só funciona com window
      indexedDBAvailable: typeof indexedDB !== 'undefined',
    };

    // localStorage e sessionStorage só estão disponíveis com window
    if (hasWindow) {
      // Coleta localStorage
      this.collectLocalStorage(info);

      // Coleta sessionStorage
      this.collectSessionStorage(info);
    }

    // Coleta IndexedDB databases (disponível em Service Worker)
    await this.collectIndexedDB(info);

    return info;
  }

  /**
   * Coleta informações do localStorage
   */
  private collectLocalStorage(info: StorageInfo): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          info.localStorageKeys.push(key);
          const value = localStorage.getItem(key);
          info.localStorageSize += key.length + (value?.length ?? 0);
        }
      }
    } catch {
      // Pode falhar se localStorage estiver bloqueado
    }
  }

  /**
   * Coleta informações do sessionStorage
   */
  private collectSessionStorage(info: StorageInfo): void {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          info.sessionStorageKeys.push(key);
          const value = sessionStorage.getItem(key);
          info.sessionStorageSize += key.length + (value?.length ?? 0);
        }
      }
    } catch {
      // Pode falhar se sessionStorage estiver bloqueado
    }
  }

  /**
   * Coleta lista de databases IndexedDB
   */
  private async collectIndexedDB(info: StorageInfo): Promise<void> {
    if (!info.indexedDBAvailable) {
      return;
    }

    try {
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        info.indexedDBDatabases = dbs.map((db) => db.name ?? 'unnamed');
      }
    } catch {
      // indexedDB.databases() pode não estar disponível em todos os navegadores
    }
  }
}

export default StorageCollector;
