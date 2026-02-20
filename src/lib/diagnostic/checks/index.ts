/**
 * Verificações de diagnóstico da extensão Lexato
 *
 * Cada verificação testa um aspecto específico da integridade da extensão.
 * Todas as verificações seguem o padrão DiagnosticCheckConfig.
 *
 * @module DiagnosticChecks
 */

import type { DiagnosticCheckConfig, DiagnosticCheckResult } from '../diagnostic.types';

// ============================================================================
// 1. VERIFICAÇÕES DE PERMISSÕES
// ============================================================================

/**
 * Verifica permissões do Chrome necessárias para funcionamento
 */
export const checkPermissions: DiagnosticCheckConfig = {
  id: 'permissions',
  name: 'Permissões do Navegador',
  description: 'Verifica se todas as permissões necessárias estão concedidas',
  tooltip: 'A extensão precisa de permissões específicas do Chrome para capturar tela, gravar vídeo e armazenar dados. Sem essas permissões, funcionalidades essenciais não funcionarão.',
  category: 'permissions',
  priority: 1,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      const requiredPermissions = [
        'storage',
        'tabs',
        'scripting',
        'notifications',
        'alarms',
        'offscreen',
        'tabCapture',
      ];

      const granted = await chrome.permissions.getAll();
      const grantedSet = new Set(granted.permissions ?? []);

      const missing = requiredPermissions.filter((p) => !grantedSet.has(p));

      if (missing.length === 0) {
        return {
          status: 'success',
          message: 'Todas as permissões necessárias estão concedidas',
          details: { granted: Array.from(grantedSet) },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'error',
        message: `Permissões faltando: ${missing.join(', ')}`,
        details: { missing, granted: Array.from(grantedSet) },
        durationMs: performance.now() - start,
        canAutoFix: false,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar permissões',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 2. VERIFICAÇÃO DO SERVICE WORKER
// ============================================================================

/**
 * Verifica se o Service Worker está ativo e respondendo
 */
export const checkServiceWorker: DiagnosticCheckConfig = {
  id: 'service-worker',
  name: 'Service Worker (Background)',
  description: 'Verifica se o Service Worker está ativo e respondendo a mensagens',
  tooltip: 'O Service Worker é o "cérebro" da extensão que roda em segundo plano. Ele coordena capturas, gerencia autenticação e processa dados. Se não estiver respondendo, a extensão não funcionará.',
  category: 'serviceWorker',
  priority: 2,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      // Envia mensagem de ping para o service worker
      const response = await Promise.race([
        chrome.runtime.sendMessage({ type: 'DIAGNOSTIC_PING' }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ]);

      const typedResponse = response as { success?: boolean; timestamp?: string } | undefined;

      if (typedResponse?.success) {
        return {
          status: 'success',
          message: 'Service Worker ativo e respondendo',
          details: { responseTime: performance.now() - start, timestamp: typedResponse.timestamp },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'warning',
        message: 'Service Worker respondeu mas sem confirmação',
        details: { response: typedResponse },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Service Worker não está respondendo',
        details: { error: String(err) },
        durationMs: performance.now() - start,
        canAutoFix: true,
        autoFixFn: async () => {
          // Tenta recarregar a extensão
          try {
            chrome.runtime.reload();
            return true;
          } catch {
            return false;
          }
        },
      };
    }
  },
};

// ============================================================================
// 3. VERIFICAÇÃO DE OFFSCREEN DOCUMENT
// ============================================================================

/**
 * Verifica capacidade de criar Offscreen Documents
 */
export const checkOffscreenCapability: DiagnosticCheckConfig = {
  id: 'offscreen-capability',
  name: 'Offscreen Document',
  description: 'Verifica capacidade de criar documentos offscreen para gravação de vídeo',
  tooltip: 'Documentos Offscreen são necessários para gravação de vídeo no Manifest V3. Eles permitem acesso a APIs de mídia que não estão disponíveis no Service Worker.',
  category: 'offscreen',
  priority: 3,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      // Verifica se a API offscreen está disponível
      if (!chrome.offscreen) {
        return {
          status: 'error',
          message: 'API Offscreen não disponível neste navegador',
          durationMs: performance.now() - start,
        };
      }

      // Verifica se já existe um documento offscreen
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      });

      if (existingContexts.length > 0) {
        return {
          status: 'success',
          message: 'Offscreen Document já está ativo',
          details: { contexts: existingContexts.length },
          durationMs: performance.now() - start,
        };
      }

      // Tenta criar um documento offscreen de teste
      try {
        await chrome.offscreen.createDocument({
          url: 'src/offscreen/offscreen.html',
          reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
          justification: 'Teste de diagnóstico - verificação de capacidade',
        });

        // Fecha imediatamente após o teste
        await chrome.offscreen.closeDocument();

        return {
          status: 'success',
          message: 'Capacidade de criar Offscreen Document verificada',
          durationMs: performance.now() - start,
        };
      } catch (createErr) {
        // Se falhou ao criar, pode ser que já existe
        const errMsg = String(createErr);
        if (errMsg.includes('already exists') || errMsg.includes('Only a single')) {
          return {
            status: 'success',
            message: 'Offscreen Document já existe (em uso)',
            durationMs: performance.now() - start,
          };
        }

        return {
          status: 'warning',
          message: 'Não foi possível criar Offscreen Document de teste',
          details: { error: errMsg },
          durationMs: performance.now() - start,
        };
      }
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar Offscreen Document',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 4. VERIFICAÇÃO DE CODECS DE VÍDEO
// ============================================================================

/**
 * Verifica suporte a codecs de vídeo (VP9/VP8)
 */
export const checkVideoCodecs: DiagnosticCheckConfig = {
  id: 'video-codecs',
  name: 'Codecs de Vídeo',
  description: 'Verifica suporte a codecs VP9/VP8 para gravação de vídeo',
  tooltip: 'Codecs VP9 e VP8 são formatos de compressão de vídeo usados para gravar capturas. VP9 oferece melhor qualidade com menor tamanho de arquivo. Pelo menos um codec deve estar disponível.',
  category: 'codecs',
  priority: 4,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      const codecs = [
        { mimeType: 'video/webm;codecs=vp9,opus', name: 'VP9 + Opus' },
        { mimeType: 'video/webm;codecs=vp8,opus', name: 'VP8 + Opus' },
        { mimeType: 'video/webm;codecs=vp9', name: 'VP9' },
        { mimeType: 'video/webm;codecs=vp8', name: 'VP8' },
        { mimeType: 'video/webm', name: 'WebM básico' },
      ];

      const supported: string[] = [];
      const unsupported: string[] = [];

      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec.mimeType)) {
          supported.push(codec.name);
        } else {
          unsupported.push(codec.name);
        }
      }

      if (supported.length === 0) {
        return {
          status: 'error',
          message: 'Nenhum codec de vídeo suportado',
          details: { supported, unsupported },
          durationMs: performance.now() - start,
        };
      }

      const bestCodec = supported[0];

      return {
        status: 'success',
        message: `Codec preferido: ${bestCodec}`,
        details: { supported, unsupported, preferred: bestCodec },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar codecs',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 5. VERIFICAÇÃO DE CRYPTO (SHA-256)
// ============================================================================

/**
 * Verifica disponibilidade de crypto.subtle para hashes SHA-256
 */
export const checkCryptoCapability: DiagnosticCheckConfig = {
  id: 'crypto-sha256',
  name: 'Criptografia SHA-256',
  description: 'Verifica disponibilidade de crypto.subtle para cálculo de hashes forenses',
  tooltip: 'SHA-256 é usado para calcular a "impressão digital" única de cada captura. Esse hash garante a integridade forense e é registrado na blockchain para comprovar que o arquivo não foi alterado.',
  category: 'crypto',
  priority: 5,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      // Verifica se crypto.subtle está disponível
      if (!crypto?.subtle) {
        return {
          status: 'error',
          message: 'crypto.subtle não disponível',
          durationMs: performance.now() - start,
        };
      }

      // Testa cálculo de hash SHA-256
      const testData = new TextEncoder().encode('Lexato Diagnostic Test');
      const hashBuffer = await crypto.subtle.digest('SHA-256', testData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (hashHex.length === 64) {
        return {
          status: 'success',
          message: 'SHA-256 funcionando corretamente',
          details: { testHash: hashHex.substring(0, 16) + '...' },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'warning',
        message: 'Hash SHA-256 gerado com tamanho inesperado',
        details: { hashLength: hashHex.length },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao calcular hash SHA-256',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 6. VERIFICAÇÃO DE STORAGE
// ============================================================================

/**
 * Verifica espaço disponível no chrome.storage
 */
export const checkStorageSpace: DiagnosticCheckConfig = {
  id: 'storage-space',
  name: 'Armazenamento Local',
  description: 'Verifica espaço disponível para armazenamento de capturas pendentes',
  tooltip: 'O armazenamento local guarda configurações, tokens de autenticação e dados temporários. Se estiver cheio, novas capturas podem falhar. Recomendamos manter pelo menos 20% livre.',
  category: 'storage',
  priority: 6,
  critical: false,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      // Obtém uso atual do storage
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quotaBytes = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB padrão

      const usedMB = (bytesInUse / 1024 / 1024).toFixed(2);
      const totalMB = (quotaBytes / 1024 / 1024).toFixed(2);
      const percentUsed = ((bytesInUse / quotaBytes) * 100).toFixed(1);

      if (parseFloat(percentUsed) > 90) {
        return {
          status: 'warning',
          message: `Armazenamento quase cheio: ${percentUsed}% usado`,
          details: { usedMB, totalMB, percentUsed, bytesInUse, quotaBytes },
          durationMs: performance.now() - start,
          canAutoFix: true,
          autoFixFn: async () => {
            // Limpa dados antigos de cache
            try {
              await chrome.storage.local.remove(['lexato_cache', 'lexato_temp']);
              return true;
            } catch {
              return false;
            }
          },
        };
      }

      return {
        status: 'success',
        message: `${usedMB}MB de ${totalMB}MB usado (${percentUsed}%)`,
        details: { usedMB, totalMB, percentUsed, bytesInUse, quotaBytes },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar armazenamento',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 7. VERIFICAÇÃO DE CONECTIVIDADE COM API
// ============================================================================

/**
 * Verifica conectividade com a API do backend
 */
export const checkApiConnectivity: DiagnosticCheckConfig = {
  id: 'api-connectivity',
  name: 'Conexão com API',
  description: 'Verifica conectividade e latência com os servidores Lexato',
  tooltip: 'A API Lexato processa suas capturas, gerencia certificações e armazena provas digitais. Latência alta pode indicar problemas de rede. Ideal: menos de 500ms.',
  category: 'api',
  priority: 7,
  critical: true,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      // Endpoints para teste de conectividade
      // A extensão tem host_permissions: <all_urls>, então pode fazer fetch sem no-cors
      // URLs obtidas dinamicamente da configuração de ambiente
      const apiUrl = (await import('../../config/environment')).getApiUrl();
      const endpoints = [
        { url: apiUrl, name: 'API' },
      ];

      let lastError: string | undefined;

      for (const endpoint of endpoints) {
        try {
          const response = await Promise.race([
            fetch(endpoint.url, {
              method: 'HEAD',
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout após 10s')), 10000)
            ),
          ]);

          const latency = Math.round(performance.now() - start);

          // Qualquer resposta HTTP (mesmo 401/403) indica conectividade OK
          if (response.status > 0) {
            return {
              status: 'success',
              message: `Conectividade verificada via ${endpoint.name} (latência: ${latency}ms)`,
              details: { latency, status: response.status, endpoint: endpoint.name },
              durationMs: latency,
            };
          }
        } catch (err) {
          lastError = String(err);
          // Tenta o próximo endpoint
          continue;
        }
      }

      // Se chegou aqui, nenhum endpoint respondeu
      const errMsg = lastError ?? 'Nenhum endpoint acessível';

      if (errMsg.includes('Timeout')) {
        return {
          status: 'warning',
          message: 'API demorou muito para responder',
          details: { error: errMsg },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'error',
        message: 'Sem conexão com a internet ou API indisponível',
        details: { error: errMsg },
        durationMs: performance.now() - start,
        canAutoFix: true,
        autoFixFn: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        }
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao conectar com a API',
        details: { error: String(err) },
        durationMs: performance.now() - start,
        canAutoFix: true,
        autoFixFn: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return true;
        }
      };
    }
  },
};

// ============================================================================
// 8. VERIFICAÇÃO DE AUTENTICAÇÃO
// ============================================================================

/**
 * Verifica se os tokens de autenticação estão válidos
 */
export const checkAuthTokens: DiagnosticCheckConfig = {
  id: 'auth-tokens',
  name: 'Tokens de Autenticação',
  description: 'Verifica se os tokens de autenticação estão válidos e não expirados',
  tooltip: 'Tokens de autenticação (Cognito) identificam você nos servidores Lexato. Tokens expirados impedem o envio de capturas. O sistema renova automaticamente, mas problemas podem ocorrer.',
  category: 'auth',
  priority: 8,
  critical: false,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      const result = await chrome.storage.local.get([
        'lexato_access_token',
        'lexato_expires_at',
        'lexato_user',
      ]);

      const accessToken = result['lexato_access_token'] as string | undefined;
      const expiresAt = result['lexato_expires_at'] as number | undefined;
      const user = result['lexato_user'] as { email?: string } | undefined;

      if (!accessToken) {
        return {
          status: 'warning',
          message: 'Usuário não autenticado',
          details: { hasToken: false },
          durationMs: performance.now() - start,
          canAutoFix: true,
          autoFixFn: async () => {
            // Abre página de login
            chrome.tabs.create({ url: 'https://app.lexato.com.br/login' });
            return true;
          }
        };
      }

      if (!expiresAt) {
        return {
          status: 'warning',
          message: 'Token sem data de expiração',
          details: { hasToken: true, hasExpiry: false },
          durationMs: performance.now() - start,
        };
      }

      const now = Date.now();
      const timeToExpiry = expiresAt - now;
      const minutesToExpiry = Math.round(timeToExpiry / 60000);

      if (timeToExpiry <= 0) {
        return {
          status: 'error',
          message: 'Token expirado - faça login novamente',
          details: { expired: true, expiredAgo: -minutesToExpiry },
          durationMs: performance.now() - start,
          canAutoFix: true,
          autoFixFn: async () => {
             // Abre página de login
            chrome.tabs.create({ url: 'https://app.lexato.com.br/login' });
            return true;
          }
        };
      }

      if (minutesToExpiry < 5) {
        return {
          status: 'warning',
          message: `Token expira em ${minutesToExpiry} minutos`,
          details: { minutesToExpiry, userEmail: maskEmail(user?.email) },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'success',
        message: `Autenticado como ${maskEmail(user?.email)}`,
        details: { minutesToExpiry, userEmail: maskEmail(user?.email) },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar autenticação',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 9. VERIFICAÇÃO DE BLOCKCHAIN
// ============================================================================

/**
 * Verifica conectividade com as redes blockchain
 */
export const checkBlockchainConnectivity: DiagnosticCheckConfig = {
  id: 'blockchain-connectivity',
  name: 'Conexão Blockchain',
  description: 'Verifica conectividade com Polygon, Arbitrum e Optimism',
  tooltip: 'Suas provas são registradas em 3 blockchains: Polygon (primário), Arbitrum (secundário) e Optimism (Merkle Tree). Isso garante imutabilidade e validade jurídica das capturas.',
  category: 'blockchain',
  priority: 9,
  critical: false,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    /**
     * Testa um RPC fazendo eth_blockNumber e validando a resposta JSON-RPC.
     * Retorna o block number hex se bem-sucedido, null caso contrário.
     * Nota: Alguns RPCs retornam HTTP 200 mas com erro JSON-RPC (ex: Ankr exige API key).
     */
    const testRpc = async (
      url: string,
      timeoutMs = 8000
    ): Promise<{ blockNumber: string; latency: number } | null> => {
      try {
        const rpcStart = performance.now();
        const response = await Promise.race([
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_blockNumber',
              params: [],
              id: 1,
            }),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          ),
        ]);

        // Verifica o conteúdo JSON-RPC, não apenas o status HTTP
        const data = (await response.json()) as {
          result?: string;
          error?: unknown;
        };

        // Sucesso: deve ter 'result' com hex válido (0x...) e sem 'error'
        if (data.result && !data.error && data.result.startsWith('0x')) {
          return {
            blockNumber: data.result,
            latency: Math.round(performance.now() - rpcStart),
          };
        }

        return null;
      } catch {
        return null;
      }
    };

    try {
      // RPCs públicos verificados (sem necessidade de API key)
      const networks = [
        {
          name: 'Polygon',
          rpcs: [
            'https://polygon-bor-rpc.publicnode.com',
            'https://1rpc.io/matic',
          ],
        },
        {
          name: 'Arbitrum',
          rpcs: [
            'https://arb1.arbitrum.io/rpc',
            'https://arbitrum-one-rpc.publicnode.com',
          ],
        },
        {
          name: 'Optimism',
          rpcs: [
            'https://mainnet.optimism.io',
            'https://optimism-rpc.publicnode.com',
          ],
        },
      ];

      // Testa todas as redes em paralelo, com fallback sequencial por rede
      const results = await Promise.all(
        networks.map(async (network) => {
          for (const rpc of network.rpcs) {
            const result = await testRpc(rpc);
            if (result) {
              return {
                name: network.name,
                status: 'ok' as const,
                latency: result.latency,
                blockNumber: result.blockNumber,
              };
            }
          }
          return { name: network.name, status: 'error' as const };
        })
      );

      const okCount = results.filter((r) => r.status === 'ok').length;
      const totalCount = results.length;

      if (okCount === totalCount) {
        return {
          status: 'success',
          message: `Todas as ${totalCount} redes blockchain acessíveis`,
          details: { networks: results },
          durationMs: performance.now() - start,
        };
      }

      if (okCount > 0) {
        const failedNames = results
          .filter((r) => r.status === 'error')
          .map((r) => r.name)
          .join(', ');
        return {
          status: 'warning',
          message: `${okCount} de ${totalCount} redes acessíveis (${failedNames} indisponível)`,
          details: { networks: results },
          durationMs: performance.now() - start,
        };
      }

      return {
        status: 'error',
        message: 'Nenhuma rede blockchain acessível',
        details: { networks: results },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Erro ao verificar blockchain',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// 10. VERIFICAÇÃO DE VERSÃO DA EXTENSÃO
// ============================================================================

/**
 * Verifica se há atualização disponível para a extensão
 */
export const checkExtensionVersion: DiagnosticCheckConfig = {
  id: 'extension-version',
  name: 'Versão da Extensão',
  description: 'Verifica se a extensão está atualizada',
  tooltip: 'Manter a extensão atualizada garante acesso às últimas funcionalidades, correções de segurança e compatibilidade com os servidores Lexato.',
  category: 'permissions',
  priority: 10,
  critical: false,
  check: async (): Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category'>> => {
    const start = performance.now();

    try {
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;

      // Tenta buscar versão mais recente da API
      // NOTA: Usar URL direta do API Gateway (domínio customizado não configurado)
      try {
        const response = await Promise.race([
          fetch('https://api.lexato.com.br/extension/version', { method: 'GET' }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          ),
        ]);

        if (response.ok) {
          const data = await response.json() as { version?: string };
          const latestVersion = data.version;

          if (latestVersion && latestVersion !== currentVersion) {
            return {
              status: 'warning',
              message: `Atualização disponível: v${latestVersion}`,
              details: { currentVersion, latestVersion },
              durationMs: performance.now() - start,
            };
          }

          return {
            status: 'success',
            message: `Versão ${currentVersion} (atualizada)`,
            details: { currentVersion, latestVersion },
            durationMs: performance.now() - start,
          };
        }
      } catch {
        // Se não conseguiu verificar, apenas mostra versão atual
      }

      return {
        status: 'success',
        message: `Versão ${currentVersion}`,
        details: { currentVersion },
        durationMs: performance.now() - start,
      };
    } catch (err) {
      return {
        status: 'warning',
        message: 'Não foi possível verificar versão',
        details: { error: String(err) },
        durationMs: performance.now() - start,
      };
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Mascara email para exibição segura
 */
function maskEmail(email?: string): string {
  if (!email) {
    return '***';
  }
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return '***';
  }
  const maskedLocal = local.substring(0, 2) + '***';
  return `${maskedLocal}@${domain}`;
}

// ============================================================================
// EXPORTAÇÃO DE TODAS AS VERIFICAÇÕES
// ============================================================================

/**
 * Lista de todas as verificações de diagnóstico
 * Ordenadas por prioridade (menor = executa primeiro)
 */
export const allDiagnosticChecks: DiagnosticCheckConfig[] = [
  checkPermissions,
  checkServiceWorker,
  checkOffscreenCapability,
  checkVideoCodecs,
  checkCryptoCapability,
  checkStorageSpace,
  checkApiConnectivity,
  checkAuthTokens,
  checkBlockchainConnectivity,
  checkExtensionVersion,
].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
