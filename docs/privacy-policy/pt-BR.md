# Política de Privacidade - Extensão Chrome Lexato

**Data de vigência:** 10 de fevereiro de 2026
**Última atualização:** 10 de fevereiro de 2026
**Versão:** 1.0.0

---

## 1. Introdução

Esta Política de Privacidade descreve como a extensão Chrome **Lexato - Registro de Provas Digitais** ("Extensão") coleta, utiliza, armazena e protege os dados dos seus usuários.

**Controlador de dados:**
Lexato Tecnologia Ltda.
E-mail: privacidade@lexato.com.br
Site: https://lexato.com.br

A Extensão é uma ferramenta de captura e certificação de provas digitais com validade jurídica, desenvolvida em conformidade com a **Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)** e a norma **ISO/IEC 27037** para identificação, coleta, aquisição e preservação de evidências digitais.

O uso da Extensão implica o conhecimento e a aceitação desta Política de Privacidade. Recomendamos a leitura integral deste documento antes de utilizar nossos serviços.

---

## 2. Dados Coletados

### 2.1 Dados coletados ativamente durante capturas

A Extensão coleta os seguintes dados **exclusivamente quando o usuário inicia explicitamente uma captura de prova digital**:

- **Screenshots**: Imagens da tela capturada pelo usuário
- **Vídeos**: Gravações de navegação realizadas pelo usuário
- **Metadados forenses**:
  - URL da página capturada
  - Título da página
  - Timestamp (data e hora exatos da captura, com fuso horário)
  - Endereço IP do usuário
  - Geolocalização (quando autorizada pelo usuário)
  - DNS reverso do servidor da página capturada
  - Informações WHOIS do domínio capturado
  - Registro do Wayback Machine (Internet Archive) da página
- **URLs visitadas durante captura de vídeo**: Log de navegação forense registrado apenas durante gravações de vídeo ativas

### 2.2 Dados de autenticação

- **Tokens OAuth2**: Tokens de autenticação obtidos via Supabase (auth.lexato.com.br) para identificação do usuário e acesso aos serviços da plataforma

### 2.3 Dados opcionais (coletados apenas com permissão explícita)

- **Lista de extensões instaladas**: Coletada apenas quando o usuário concede a permissão `management`, utilizada para isolamento de extensões durante capturas (garantia de integridade forense)
- **Geolocalização**: Coletada apenas quando o usuário concede a permissão `geolocation`, utilizada como metadado forense complementar

### 2.4 Dados NÃO coletados

A Extensão **NÃO** coleta, em nenhuma circunstância:

- Histórico de navegação fora de capturas ativas
- Cookies ou dados de sessão de sites visitados
- Dados de formulários preenchidos pelo usuário
- Senhas ou credenciais de acesso a outros serviços
- Dados financeiros (números de cartão de crédito, dados bancários)

---

## 3. Finalidade do Tratamento

| Dado | Finalidade | Base Legal (LGPD) |
|------|-----------|-------------------|
| Screenshots e vídeos | Constituição de prova digital com validade jurídica | Execução de contrato (Art. 7, V) |
| Metadados forenses (URL, título, timestamp) | Garantia da cadeia de custódia e autenticidade da prova | Execução de contrato (Art. 7, V) |
| Endereço IP | Identificação da origem da captura para fins forenses | Legítimo interesse (Art. 7, IX) |
| Geolocalização | Metadado forense complementar para localização da captura | Consentimento (Art. 7, I) |
| DNS reverso e WHOIS | Verificação da identidade do servidor e domínio capturado | Execução de contrato (Art. 7, V) |
| Wayback Machine | Registro histórico da página para comparação temporal | Execução de contrato (Art. 7, V) |
| URLs durante captura de vídeo | Log de navegação forense para integridade da gravação | Execução de contrato (Art. 7, V) |
| Tokens OAuth2 | Autenticação e identificação do usuário na plataforma | Execução de contrato (Art. 7, V) |
| Lista de extensões instaladas | Isolamento de extensões durante captura (integridade forense) | Consentimento (Art. 7, I) |

---

## 4. Como os Dados são Processados

Os dados capturados pela Extensão passam pelo seguinte fluxo de processamento para garantir integridade e validade jurídica:

1. **Hashing SHA-256**: Cada evidência capturada recebe um hash criptográfico SHA-256 que garante a integridade do conteúdo. Qualquer alteração no arquivo invalida o hash.

