/**
 * FontsCollector - Coleta fontes instaladas
 *
 * Detecta fontes instaladas no sistema usando técnica de medição.
 * Lista de fontes é única por sistema e útil para fingerprinting.
 *
 * NOTA: Este collector requer acesso ao DOM (document).
 * Se executado em service worker, retorna erro graciosamente.
 *
 * @module FontsCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { FontsInfo } from '../../../types/forensic-metadata.types';

/**
 * Verifica se temos acesso ao DOM
 */
function hasDOMAccess(): boolean {
  return typeof document !== 'undefined';
}

// Lista de fontes comuns para testar
const FONTS_TO_TEST = [
  // Windows
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  // macOS
  'American Typewriter',
  'Andale Mono',
  'Apple Chancery',
  'Avenir',
  'Baskerville',
  'Big Caslon',
  'Brush Script MT',
  'Chalkboard',
  'Copperplate',
  'Didot',
  'Futura',
  'Geneva',
  'Gill Sans',
  'Helvetica',
  'Helvetica Neue',
  'Herculanum',
  'Hoefler Text',
  'Lucida Grande',
  'Marker Felt',
  'Menlo',
  'Monaco',
  'Optima',
  'Palatino',
  'Papyrus',
  'SF Pro',
  'Skia',
  // Linux
  'DejaVu Sans',
  'DejaVu Serif',
  'Droid Sans',
  'Droid Serif',
  'FreeMono',
  'FreeSans',
  'FreeSerif',
  'Liberation Mono',
  'Liberation Sans',
  'Liberation Serif',
  'Noto Sans',
  'Noto Serif',
  'Ubuntu',
  'Ubuntu Mono',
  // Fontes especiais
  'Wingdings',
  'Webdings',
  'Symbol',
  'MS Gothic',
  'MS Mincho',
];

/**
 * Coletor de fontes instaladas
 */
export class FontsCollector extends BaseCollector<FontsInfo> {
  constructor(logger: AuditLogger, timeout = 3000) {
    super(logger, 'fonts', timeout);
  }

  protected async doCollect(): Promise<FontsInfo> {
    const result: FontsInfo = {
      available: false,
      installedFonts: [],
      totalTested: FONTS_TO_TEST.length,
    };

    // Verificar se temos acesso ao DOM
    if (!hasDOMAccess()) {
      result.error = 'DOM não disponível (executando em service worker)';
      return result;
    }

    try {
      // Método 1: Usar FontFaceSet.check() se disponível
      if ('fonts' in document && document.fonts.check) {
        result.available = true;
        result.method = 'FontFaceSet';

        for (const font of FONTS_TO_TEST) {
          try {
            // Testa se a fonte está disponível
            const isAvailable = document.fonts.check(`12px "${font}"`);
            if (isAvailable) {
              result.installedFonts.push(font);
            }
          } catch {
            // Ignora erros de fontes individuais
          }
        }
      } else {
        // Método 2: Fallback usando canvas
        result.available = true;
        result.method = 'Canvas';
        result.installedFonts = this.detectFontsViaCanvas();
      }

      result.installedCount = result.installedFonts.length;

      // Gera hash da lista de fontes
      result.hash = await this.hashFontList(result.installedFonts);
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'Erro desconhecido';
    }

    return result;
  }

  /**
   * Detecta fontes usando medição de texto em canvas
   */
  private detectFontsViaCanvas(): string[] {
    const detected: string[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return detected;
    }

    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const baseFonts = ['monospace', 'sans-serif', 'serif'];

    // Mede largura com fontes base
    const baseWidths: Record<string, number> = {};
    for (const baseFont of baseFonts) {
      ctx.font = `${testSize} ${baseFont}`;
      baseWidths[baseFont] = ctx.measureText(testString).width;
    }

    // Testa cada fonte
    for (const font of FONTS_TO_TEST) {
      let isDetected = false;

      for (const baseFont of baseFonts) {
        ctx.font = `${testSize} "${font}", ${baseFont}`;
        const width = ctx.measureText(testString).width;

        // Se a largura é diferente da base, a fonte está instalada
        if (width !== baseWidths[baseFont]) {
          isDetected = true;
          break;
        }
      }

      if (isDetected) {
        detected.push(font);
      }
    }

    return detected;
  }

  /**
   * Gera hash da lista de fontes
   */
  private async hashFontList(fonts: string[]): Promise<string> {
    const str = fonts.sort().join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export default FontsCollector;
