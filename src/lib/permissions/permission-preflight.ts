/**
 * Permission Preflight - Utilitário de pré-verificação de permissões
 *
 * Solicita permissões opcionais necessárias ANTES de iniciar uma captura.
 * Deve ser chamado no popup/sidepanel dentro de um handler de clique
 * (user gesture obrigatório para chrome.permissions.request).
 *
 * O Service Worker NÃO pode solicitar permissões diretamente.
 * Este módulo é projetado para uso exclusivo em contextos com UI
 * (popup, sidepanel, options page).
 *
 * @module PermissionPreflight
 */

import { permissionHelper, type OptionalPermission } from './permission-helper';

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

/**
 * Resultado do pré-flight de permissões para uma permissão individual.
 */
export interface PermissionPreflightItem {
  /** Nome da permissão */
  permission: OptionalPermission;
  /** Se a permissão foi concedida */
  granted: boolean;
  /** Se a permissão já estava concedida antes do pré-flight */
  wasAlreadyGranted: boolean;
}

/**
 * Resultado completo do pré-flight de permissões.
 */
export interface PermissionPreflightResult {
  /** Se todas as permissões obrigatórias foram concedidas */
  allGranted: boolean;
  /** Resultado individual de cada permissão */
  results: PermissionPreflightItem[];
  /** Permissões que foram recusadas pelo usuário */
  denied: OptionalPermission[];
  /** Permissões que foram concedidas */
  granted: OptionalPermission[];
}

// ---------------------------------------------------------------------------
// Permissões por tipo de captura
// ---------------------------------------------------------------------------

/**
 * Permissões necessárias para captura de screenshot.
 * - management: isolamento de extensões durante captura
 * - notifications: feedback ao usuário sobre status da captura
 *
 * NOTA: geolocalização é gerenciada via navigator.geolocation (API do DOM),
 * não requer permissão no manifest do Chrome.
 */
const SCREENSHOT_PERMISSIONS: readonly OptionalPermission[] = [
  'management',
  'notifications',
] as const;

/**
 * Permissões necessárias para captura de vídeo.
 * - tabCapture: captura do stream de vídeo da aba
 * - management: isolamento de extensões durante captura
 * - notifications: feedback ao usuário sobre status da captura
 *
 * NOTA: geolocalização é gerenciada via navigator.geolocation (API do DOM),
 * não requer permissão no manifest do Chrome.
 */
const VIDEO_PERMISSIONS: readonly OptionalPermission[] = [
  'tabCapture',
  'management',
  'notifications',
] as const;

// ---------------------------------------------------------------------------
// Funções de pré-flight
// ---------------------------------------------------------------------------

/**
 * Executa pré-flight de permissões para um conjunto de permissões.
 *
 * IMPORTANTE: Deve ser chamado dentro de um handler de clique (user gesture).
 * Solicita cada permissão individualmente para que o usuário possa
 * conceder ou recusar cada uma separadamente.
 *
 * @param permissions - Lista de permissões a solicitar
 * @returns Resultado do pré-flight com status de cada permissão
 */
export async function runPermissionPreflight(
  permissions: readonly OptionalPermission[],
): Promise<PermissionPreflightResult> {
  const results: PermissionPreflightItem[] = [];
  const denied: OptionalPermission[] = [];
  const granted: OptionalPermission[] = [];

  for (const permission of permissions) {
    // Verificar se já está concedida antes de solicitar
    const alreadyGranted = await permissionHelper.hasPermission(permission);

    if (alreadyGranted) {
      results.push({
        permission,
        granted: true,
        wasAlreadyGranted: true,
      });
      granted.push(permission);
      continue;
    }

    // Solicitar permissão ao usuário (requer user gesture)
    const wasGranted = await permissionHelper.requestPermission(permission);

    results.push({
      permission,
      granted: wasGranted,
      wasAlreadyGranted: false,
    });

    if (wasGranted) {
      granted.push(permission);
    } else {
      denied.push(permission);
    }
  }

  return {
    allGranted: denied.length === 0,
    results,
    denied,
    granted,
  };
}

/**
 * Pré-flight de permissões para captura de screenshot.
 *
 * Solicita: management, notifications.
 * IMPORTANTE: Deve ser chamado dentro de um handler de clique.
 *
 * @returns Resultado do pré-flight
 */
export async function preflightScreenshotPermissions(): Promise<PermissionPreflightResult> {
  return runPermissionPreflight(SCREENSHOT_PERMISSIONS);
}

/**
 * Pré-flight de permissões para captura de vídeo.
 *
 * Solicita: tabCapture, management, notifications.
 * IMPORTANTE: Deve ser chamado dentro de um handler de clique.
 *
 * @returns Resultado do pré-flight
 */
export async function preflightVideoPermissions(): Promise<PermissionPreflightResult> {
  return runPermissionPreflight(VIDEO_PERMISSIONS);
}

/**
 * Solicita apenas a permissão de notificações.
 *
 * Útil para solicitar na primeira interação do usuário com a extensão
 * (ex: ao abrir popup pela primeira vez).
 * IMPORTANTE: Deve ser chamado dentro de um handler de clique.
 *
 * @returns true se a permissão foi concedida
 */
export async function preflightNotificationPermission(): Promise<boolean> {
  const alreadyGranted = await permissionHelper.hasPermission('notifications');
  if (alreadyGranted) {
    return true;
  }

  return permissionHelper.requestPermission('notifications');
}

/**
 * Notifica o Service Worker que permissões foram concedidas.
 *
 * Envia mensagem via chrome.runtime.sendMessage para que o SW
 * atualize seu cache e prossiga com operações que dependem
 * das permissões concedidas.
 *
 * @param grantedPermissions - Lista de permissões concedidas
 */
export async function notifyServiceWorkerPermissionsGranted(
  grantedPermissions: OptionalPermission[],
): Promise<void> {
  if (grantedPermissions.length === 0) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'PERMISSIONS_GRANTED',
      permissions: grantedPermissions,
    });
  } catch {
    // Service Worker pode não estar ativo - falha silenciosa
    // O SW verificará as permissões quando necessário via hasPermission()
  }
}