2. **Organização em Merkle Tree**: Os hashes individuais são organizados em uma estrutura de Merkle Tree, permitindo verificação eficiente da integridade de conjuntos de evidências.

3. **Certificação em Blockchain**: O hash raiz da Merkle Tree é registrado em redes blockchain públicas (Polygon, Arbitrum ou Optimism), criando um registro imutável e verificável da existência da prova em determinado momento.

4. **Armazenamento**:
   - **Banco de dados**: Supabase (PostgreSQL) hospedado em infraestrutura gerenciada, acessado via domínio customizado auth.lexato.com.br
   - **Arquivos**: AWS S3 na região sa-east-1 (São Paulo, Brasil), garantindo que os dados permaneçam em território nacional

---

## 5. Compartilhamento com Terceiros

A Extensão compartilha dados com os seguintes terceiros, exclusivamente para as finalidades descritas:

| Terceiro | Finalidade | Dados Compartilhados | Localização |
|----------|-----------|---------------------|-------------|
| **Supabase** | Autenticação e banco de dados | Tokens OAuth2, metadados de evidências | Via domínio customizado *.lexato.com.br |
| **AWS S3** | Armazenamento de arquivos de evidências | Screenshots, vídeos, certificados | sa-east-1 (São Paulo, Brasil) |
| **Sentry** | Monitoramento de erros e estabilidade | Dados técnicos de erros (sem dados pessoais de capturas) | EUA |
| **ipinfo.io** | Identificação do endereço IP público do usuário | Endereço IP (para metadados forenses da captura) | EUA |
| **Redes Blockchain** (Polygon, Arbitrum, Optimism) | Certificação imutável de evidências | Apenas hashes criptográficos (sem dados pessoais identificáveis) | Descentralizado |

**Importante**: Os hashes registrados em blockchain são públicos e imutáveis, porém não contêm dados pessoais identificáveis - são apenas resumos criptográficos que permitem verificar a integridade das evidências.

---

## 6. Permissões da Extensão

### 6.1 Permissões obrigatórias

