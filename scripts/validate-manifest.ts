/**
 * Validador automatizado do manifest de produção.
 *
 * Verifica conformidade MV3 do manifest.json gerado pelo build:
 * 1. Nenhuma permissão declarada sem uso correspondente no código-fonte
 * 2. Nenhum arquivo .map no diretório de saída
 * 3. CSP sem referências a localhost ou endereços locais
 * 4. minimum_chrome_version presente no manifest
 * 5. web_accessible_resources sem arquivos .map
 *
 * Pode ser usado como módulo (importável para testes) ou como CLI.
 * Quando executado como CLI, retorna exit code 1 se a validação falhar.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 * @module ValidateManifest
 */

import { promises as fs } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findMapFiles } from '../vite-plugin-sourcemap-guard';
import { LOCALHOST_PATTERNS } from '../src/lib/csp/csp-builder';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Resultado da validação do manifest de produção.
 */
export interface ManifestValidationResult {
  /** Se todas as verificações passaram (nenhum erro) */
  valid: boolean;
  /** Problemas bloqueantes que impedem a submissão à CWS */
  errors: string[];
  /** Sugestões de melhoria (não bloqueantes) */
  warnings: string[];
  /** Estado individual de cada verificação */
  checks: {
    noUnusedPermissions: boolean;
    noSourceMaps: boolean;
    noLocalhostInCSP: boolean;
    hasMinimumChromeVersion: boolean;
    noMapsInWebAccessibleResources: boolean;
  };
}

// ---------------------------------------------------------------------------
// Tabela de mapeamento: permissão -> padrão de API no código-fonte
// ---------------------------------------------------------------------------

/**
 * Mapeamento de permissões obrigatórias para padrões de uso no código.
 * Cada permissão mapeia para um ou mais padrões regex que indicam uso da API.
 */
export const PERMISSION_API_PATTERNS: Record<string, RegExp[]> = {
  cookies: [/chrome\.cookies\./],
  webRequest: [/chrome\.webRequest\./],
  management: [/chrome\.management\./],
  geolocation: [
    /chrome\.offscreen\.createDocument[\s\S]*?GEOLOCATION/,
    /navigator\.geolocation\./,
  ],
  notifications: [/chrome\.notifications\./],
  tabCapture: [/chrome\.tabCapture\./],
  storage: [/chrome\.storage\./],
  tabs: [/chrome\.tabs\./],
  scripting: [/chrome\.scripting\./],
  alarms: [/chrome\.alarms\./],
  webNavigation: [/chrome\.webNavigation\./],
  offscreen: [/chrome\.offscreen\./],
  sidePanel: [/chrome\.sidePanel\./],
  identity: [/chrome\.identity\./],
};

/**
 * Permissões implícitas que não possuem API direta.
 * Emitem warning em vez de erro quando declaradas.
 */
export const IMPLICIT_PERMISSIONS: ReadonlySet<string> = new Set(['activeTab']);

/**
 * Padrão regex para detectar solicitação de permissão opcional via chrome.permissions.request.
 */
export const PERMISSION_REQUEST_PATTERN = /chrome\.permissions\.request/;

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

/**
 * Lê e faz parse do manifest.json no diretório de saída.
 *
 * @param distDir - Diretório de saída do build
 * @returns Objeto do manifest ou null se não encontrado
 */
export async function readManifest(
  distDir: string
): Promise<Record<string, unknown> | null> {
  const manifestPath = join(distDir, 'manifest.json');
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Busca recursivamente todos os arquivos .ts e .tsx em um diretório.
 *
 * @param dir - Diretório raiz para busca
 * @returns Lista de caminhos absolutos dos arquivos encontrados
 */
export async function findSourceFiles(dir: string): Promise<string[]> {
  const sourceFiles: string[] = [];

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return sourceFiles;
  }

  for (const name of names) {
    const fullPath = join(dir, name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        // Ignora node_modules e dist
        if (name === 'node_modules' || name === 'dist') continue;
        const nested = await findSourceFiles(fullPath);
        sourceFiles.push(...nested);
      } else if (
        stat.isFile() &&
        (name.endsWith('.ts') || name.endsWith('.tsx'))
      ) {
        sourceFiles.push(fullPath);
      }
    } catch {
      // Arquivo inacessível - ignora
    }
  }

  return sourceFiles;
}

