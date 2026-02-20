/**
 * PermissionsCollector - Coleta estado das permissões do navegador
 *
 * Verifica estado das permissões para várias APIs sensíveis.
 * Útil para contexto forense sobre capacidades do dispositivo.
 *
 * @module PermissionsCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { PermissionsInfo, PermissionItem } from '../../../types/forensic-metadata.types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Permissões para verificar via Permissions API
 * Organizadas por categoria para melhor manutenibilidade
 */
const PERMISSIONS_TO_CHECK: readonly string[] = [
  // Localização e sensores
  'geolocation',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'ambient-light-sensor',
  // Mídia
  'camera',
  'microphone',
  // Notificações e sistema
  'notifications',
  'screen-wake-lock',
  'background-sync',
  // Clipboard
  'clipboard-read',
  'clipboard-write',
  // Storage e outros
  'persistent-storage',
  'midi',
] as const;

// ============================================================================
// PermissionsCollector
// ============================================================================

/**
 * Coletor de estado de permissões do navegador
 *
 * @example
 * ```typescript
 * const collector = new PermissionsCollector(logger);
 * const result = await collector.collect();
 * console.log(result.data?.grantedCount);
 * ```
 */
export class PermissionsCollector extends BaseCollector<PermissionsInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'permissions', timeout);
  }

  protected async doCollect(): Promise<PermissionsInfo> {
    const result: PermissionsInfo = {
      available: false,
      permissions: [],
    };

    if (!this.isPermissionsAPIAvailable()) {
      result.error = 'Permissions API não disponível';
      return result;
    }

    result.available = true;

    try {
      result.permissions = await this.queryAllPermissions();
      this.calculateCounts(result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }

  /**
   * Verifica se a Permissions API está disponível
   */
  private isPermissionsAPIAvailable(): boolean {
    return typeof navigator.permissions?.query === 'function';
  }

  /**
   * Consulta estado de todas as permissões configuradas
   */
  private async queryAllPermissions(): Promise<PermissionItem[]> {
    const queries = PERMISSIONS_TO_CHECK.map((name) => this.queryPermission(name));
    return Promise.all(queries);
  }

  /**
   * Consulta estado de uma permissão específica
   * @param name - Nome da permissão
   */
  private async queryPermission(name: string): Promise<PermissionItem> {
    try {
      const status = await navigator.permissions.query({
        name: name as PermissionName,
      });
      return { name, state: status.state };
    } catch {
      // Permissão não suportada neste navegador
      return { name, state: 'unsupported' };
    }
  }

  /**
   * Calcula contagens por estado de permissão
   * @param result - Objeto de resultado para atualizar
   */
  private calculateCounts(result: PermissionsInfo): void {
    const { permissions } = result;
    result.grantedCount = permissions.filter((p) => p.state === 'granted').length;
    result.deniedCount = permissions.filter((p) => p.state === 'denied').length;
    result.promptCount = permissions.filter((p) => p.state === 'prompt').length;
  }
}

export default PermissionsCollector;
