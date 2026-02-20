/**
 * ServiceWorkersCollector - Coleta Service Workers registrados
 *
 * Lista Service Workers ativos na página que podem interceptar requisições.
 *
 * @module ServiceWorkersCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { ServiceWorkersInfo, ServiceWorkerItem } from '../../../types/forensic-metadata.types';

/**
 * Coletor de Service Workers
 */
export class ServiceWorkersCollector extends BaseCollector<ServiceWorkersInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'service-workers', timeout);
  }

  protected async doCollect(): Promise<ServiceWorkersInfo> {
    const result: ServiceWorkersInfo = {
      available: false,
      workers: [],
    };

    try {
      if (!('serviceWorker' in navigator)) {
        result.error = 'Service Worker API não disponível';
        return result;
      }

      result.available = true;

      // Obtém registros de Service Workers
      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const reg of registrations) {
        const worker: ServiceWorkerItem = {
          scope: reg.scope,
          updateViaCache: reg.updateViaCache,
        };

        // Estado do worker ativo
        if (reg.active) {
          worker.state = reg.active.state;
          worker.scriptURL = reg.active.scriptURL;
        } else if (reg.waiting) {
          worker.state = reg.waiting.state;
          worker.scriptURL = reg.waiting.scriptURL;
        } else if (reg.installing) {
          worker.state = reg.installing.state;
          worker.scriptURL = reg.installing.scriptURL;
        }

        result.workers.push(worker);
      }

      result.totalWorkers = result.workers.length;

      // Verifica se há controller ativo
      if (navigator.serviceWorker.controller) {
        result.hasController = true;
        result.controllerScriptURL = navigator.serviceWorker.controller.scriptURL;
        result.controllerState = navigator.serviceWorker.controller.state;
      } else {
        result.hasController = false;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }
}

export default ServiceWorkersCollector;