/**
 * Lê o conteúdo de todos os arquivos fonte e concatena em uma string.
 * Usado para busca de padrões de API no código-fonte.
 *
 * @param srcDir - Diretório de código-fonte (src/)
 * @returns Conteúdo concatenado de todos os arquivos .ts/.tsx
 */
export async function readAllSourceContent(srcDir: string): Promise<string> {
  const files = await findSourceFiles(srcDir);
  const contents: string[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      contents.push(content);
    } catch {
      // Arquivo inacessível - ignora
    }
  }

  return contents.join('\n');
}

// ---------------------------------------------------------------------------
// Verificações individuais
// ---------------------------------------------------------------------------

/**
 * Verifica se existem arquivos .map no diretório de saída.
 * Reutiliza findMapFiles do vite-plugin-sourcemap-guard.
 *
 * @param distDir - Diretório de saída do build
 * @param result - Resultado da validação (mutado)
 */
export async function checkSourceMaps(
  distDir: string,
  result: ManifestValidationResult
): Promise<void> {
  const mapFiles = await findMapFiles(distDir);

  if (mapFiles.length > 0) {
    const relativePaths = mapFiles.map((f) => relative(distDir, f));
    result.checks.noSourceMaps = false;
    result.errors.push(
      `Source maps encontrados no diretorio de saida (${mapFiles.length} arquivo(s)): ${relativePaths.join(', ')}`
    );
  }
}

/**
 * Verifica se o CSP contém referências a localhost ou endereços locais.
 * Reutiliza LOCALHOST_PATTERNS do csp-builder.
 *
 * @param manifest - Objeto do manifest.json
 * @param result - Resultado da validação (mutado)
 */
export function checkLocalhostInCSP(
  manifest: Record<string, unknown>,
  result: ManifestValidationResult
): void {
  const csp = manifest['content_security_policy'] as
    | Record<string, string>
    | undefined;

  if (!csp) {
    // Sem CSP definido - não é erro para esta verificação
    return;
  }

  const extensionPages = csp['extension_pages'] ?? '';

  for (const pattern of LOCALHOST_PATTERNS) {
    if (extensionPages.includes(pattern)) {
      result.checks.noLocalhostInCSP = false;
      result.errors.push(
        `CSP contém referência a localhost: "${pattern}" encontrado em extension_pages`
      );
    }
  }
}

/**
 * Verifica se minimum_chrome_version está presente no manifest.
 *
 * @param manifest - Objeto do manifest.json
 * @param result - Resultado da validação (mutado)
 */
export function checkMinimumChromeVersion(
  manifest: Record<string, unknown>,
  result: ManifestValidationResult
): void {
  const version = manifest['minimum_chrome_version'];

  if (!version || typeof version !== 'string' || version.trim() === '') {
    result.checks.hasMinimumChromeVersion = false;
    result.errors.push(
      'Campo minimum_chrome_version ausente ou vazio no manifest'
    );
  }
}

/**
 * Verifica se web_accessible_resources contém referências a arquivos .map.
 *
 * @param manifest - Objeto do manifest.json
 * @param result - Resultado da validação (mutado)
 */
