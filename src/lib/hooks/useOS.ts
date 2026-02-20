/**
 * Hook para detectar o sistema operacional do usuário
 *
 * Detecta se o usuário está em Windows ou Mac para exibir
 * atalhos de teclado apropriados (Ctrl vs Cmd).
 *
 * @see Requirements 24.1, 25.5
 */

import { useMemo } from 'react';

/** Tipos de sistema operacional suportados */
export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'unknown';

/** Resultado do hook useOS */
export interface UseOSResult {
  /** Sistema operacional detectado */
  os: OperatingSystem;
  /** Verdadeiro se o usuário está em Mac */
  isMac: boolean;
  /** Verdadeiro se o usuário está em Windows */
  isWindows: boolean;
  /** Verdadeiro se o usuário está em Linux */
  isLinux: boolean;
  /** Tecla modificadora principal (Cmd para Mac, Ctrl para outros) */
  modKey: 'Cmd' | 'Ctrl';
  /** Símbolo da tecla modificadora (⌘ para Mac, Ctrl para outros) */
  modKeySymbol: '⌘' | 'Ctrl';
}

/**
 * Detecta o sistema operacional baseado no navigator.platform
 *
 * @returns Sistema operacional detectado
 */
function detectOS(): OperatingSystem {
  // Verificar se estamos em ambiente de navegador
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const platform = navigator.platform?.toLowerCase() ?? '';
  const userAgent = navigator.userAgent?.toLowerCase() ?? '';

  // Detectar Mac
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac';
  }

  // Detectar Windows
  if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  }

  // Detectar Linux
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }

  return 'unknown';
}

/**
 * Hook para detectar o sistema operacional do usuário
 *
 * @example
 * ```tsx
 * const { isMac, modKey, modKeySymbol } = useOS();
 *
 * // Exibir atalho apropriado
 * const shortcut = isMac ? '⌘K' : 'Ctrl+K';
 *
 * // Usar modKey para texto
 * const hint = `Pressione ${modKey}+K para abrir`;
 * ```
 *
 * @returns Informações sobre o sistema operacional
 */
export function useOS(): UseOSResult {
  return useMemo(() => {
    const os = detectOS();
    const isMac = os === 'mac';
    const isWindows = os === 'windows';
    const isLinux = os === 'linux';

    return {
      os,
      isMac,
      isWindows,
      isLinux,
      modKey: isMac ? 'Cmd' : 'Ctrl',
      modKeySymbol: isMac ? '⌘' : 'Ctrl',
    };
  }, []);
}

export default useOS;
