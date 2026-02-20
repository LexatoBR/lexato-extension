/**
 * GeolocationCollector - Coleta dados de geolocalização do navegador
 *
 * Este coletor implementa coleta de geolocalização adaptativa baseada no contexto:
 * - Em Service Worker: usa Offscreen Document (navigator.geolocation não disponível)
 * - Em Content Script/Popup: usa navigator.geolocation diretamente
 *
 * @module GeolocationCollector
 * @see Requirements 2.2, 2.7 - Context-Appropriate Geolocation Collection
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import { isServiceWorker } from '../../context-utils';
import type { GeoLocationData } from '../../../types/forensic-metadata.types';

/**
 * Mensagens de erro de geolocalização em PT-BR
 * Conforme convenções do projeto
 */
const GEOLOCATION_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  1: 'Permissão negada pelo usuário',
  2: 'Posição indisponível',
  3: 'Timeout ao obter localização',
} as const;

/**
 * Resposta de geolocalização do Offscreen Document
 */
interface OffscreenGeolocationResponse {
  success: true;
  data: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
    source: 'gps' | 'network';
  };
}

interface OffscreenGeolocationError {
  success: false;
  error: string;
  errorCode: number;
}

type OffscreenGeolocationResult = OffscreenGeolocationResponse | OffscreenGeolocationError;

/**
 * Coletor de dados de geolocalização do dispositivo
 *
 * Implementa coleta adaptativa baseada no contexto de execução:
 * - Service Worker: Offscreen Document (Requirement 2.2)
 * - Content Script: navigator.geolocation direto (Requirement 2.7)
 */
export class GeolocationCollector extends BaseCollector<GeoLocationData> {
  constructor(logger: AuditLogger, timeout = 10000) {
    super(logger, 'geolocation', timeout);
  }

  /**
   * Executa coleta de geolocalização
   *
   * Verifica permissão 'geolocation' antes de prosseguir.
   * Se a permissão não foi concedida no pré-flight, retorna dados vazios
   * com justificativa (degradação graciosa conforme Requirement 2.7).
   *
   * Detecta automaticamente o contexto e usa o método apropriado:
   * - Service Worker → Offscreen Document
   * - Outros contextos → navigator.geolocation
   */
  protected async doCollect(): Promise<GeoLocationData> {
    if (isServiceWorker()) {
      return this.collectViaOffscreen();
    }
    return this.collectDirect();
  }

  /**
   * Coleta geolocalização via Offscreen Document
   *
   * Usado quando executando em Service Worker, onde navigator.geolocation
   * não está disponível. Cria/reutiliza Offscreen Document e envia mensagem.
   *
   * @see Requirement 2.2 - Service Worker usa Offscreen Document
   */
  private async collectViaOffscreen(): Promise<GeoLocationData> {
    const maxRetries = 3;
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Garantir que Offscreen Document existe
        const wasCreated = await this.ensureOffscreenDocument();

        // Se acabou de criar, aguardar para garantir que está pronto
        if (wasCreated) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Enviar mensagem para Offscreen Document
        const response = await chrome.runtime.sendMessage<
          { type: string; target: string },
          OffscreenGeolocationResult
        >({
          type: 'get-geolocation',
          target: 'offscreen',
        });

        // Verificar se resposta é válida
        if (!response) {
          throw new Error('Resposta vazia do Offscreen Document');
        }

        if (response.success) {
          const { data } = response;
          const result: GeoLocationData = {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            timestamp: data.timestamp,
            source: data.source,
          };

          // Adiciona campos opcionais apenas se tiverem valor
          if (data.altitude !== null) {
            result.altitude = data.altitude;
          }
          if (data.altitudeAccuracy !== null) {
            result.altitudeAccuracy = data.altitudeAccuracy;
          }
          if (data.heading !== null) {
            result.heading = data.heading;
          }
          if (data.speed !== null) {
            result.speed = data.speed;
          }

          return result;
        }

        // Erro retornado pelo Offscreen Document
        return {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          source: 'unavailable',
          error: response.error,
        };
      } catch (error) {
        lastError = String(error);
        const isConnectionError = lastError.includes('Receiving end does not exist') ||
                                   lastError.includes('Could not establish connection');

        // Se é erro de conexão e ainda temos tentativas, tentar novamente
        if (isConnectionError && attempt < maxRetries) {
          this.logger.warn('FORENSIC', 'GEOLOCATION_OFFSCREEN_RETRY', {
            attempt,
            maxRetries,
            error: lastError,
          });
          // Aguardar com backoff exponencial antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }

        // Erro final ou não é erro de conexão
        break;
      }
    }

    // Retornar erro após todas as tentativas
    return {
      latitude: 0,
      longitude: 0,
      accuracy: 0,
      timestamp: Date.now(),
      source: 'unavailable',
      error: `Erro ao comunicar com Offscreen Document: ${lastError}`,
    };
  }

  /**
   * Garante que o Offscreen Document existe
   *
   * Verifica se já existe um documento offscreen com a razão GEOLOCATION.
   * Se não existir, cria um novo.
   *
   * @see Requirement 2.2 - ensureOffscreenDocument() com verificação de existência
   * @returns true se um novo documento foi criado, false se já existia
   */
  private async ensureOffscreenDocument(): Promise<boolean> {
    // Verificar se já existe um Offscreen Document
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    if (existingContexts.length > 0) {
      // Já existe, não precisa criar
      return false;
    }

    // Criar novo Offscreen Document
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: [chrome.offscreen.Reason.GEOLOCATION],
      justification: 'Coleta de geolocalização para metadados forenses',
    });

    return true;
  }

  /**
   * Coleta geolocalização diretamente via navigator.geolocation
   *
   * Usado em contextos com acesso ao DOM (Content Script, Popup, Options).
   *
   * @see Requirement 2.7 - Content Script usa navigator.geolocation diretamente
   */
  private collectDirect(): Promise<GeoLocationData> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          source: 'unavailable',
          error: 'API de geolocalização não disponível',
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const data: GeoLocationData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
            source: pos.coords.altitude !== null ? 'gps' : 'network',
          };

          // Adiciona campos opcionais apenas se tiverem valor
          const { altitude, altitudeAccuracy, heading, speed } = pos.coords;
          if (altitude !== null) {
            data.altitude = altitude;
          }
          if (altitudeAccuracy !== null) {
            data.altitudeAccuracy = altitudeAccuracy;
          }
          if (heading !== null) {
            data.heading = heading;
          }
          if (speed !== null) {
            data.speed = speed;
          }

          resolve(data);
        },
        (err) => {
          resolve({
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            timestamp: Date.now(),
            source: 'unavailable',
            error: GEOLOCATION_ERROR_MESSAGES[err.code] ?? `Erro desconhecido (código ${err.code})`,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: this.timeout - 1000,
          maximumAge: 0,
        }
      );
    });
  }
}

export default GeolocationCollector;