export function checkMapsInWebAccessibleResources(
  manifest: Record<string, unknown>,
  result: ManifestValidationResult
): void {
  const war = manifest['web_accessible_resources'] as
    | Array<{ resources?: string[] }>
    | undefined;

  if (!war || !Array.isArray(war)) {
    return;
  }

  for (const entry of war) {
    if (!entry.resources || !Array.isArray(entry.resources)) continue;

    for (const resource of entry.resources) {
      if (typeof resource === 'string' && resource.includes('.map')) {
        result.checks.noMapsInWebAccessibleResources = false;
        result.errors.push(
          `web_accessible_resources contém referência a .map: "${resource}"`
        );
      }
    }
  }
}

/**
 * Verifica se existem permissões declaradas sem uso correspondente no código-fonte.
 *
 * Para permissões em `permissions`: verifica se a API correspondente é usada no código.
 * Para permissões em `optional_permissions`: verifica se existe código que as solicita
 * via chrome.permissions.request (pois a API pode não estar em uso direto se a permissão
 * não foi concedida).
 *
 * @param manifest - Objeto do manifest.json
 * @param sourceContent - Conteúdo concatenado dos arquivos fonte
 * @param result - Resultado da validação (mutado)
 */
export function checkUnusedPermissions(
  manifest: Record<string, unknown>,
  sourceContent: string,
  result: ManifestValidationResult
): void {
  const permissions = (manifest['permissions'] as string[]) ?? [];
  const optionalPermissions =
    (manifest['optional_permissions'] as string[]) ?? [];

  // Verificar permissões obrigatórias
  for (const perm of permissions) {
    if (IMPLICIT_PERMISSIONS.has(perm)) {
      // Permissões implícitas emitem warning, não erro
      result.warnings.push(
        `Permissão "${perm}" é implícita (sem API direta) - considere documentar a justificativa`
      );
      continue;
    }

    const patterns = PERMISSION_API_PATTERNS[perm];
    if (!patterns) {
      // Permissão não mapeada na tabela - emite warning
      result.warnings.push(
        `Permissão "${perm}" não possui mapeamento de API conhecido - verificação manual recomendada`
      );
      continue;
    }

    const isUsed = patterns.some((pattern) => pattern.test(sourceContent));
    if (!isUsed) {
      result.checks.noUnusedPermissions = false;
      result.errors.push(
        `Permissão "${perm}" declarada em permissions mas sem uso correspondente no código-fonte`
      );
    }
  }

  // Verificar permissões opcionais: devem ter código que as solicita via chrome.permissions.request
  if (optionalPermissions.length > 0) {
    const hasPermissionRequest = PERMISSION_REQUEST_PATTERN.test(sourceContent);
    if (!hasPermissionRequest) {
      result.checks.noUnusedPermissions = false;
      result.errors.push(
        `Permissões opcionais declaradas (${optionalPermissions.join(', ')}) mas nenhuma chamada a chrome.permissions.request encontrada no código-fonte`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Função principal de validação
// ---------------------------------------------------------------------------

/**
 * Opções para a função de validação do manifest.
 */
export interface ValidateManifestOptions {
  /**
   * Diretório de código-fonte para verificação de uso de APIs.
   * Padrão: resolve(distDir, '..', 'src')
   */
  srcDir?: string;
}

/**
 * Valida o manifest.json gerado contra regras de conformidade MV3.
 *
 * Executa todas as verificações e retorna resultado consolidado.
 * Pode ser importado como módulo para testes ou executado como CLI.
 *
 * @param distDir - Diretório de saída do build (contém manifest.json)
 * @param options - Opções adicionais de validação
 * @returns Resultado da validação com erros, warnings e estado das verificações
 */
export async function validateManifest(
  distDir: string,
  options?: ValidateManifestOptions
): Promise<ManifestValidationResult> {
  const result: ManifestValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      noUnusedPermissions: true,
      noSourceMaps: true,
      noLocalhostInCSP: true,
      hasMinimumChromeVersion: true,
      noMapsInWebAccessibleResources: true,
    },
  };

  // Ler manifest.json
  const manifest = await readManifest(distDir);
  if (!manifest) {
    result.valid = false;
    result.errors.push(
      `Manifest não encontrado no diretório de saída: ${distDir}/manifest.json`
    );
    result.checks.noUnusedPermissions = false;
    result.checks.noLocalhostInCSP = false;
    result.checks.hasMinimumChromeVersion = false;
    result.checks.noMapsInWebAccessibleResources = false;
    return result;
  }

  // Determinar diretório de código-fonte
  const srcDir = options?.srcDir ?? resolve(distDir, '..', 'src');

  // Ler conteúdo dos arquivos fonte para verificação de APIs
  const sourceContent = await readAllSourceContent(srcDir);

  // Executar todas as verificações
  await checkSourceMaps(distDir, result);
  checkLocalhostInCSP(manifest, result);
  checkMinimumChromeVersion(manifest, result);
  checkMapsInWebAccessibleResources(manifest, result);
  checkUnusedPermissions(manifest, sourceContent, result);

  // Consolidar resultado: valid = true apenas se não há erros
  result.valid = result.errors.length === 0;

  return result;
}

// ---------------------------------------------------------------------------
// Modo CLI
// ---------------------------------------------------------------------------

/**
 * Verifica se o módulo está sendo executado diretamente como CLI.
 * Compatível com ESM (import.meta.url) e CommonJS (require.main).
 */
function isRunningAsCLI(): boolean {
  // ESM: verifica se o módulo é o ponto de entrada
  // Nota: em ambiente de teste (vitest), import.meta.url pode não corresponder ao argv
  try {
    const moduleUrl = new URL(import.meta.url).pathname;
    const scriptArg = process.argv[1];
    if (scriptArg && moduleUrl.endsWith(scriptArg.replace(/\\/g, '/'))) {
      return true;
    }
    // Comparação alternativa para caminhos absolutos
    if (scriptArg && resolve(scriptArg) === resolve(moduleUrl)) {
      return true;
    }
  } catch {
    // Fallback silencioso
  }
  return false;
}

/**
 * Ponto de entrada CLI.
 * Uso: npx tsx scripts/validate-manifest.ts [distDir]
 * Se distDir não for fornecido, usa ./dist como padrão.
 */
async function main(): Promise<void> {
  const distDir = process.argv[2] ?? './dist';
  const resolvedDir = resolve(distDir);

  console.info(`[ValidateManifest] Validando manifest em: ${resolvedDir}`);

  const result = await validateManifest(resolvedDir);

  // Exibir resultados
  if (result.warnings.length > 0) {
    console.info('\n[AVISO] Warnings:');
    for (const warning of result.warnings) {
      console.info(`  - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    console.error('\n[ERRO] Erros encontrados:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }

  // Exibir estado das verificações
  console.info('\n[INFO] Estado das verificações:');
  console.info(
    `  Sem permissões não utilizadas: ${result.checks.noUnusedPermissions ? 'OK' : 'FALHA'}`
  );
  console.info(
    `  Sem source maps: ${result.checks.noSourceMaps ? 'OK' : 'FALHA'}`
  );
  console.info(
    `  Sem localhost no CSP: ${result.checks.noLocalhostInCSP ? 'OK' : 'FALHA'}`
  );
  console.info(
    `  minimum_chrome_version presente: ${result.checks.hasMinimumChromeVersion ? 'OK' : 'FALHA'}`
  );
  console.info(
    `  Sem .map em web_accessible_resources: ${result.checks.noMapsInWebAccessibleResources ? 'OK' : 'FALHA'}`
  );

  if (result.valid) {
    console.info('\n[INFO] Validação concluída com sucesso.');
  } else {
    console.error(
      `\n[ERRO] Validação falhou com ${result.errors.length} erro(s).`
    );
    process.exit(1);
  }
}

if (isRunningAsCLI()) {
  main().catch((err: unknown) => {
    console.error('[ERRO] Falha inesperada na validação:', err);
    process.exit(1);
  });
}
