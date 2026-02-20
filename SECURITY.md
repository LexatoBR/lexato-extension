# Política de Segurança

A [Lexato](https://lexato.com.br) leva segurança a sério. Como a única ferramenta de captura de provas digitais open source do Brasil, incentivamos auditorias independentes e valorizamos a colaboração de pesquisadores de segurança.

## Reportando Vulnerabilidades

Se você descobriu uma vulnerabilidade de segurança, **NÃO abra uma issue pública**. Entre em contato diretamente:

- **E-mail**: security@lexato.com.br
- **Assunto**: `[SECURITY] <breve descrição>`

Responderemos em até 72 horas úteis. Vulnerabilidades confirmadas serão corrigidas com prioridade máxima e o pesquisador será creditado (se desejar) no changelog.

## Padrões de Segurança Adotados

A [Lexato](https://lexato.com.br) adota uma arquitetura **Zero Trust** e segue padrões internacionais de segurança. Nenhum componente confia implicitamente em outro — cada operação é verificada, cada artefato é validado, cada comunicação é autenticada.

| Padrão | Aplicação |
|--------|-----------|
| **Zero Trust** | Verificação contínua em cada etapa; nenhuma confiança implícita entre componentes |
| **FIPS 140-3** | Criptografia AES-256-GCM para armazenamento local de tokens e dados sensíveis |
| **FIPS 204 (ML-DSA-87)** | Assinatura digital pós-quântica para proteção contra ameaças futuras |
| **ISO/IEC 27037** | Diretrizes para coleta e preservação de evidências digitais |
| **CPP Arts. 158-A a 158-F** | Conformidade com a cadeia de custódia do Código de Processo Penal brasileiro |
| **ICP-Brasil** | Carimbo de tempo com validade jurídica via Autoridade Certificadora credenciada |
| **LGPD** | Proteção de dados pessoais — sem telemetria oculta, geolocalização apenas com consentimento |

## Configuração de Credenciais

Este repositório **não contém credenciais reais**. Para compilar e executar, configure o `.env.local` a partir do `.env.example`:

```bash
cp .env.example .env.local
# Edite .env.local com suas credenciais
```

### Credenciais necessárias

**Supabase** — banco de dados e autenticação:

```bash
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

**Google OAuth2** — login nativo via `chrome.identity` ([como obter](https://developer.chrome.com/docs/extensions/mv3/tut_oauth/)):

```bash
VITE_GOOGLE_CLIENT_ID=SEU_CLIENT_ID.apps.googleusercontent.com
```

**Sentry** (opcional) — monitoramento de erros:

```bash
VITE_SENTRY_DSN=https://SUA_KEY@SEU_ORG.ingest.us.sentry.io/SEU_PROJETO_ID
```

## Boas Práticas Implementadas

- **Nunca** commite arquivos `.env*` com credenciais reais — o `.gitignore` já os exclui
- Os bundles gerados em `dist/` podem conter credenciais compiladas — nunca os commite
- Tokens são armazenados localmente com criptografia **AES-256-GCM** (FIPS 140-3) via `chrome.storage.local`
- Source maps são excluídos do bundle de produção para proteger o código-fonte
- Content Security Policy restritiva — sem `unsafe-eval`, sem `unsafe-inline`
- Modo lockdown desativa DevTools e extensões de terceiros durante capturas
- Evidências armazenadas com **S3 Object Lock (WORM)** — imutáveis após gravação
- Testes de propriedade validam invariantes criptográficas (hashing, Merkle tree, cadeia de custódia)

## Escopo da Auditoria

O código neste repositório cobre a camada de captura (extensão Chrome). O processamento backend — incluindo certificação blockchain (Polygon, Arbitrum, Optimism), carimbo ICP-Brasil e armazenamento S3 Object Lock — é operado pela [Lexato](https://lexato.com.br) e não faz parte deste repositório.

Para mais informações sobre a plataforma completa, visite [lexato.com.br](https://lexato.com.br).
