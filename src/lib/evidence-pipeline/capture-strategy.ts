/**
 * Estratégias de Captura (Strategy Pattern)
 *
 * Implementa o padrão Strategy para abstrair diferenças entre
 * tipos de captura (screenshot e vídeo), permitindo que novos
 * tipos sejam adicionados sem modificar o pipeline principal.
 *
 * @module CaptureStrategy
 */

import type {
  CaptureType,
  CaptureStrategy,
} from './types';

// Importa BaseCaptureStrategy do arquivo separado (evita dependência circular)
// e re-exporta para manter compatibilidade com código existente
export { BaseCaptureStrategy } from './base-capture-strategy';

// Imports estáticos das estratégias - necessário para Service Worker (ESM)
// onde require() e import() dinâmico não são permitidos
import { ScreenshotStrategy } from './screenshot-strategy';
import { VideoStrategy } from './video-strategy';

// Re-exporta a interface do types.ts para conveniência
export type { CaptureStrategy };

/**
 * Factory para criar estratégia de captura baseada no tipo
 *
 * Utiliza o padrão Factory Method para instanciar a estratégia
 * apropriada (ScreenshotStrategy ou VideoStrategy) com base
 * no tipo de captura solicitado.
 *
 * @param type - Tipo de captura ('screenshot' ou 'video')
 * @returns Instância da estratégia apropriada
 * @throws Error se tipo inválido for fornecido
 *
 * @example
 * ```typescript
 * const strategy = createCaptureStrategy('screenshot');
 * const result = await strategy.execute(config);
 * ```
 */
export function createCaptureStrategy(type: CaptureType): CaptureStrategy {
  switch (type) {
    case 'screenshot': {
      return new ScreenshotStrategy();
    }

    case 'video': {
      return new VideoStrategy();
    }

    default: {
      // Garante que o tipo é exaustivamente verificado em tempo de compilação
      const tipoInvalido: never = type;
      throw new Error(
        `Tipo de captura inválido: '${tipoInvalido}'. ` +
          "Tipos válidos são: 'screenshot' ou 'video'."
      );
    }
  }
}

/**
 * Factory assíncrona para criar estratégia de captura
 *
 * Versão assíncrona que mantém compatibilidade com código existente.
 * Internamente usa imports estáticos (necessário para Service Worker).
 *
 * @param type - Tipo de captura ('screenshot' ou 'video')
 * @returns Promise com instância da estratégia apropriada
 * @throws Error se tipo inválido for fornecido
 */
export async function createCaptureStrategyAsync(type: CaptureType): Promise<CaptureStrategy> {
  // Usa a factory síncrona internamente - imports estáticos já carregados
  return createCaptureStrategy(type);
}

/**
 * Verifica se um tipo de captura é válido
 *
 * @param type - Tipo a ser verificado
 * @returns true se o tipo é válido ('screenshot' ou 'video')
 */
export function isValidCaptureType(type: unknown): type is CaptureType {
  return type === 'screenshot' || type === 'video';
}

/**
 * Lista de tipos de captura suportados
 *
 * Útil para validação e geração de UI dinâmica.
 */
export const CAPTURE_TYPES: readonly CaptureType[] = ['screenshot', 'video'] as const;
