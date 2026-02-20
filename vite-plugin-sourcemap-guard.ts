/**
 * Plugin Vite para garantir remoção de source maps do pacote de produção.
 *
 * Fluxo esperado em produção:
 * 1. Vite gera .map com sourcemap: 'hidden' (sem sourceMappingURL nos .js)
 * 2. Plugin Sentry faz upload dos .map para o servidor
 * 3. Plugin Sentry deleta os .map do dist via filesToDeleteAfterUpload
 * 4. Este plugin atua como fallback e verificação final:
 *    - Se o Sentry NÃO estiver configurado (sem SENTRY_AUTH_TOKEN), deleta os .map manualmente
 *    - Verifica que nenhum .map permaneceu no diretório de saída
 *
 * Em desenvolvimento, source maps são gerados normalmente (sourcemap: true)
 * e este plugin NÃO interfere.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 * @module VitePluginSourcemapGuard
 */

import type { Plugin, ResolvedConfig } from 'vite';
import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Resultado da verificação pós-build de source maps
 */
export interface SourcemapGuardResult {
  /** Se a verificação passou (nenhum .map encontrado) */
  clean: boolean;
  /** Arquivos .map encontrados no diretório de saída */
  foundMapFiles: string[];
  /** Arquivos .map deletados pelo fallback */
  deletedMapFiles: string[];
  /** Se o fallback de remoção foi executado */
  fallbackExecuted: boolean;
}

/**
 * Busca recursivamente todos os arquivos .map em um diretório.
 *
 * @param dir - Diretório raiz para busca
 * @returns Lista de caminhos absolutos dos arquivos .map encontrados
 */
export async function findMapFiles(dir: string): Promise<string[]> {
  const mapFiles: string[] = [];

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    // Diretório não existe ou não é acessível
    return mapFiles;
  }

  for (const name of names) {
    const fullPath = join(dir, name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const nested = await findMapFiles(fullPath);
        mapFiles.push(...nested);
      } else if (stat.isFile() && name.endsWith('.map')) {
        mapFiles.push(fullPath);
      }
    } catch {
      // Arquivo inacessível - ignora
    }
  }

  return mapFiles;
}

/**
 * Deleta uma lista de arquivos do sistema de arquivos.
 *
 * @param files - Lista de caminhos absolutos para deletar
 * @returns Lista de arquivos efetivamente deletados
 */
export async function deleteFiles(files: string[]): Promise<string[]> {
  const deleted: string[] = [];

  for (const file of files) {
    try {
      await fs.unlink(file);
      deleted.push(file);
    } catch {
      // Arquivo já foi removido ou não é acessível - ignora silenciosamente
    }
  }

  return deleted;
}

/**
 * Executa a verificação e limpeza de source maps no diretório de saída.
 *
 * @param outDir - Diretório de saída do build (dist)
 * @param hasSentryPlugin - Se o plugin Sentry está ativo neste build
 * @returns Resultado da verificação
 */
export async function executeSourcemapGuard(
  outDir: string,
  hasSentryPlugin: boolean
): Promise<SourcemapGuardResult> {
  const result: SourcemapGuardResult = {
    clean: false,
    foundMapFiles: [],
    deletedMapFiles: [],
    fallbackExecuted: false,
  };

  // Busca arquivos .map no diretório de saída
  const mapFiles = await findMapFiles(outDir);

  if (mapFiles.length === 0) {
    // Nenhum .map encontrado - tudo limpo (Sentry já deletou ou não foram gerados)
    result.clean = true;
    return result;
  }

  // Arquivos .map encontrados - registra caminhos relativos para legibilidade
  result.foundMapFiles = mapFiles.map((f) => relative(outDir, f));

  if (!hasSentryPlugin) {
    // Sentry não configurado - executa fallback de remoção manual
    result.fallbackExecuted = true;
    const deleted = await deleteFiles(mapFiles);
    result.deletedMapFiles = deleted.map((f) => relative(outDir, f));

    console.info(
      `[SourcemapGuard] Sentry nao configurado. Removidos ${deleted.length} arquivo(s) .map do diretorio de saida.`
    );
  }

  // Limpa referências a .map no manifest.json (web_accessible_resources)
  await cleanManifestMapReferences(outDir);

  // Verificação final: busca novamente para confirmar limpeza
  const remaining = await findMapFiles(outDir);
  result.clean = remaining.length === 0;

  if (!result.clean) {
    const remainingRelative = remaining.map((f) => relative(outDir, f));
    console.error(
      `[SourcemapGuard] ERRO: ${remaining.length} arquivo(s) .map ainda presentes no diretorio de saida: ${remainingRelative.join(', ')}`
    );
  }

  return result;
}
/**
 * Remove referências a arquivos .map do manifest.json (web_accessible_resources).
 * O CRXJS plugin adiciona .map ao manifest mesmo quando os arquivos são removidos.
 *
 * @param outDir - Diretório de saída do build (dist)
 */
export async function cleanManifestMapReferences(outDir: string): Promise<void> {
  const manifestPath = join(outDir, 'manifest.json');
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    let modified = false;
    if (Array.isArray(manifest.web_accessible_resources)) {
      for (const entry of manifest.web_accessible_resources) {
        if (Array.isArray(entry.resources)) {
          const before = entry.resources.length;
          entry.resources = entry.resources.filter(
            (r: string) => !r.endsWith('.map')
          );
          if (entry.resources.length < before) {
            modified = true;
          }
        }
      }
    }

    if (modified) {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      console.info('[SourcemapGuard] Removidas referencias .map do manifest.json (web_accessible_resources).');
    }
  } catch {
    // manifest.json nao encontrado ou nao parseavel - ignora
  }
}

/**
 * Verifica se o plugin Sentry está presente na lista de plugins do Vite.
 *
 * @param plugins - Lista de plugins resolvidos pelo Vite
 * @returns true se o plugin Sentry está presente
 */
export function hasSentryPluginInConfig(
  plugins: readonly { name: string }[]
): boolean {
  return plugins.some(
    (p) =>
      p.name.toLowerCase().includes('sentry') ||
      p.name.toLowerCase().includes('sentry-vite')
  );
}

/**
 * Cria o plugin Vite de guarda de source maps.
 *
 * O plugin atua apenas em builds de produção (mode === 'production').
 * Em desenvolvimento, não interfere.
 *
 * @returns Plugin Vite configurado
 */
export function sourcemapGuardPlugin(): Plugin {
  let config: ResolvedConfig;
  let isProduction = false;

  return {
    name: 'lexato-sourcemap-guard',

    // Captura a configuração resolvida para acessar outDir e plugins
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      isProduction = resolvedConfig.mode === 'production';
    },

    // Executa após o bundle ser fechado (todos os plugins já processaram)
    async closeBundle() {
      if (!isProduction) {
        return;
      }

      const outDir = config.build.outDir;
      const sentryActive = hasSentryPluginInConfig(config.plugins);

      console.info('[SourcemapGuard] Verificando source maps no diretorio de saida...');

      const result = await executeSourcemapGuard(outDir, sentryActive);

      if (result.fallbackExecuted) {
        console.info(
          `[SourcemapGuard] Fallback executado: ${result.deletedMapFiles.length} arquivo(s) .map removidos.`
        );
      }

      if (result.clean) {
        console.info('[SourcemapGuard] Verificacao concluida: nenhum .map no pacote de producao.');
      } else {
        // Falha na verificação - lança erro para interromper o build
        throw new Error(
          `[SourcemapGuard] Falha na verificacao: arquivos .map encontrados no pacote de producao: ${result.foundMapFiles.join(', ')}`
        );
      }
    },
  };
}
