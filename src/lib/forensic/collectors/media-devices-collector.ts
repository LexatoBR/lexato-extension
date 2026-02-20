/**
 * MediaDevicesCollector - Coleta dispositivos de mídia
 *
 * Lista câmeras, microfones e dispositivos de áudio disponíveis.
 * Não acessa conteúdo, apenas enumera dispositivos.
 *
 * @module MediaDevicesCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { MediaDevicesInfo, MediaDeviceItem } from '../../../types/forensic-metadata.types';

/**
 * Coletor de dispositivos de mídia
 */
export class MediaDevicesCollector extends BaseCollector<MediaDevicesInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'media-devices', timeout);
  }

  protected async doCollect(): Promise<MediaDevicesInfo> {
    const result: MediaDevicesInfo = {
      available: false,
      devices: [],
      audioInputCount: 0,
      audioOutputCount: 0,
      videoInputCount: 0,
    };

    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        result.error = 'MediaDevices API não disponível';
        return result;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      result.available = true;

      for (const device of devices) {
        const item: MediaDeviceItem = {
          kind: device.kind,
        };

        // Label só está disponível se houver permissão
        if (device.label !== '') {
          item.label = device.label;
        }
        // DeviceId é único por origem
        if (device.deviceId !== '') {
          item.deviceId = this.hashDeviceId(device.deviceId);
        }
        if (device.groupId !== '') {
          item.groupId = this.hashDeviceId(device.groupId);
        }

        result.devices.push(item);

        // Conta por tipo
        switch (device.kind) {
          case 'audioinput':
            result.audioInputCount++;
            break;
          case 'audiooutput':
            result.audioOutputCount++;
            break;
          case 'videoinput':
            result.videoInputCount++;
            break;
        }
      }

      result.totalDevices = result.devices.length;
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }

  /**
   * Hash do deviceId para privacidade (não expõe ID real)
   */
  private hashDeviceId(id: string): string {
    // Hash simples para não expor o ID real do dispositivo
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

export default MediaDevicesCollector;
