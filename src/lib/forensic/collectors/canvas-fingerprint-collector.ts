/**
 * CanvasFingerprintCollector - Coleta fingerprint de canvas
 *
 * Gera hash único baseado na renderização gráfica do dispositivo.
 * Difícil de falsificar pois depende de hardware e drivers.
 *
 * NOTA: Este collector requer acesso ao DOM (document).
 * Se executado em service worker, retorna erro graciosamente.
 *
 * @module CanvasFingerprintCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { CanvasFingerprint } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao DOM
 */
function hasDOMAccess(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Coletor de fingerprint de canvas
 */
export class CanvasFingerprintCollector extends BaseCollector<CanvasFingerprint> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'canvas-fingerprint', timeout);
  }

  protected async doCollect(): Promise<CanvasFingerprint> {
    const result: CanvasFingerprint = {
      available: false,
    };

    // Verificar se temos acesso ao DOM
    if (!hasDOMAccess()) {
      result.error = 'DOM não disponível (executando em service worker)';
      return result;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        result.error = 'Canvas 2D context não disponível';
        return result;
      }

      canvas.width = 280;
      canvas.height = 60;

      // Renderiza texto com diferentes estilos
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 280, 60);

      ctx.fillStyle = '#069';
      ctx.font = '14px Arial';
      ctx.fillText('Lexato Forensic Canvas', 2, 15);

      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.font = '18px Georgia';
      ctx.fillText('Prova Digital', 4, 40);

      // Adiciona formas geométricas
      ctx.beginPath();
      ctx.arc(200, 30, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0';
      ctx.fill();

      ctx.strokeStyle = '#00f';
      ctx.lineWidth = 2;
      ctx.strokeRect(230, 10, 40, 40);

      // Gera hash do canvas
      const dataUrl = canvas.toDataURL('image/png');
      const hash = await this.hashString(dataUrl);

      result.available = true;
      result.hash = hash;
      result.width = canvas.width;
      result.height = canvas.height;

      // Detecta se canvas está bloqueado (retorna imagem em branco)
      if (this.isCanvasBlocked(dataUrl)) {
        result.blocked = true;
        result.error = 'Canvas fingerprinting pode estar bloqueado';
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }

  /**
   * Calcula hash SHA-256 de uma string
   */
  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifica se o canvas está bloqueado (retorna dados vazios/uniformes)
   */
  private isCanvasBlocked(dataUrl: string): boolean {
    // Canvas bloqueado geralmente retorna uma imagem muito pequena ou uniforme
    // Uma imagem PNG válida com conteúdo tem pelo menos ~1KB
    return dataUrl.length < 1000;
  }
}

export default CanvasFingerprintCollector;
