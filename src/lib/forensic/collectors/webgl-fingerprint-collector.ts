/**
 * WebGLFingerprintCollector - Coleta fingerprint WebGL
 *
 * Obtém informações da GPU e driver gráfico que são únicas por dispositivo.
 *
 * NOTA: Este collector requer acesso ao DOM (document).
 * Se executado em service worker, retorna erro graciosamente.
 *
 * @module WebGLFingerprintCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { WebGLFingerprint } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao DOM
 */
function hasDOMAccess(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Coletor de fingerprint WebGL
 */
export class WebGLFingerprintCollector extends BaseCollector<WebGLFingerprint> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'webgl-fingerprint', timeout);
  }

  protected async doCollect(): Promise<WebGLFingerprint> {
    const result: WebGLFingerprint = {
      available: false,
    };

    // Verificar se temos acesso ao DOM
    if (!hasDOMAccess()) {
      result.error = 'DOM não disponível (executando em service worker)';
      return result;
    }

    try {
      const canvas = document.createElement('canvas');
      const gl =
        (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

      if (!gl) {
        result.error = 'WebGL não disponível';
        return result;
      }

      result.available = true;

      // Informações básicas do WebGL
      result.version = gl.getParameter(gl.VERSION) as string;
      result.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION) as string;
      result.vendor = gl.getParameter(gl.VENDOR) as string;
      result.renderer = gl.getParameter(gl.RENDERER) as string;

      // Extensão para obter informações reais da GPU (não mascaradas)
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        result.unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
        result.unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
      }

      // Parâmetros de capacidade
      result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      result.maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as number[];
      result.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
      result.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
      result.maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number;
      result.maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
      result.maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS) as number;

      // Extensões suportadas
      const extensions = gl.getSupportedExtensions();
      if (extensions) {
        result.extensions = extensions;
        result.extensionsCount = extensions.length;
      }

      // Antialiasing
      result.antialias = gl.getContextAttributes()?.antialias ?? false;

      // Gera hash do fingerprint
      result.hash = await this.generateHash(result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }

  /**
   * Gera hash único do fingerprint WebGL
   */
  private async generateHash(data: WebGLFingerprint): Promise<string> {
    const str = JSON.stringify({
      vendor: data.vendor,
      renderer: data.renderer,
      unmaskedVendor: data.unmaskedVendor,
      unmaskedRenderer: data.unmaskedRenderer,
      maxTextureSize: data.maxTextureSize,
      extensionsCount: data.extensionsCount,
    });

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export default WebGLFingerprintCollector;