| Permissão | Justificativa Técnica | Quando é Utilizada |
|-----------|----------------------|-------------------|
| `host_permissions` (https://*/* e http://*/*) | Acesso a qualquer página web para captura de screenshots e injeção de scripts de lockdown | Apenas quando o usuário inicia explicitamente uma captura |
| `storage` | Armazenamento local de tokens de autenticação e configurações do usuário | Continuamente, para manter a sessão |
| `tabs` | Obtenção de URL e título da aba para metadados forenses | Durante o processo de captura |
| `scripting` | Injeção dinâmica de scripts para lockdown de DevTools durante captura (preservação de integridade forense) | Durante o processo de captura |
| `alarms` | Agendamento de refresh automático de tokens de autenticação e polling de status | Continuamente, em segundo plano |
| `webNavigation` | Monitoramento de navegações durante captura de vídeo para log forense | Apenas durante gravação de vídeo |
| `offscreen` | Criação de documento offscreen para acesso a APIs que requerem DOM (ex: geolocalização) no Manifest V3 | Quando APIs DOM são necessárias |
| `sidePanel` | Exibição de controles de gravação de vídeo fora da área capturada, permitindo navegação sem interferir no vídeo | Durante gravação de vídeo |
| `identity` | Autenticação OAuth2 do usuário com o provedor de identidade | Durante login e refresh de sessão |

### 6.2 Permissões opcionais (solicitadas sob demanda)

| Permissão | Justificativa Técnica | Quando é Solicitada |
|-----------|----------------------|-------------------|
| `management` | Gerenciamento de extensões para isolamento durante captura (desabilita temporariamente outras extensões para garantir integridade forense) | Quando o usuário ativa o modo de isolamento |
| `geolocation` | Coleta de coordenadas geográficas como metadado forense complementar | Quando o usuário opta por incluir geolocalização na captura |
| `notifications` | Notificações de status de captura e certificação blockchain | Quando o usuário ativa notificações |
| `tabCapture` | Captura de stream de vídeo da aba ativa para gravação | Quando o usuário inicia uma gravação de vídeo |

---

## 7. Conformidade Legal

### 7.1 ISO/IEC 27037

A Extensão foi desenvolvida em conformidade com a norma ISO/IEC 27037, que estabelece diretrizes para identificação, coleta, aquisição e preservação de evidências digitais. Os processos de captura, hashing, certificação e armazenamento seguem as melhores práticas internacionais para garantir a admissibilidade das provas em processos judiciais.

### 7.2 LGPD (Lei 13.709/2018)

O tratamento de dados pessoais pela Extensão está amparado nas seguintes bases legais da LGPD:

- **Execução de contrato** (Art. 7, V): Para os dados necessários à prestação do serviço de captura e certificação de provas digitais
- **Consentimento** (Art. 7, I): Para dados opcionais como geolocalização e lista de extensões instaladas
- **Legítimo interesse** (Art. 7, IX): Para coleta de endereço IP como metadado forense

### 7.3 Direitos do Titular de Dados

Conforme o Art. 18 da LGPD, o titular dos dados pessoais tem direito a:

- Confirmação da existência de tratamento
- Acesso aos dados pessoais
- Correção de dados incompletos, inexatos ou desatualizados
- Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos
- Portabilidade dos dados
- Eliminação dos dados pessoais tratados com consentimento
- Informação sobre compartilhamento de dados com terceiros
- Informação sobre a possibilidade de não fornecer consentimento e suas consequências
- Revogação do consentimento

Para exercer qualquer desses direitos, entre em contato pelo e-mail: **privacidade@lexato.com.br**

O prazo de resposta é de até **15 dias úteis**, conforme estabelecido pela LGPD.

---

## 8. Retenção e Exclusão de Dados

### 8.1 Período de retenção

- **Evidências digitais** (screenshots, vídeos, metadados): Armazenadas pelo período contratado pelo usuário, conforme o plano de serviço
- **Tokens de autenticação**: Armazenados localmente no navegador enquanto a sessão estiver ativa
- **Configurações do usuário**: Armazenadas localmente até a desinstalação da Extensão ou limpeza manual

### 8.2 Exclusão de dados

O usuário pode solicitar a exclusão dos seus dados pessoais a qualquer momento pelo e-mail privacidade@lexato.com.br.

**Exceção**: Hashes registrados em blockchain são imutáveis por natureza e não podem ser excluídos. No entanto, esses hashes não contêm dados pessoais identificáveis.

### 8.3 Desinstalação

Ao desinstalar a Extensão, todos os dados armazenados localmente (tokens, configurações) são automaticamente removidos pelo navegador. Os dados armazenados nos servidores da Lexato permanecem disponíveis conforme o período de retenção contratado.

---

## 9. Consentimento

A Extensão obtém consentimento explícito do usuário antes de cada captura de prova digital. O usuário deve iniciar ativamente o processo de captura (screenshot ou vídeo) para que qualquer coleta de dados ocorra.

Permissões opcionais (geolocalização, gerenciamento de extensões, notificações, captura de vídeo) são solicitadas individualmente no momento em que a funcionalidade correspondente é necessária, e o usuário pode recusar sem prejuízo das demais funcionalidades.

---

## 10. Segurança

A Extensão adota as seguintes medidas de segurança:

- **Dados armazenados no Brasil**: Arquivos de evidências em AWS S3 região sa-east-1 (São Paulo)
- **Criptografia em trânsito**: Todas as comunicações utilizam HTTPS/TLS e WSS (WebSocket Secure)
- **Hashing criptográfico**: SHA-256 para garantia de integridade das evidências
- **Certificação em blockchain**: Registro imutável e verificável em redes públicas
- **Domínio customizado**: Autenticação via auth.lexato.com.br (sem exposição de domínios de terceiros)
- **Content Security Policy restritiva**: A Extensão implementa CSP rigorosa limitando origens de scripts e conexões

---

## 11. Alterações nesta Política

Esta Política de Privacidade pode ser atualizada periodicamente para refletir mudanças nos nossos serviços ou na legislação aplicável.

Em caso de alterações significativas, os usuários serão notificados com antecedência mínima de **30 dias** antes da entrada em vigor das mudanças.

A versão mais recente estará sempre disponível em: https://lexato.com.br/politica-de-privacidade

---

## 12. Contato

Para dúvidas, solicitações ou reclamações relacionadas a esta Política de Privacidade ou ao tratamento de dados pessoais:

**Encarregado de Proteção de Dados (DPO):**
E-mail: privacidade@lexato.com.br
Site: https://lexato.com.br
