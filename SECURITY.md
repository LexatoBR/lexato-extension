# Política de Segurança

## Reportando Vulnerabilidades

Se você descobriu uma vulnerabilidade de segurança, **NÃO abra uma issue pública**. Entre em contato diretamente:

- **E-mail**: security@lexato.com.br
- **Assunto**: `[SECURITY] <breve descrição>`

Responderemos em até 72 horas úteis.

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

## Boas Práticas

- **Nunca** commite arquivos `.env*` com credenciais reais — o `.gitignore` já os exclui
- Os bundles gerados em `dist/` podem conter credenciais compiladas — nunca os commite
- Tokens são armazenados localmente com criptografia **AES-256-GCM** via `chrome.storage.local`
- Source maps são excluídos do bundle de produção para proteger o código-fonte
