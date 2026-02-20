/**
 * Mensagens de erro em português brasileiro
 *
 * Centraliza todas as mensagens de erro da extensão Chrome Lexato.
 * Organizado por categoria para facilitar manutenção e consistência.
 */

/** Mensagens de erro de validação de formulários */
export const validationErrors = {
  /** Campos obrigatórios */
  required: 'Campo obrigatório',
  requiredField: (field: string) => `${field} é obrigatório`,

  /** Validação de e-mail */
  invalidEmail: 'E-mail inválido',
  emailAlreadyExists: 'Este e-mail já está cadastrado',

  /** Validação de CPF/CNPJ */
  invalidCPF: 'CPF inválido',
  invalidCNPJ: 'CNPJ inválido',
  invalidDocument: 'Documento inválido',

  /** Validação de tamanho */
  minLength: (min: number) => `Mínimo de ${min} caracteres`,
  maxLength: (max: number) => `Máximo de ${max} caracteres`,
  exactLength: (length: number) => `Deve ter exatamente ${length} caracteres`,

  /** Validação de valores */
  minValue: (min: number) => `Valor mínimo: ${min}`,
  maxValue: (max: number) => `Valor máximo: ${max}`,
  invalidNumber: 'Número inválido',
  positiveNumber: 'Deve ser um número positivo',

  /** Validação de formato */
  invalidFormat: 'Formato inválido',
  invalidUrl: 'URL inválida',
  invalidDate: 'Data inválida',
  invalidPhone: 'Telefone inválido',

  /** Validação de senha */
  passwordTooWeak: 'Senha muito fraca',
  passwordMismatch: 'As senhas não coincidem',
  passwordRequirements:
    'A senha deve conter letras maiúsculas, minúsculas, números e caracteres especiais',
} as const;

/** Mensagens de erro de captura */
export const captureErrors = {
  /** Falhas gerais */
  failed: 'Falha ao capturar a página',
  failedWithReason: (reason: string) => `Falha ao capturar: ${reason}`,
  timeout: 'Tempo limite excedido para captura',
  cancelled: 'Captura cancelada pelo usuário',

  /** Permissões */
  noPermission: 'Permissão negada para captura',
  permissionDenied: 'Você negou a permissão de captura',
  permissionRequired: 'Permissão necessária para realizar a captura',
  screenShareDenied: 'Compartilhamento de tela negado',
  microphoneDenied: 'Acesso ao microfone negado',

  /** URL e página */
  invalidUrl: 'URL inválida para captura',
  blockedUrl: 'Esta URL não pode ser capturada',
  restrictedPage: 'Esta página possui restrições de captura',
  pageNotLoaded: 'A página não foi carregada completamente',
  pageNotAccessible: 'Não foi possível acessar a página',

  /** Vídeo */
  videoTooLong: 'A gravação excedeu o tempo máximo permitido',
  videoTooShort: 'A gravação é muito curta',
  videoCorrupted: 'O arquivo de vídeo está corrompido',
  recordingFailed: 'Falha na gravação de vídeo',
  recordingNotSupported: 'Gravação de vídeo não suportada neste navegador',

  /** Screenshot */
  screenshotFailed: 'Falha ao capturar screenshot',
  fullPageFailed: 'Falha ao capturar página completa',
  areaSelectionFailed: 'Falha ao selecionar área de captura',

  /** Processamento */
  processingFailed: 'Falha ao processar a captura',
  hashGenerationFailed: 'Falha ao gerar hash da captura',
  metadataExtractionFailed: 'Falha ao extrair metadados',
} as const;

/** Mensagens de erro de rede */
export const networkErrors = {
  /** Conexão */
  offline: 'Sem conexão com a internet',
  connectionLost: 'Conexão perdida',
  connectionFailed: 'Falha na conexão',
  connectionTimeout: 'Tempo limite de conexão excedido',

  /** Servidor */
  serverError: 'Erro no servidor. Tente novamente.',
  serverUnavailable: 'Servidor indisponível no momento',
  serverOverloaded: 'Servidor sobrecarregado. Tente novamente em alguns minutos.',
  maintenanceMode: 'Sistema em manutenção. Tente novamente mais tarde.',

  /** Requisições */
  requestFailed: 'Falha na requisição',
  requestTimeout: 'Tempo limite da requisição excedido',
  tooManyRequests: 'Muitas requisições. Aguarde um momento.',
  rateLimited: 'Limite de requisições atingido',

  /** Upload/Download */
  uploadFailed: 'Falha no upload do arquivo',
  downloadFailed: 'Falha no download do arquivo',
  fileTooLarge: 'Arquivo muito grande para upload',
  uploadTimeout: 'Tempo limite de upload excedido',

  /** API */
  apiError: 'Erro na comunicação com a API',
  apiUnavailable: 'API indisponível no momento',
  invalidResponse: 'Resposta inválida do servidor',
} as const;

/** Mensagens de erro de autenticação */
export const authErrors = {
  /** Sessão */
  sessionExpired: 'Sessão expirada. Faça login novamente.',
  sessionInvalid: 'Sessão inválida',
  notAuthenticated: 'Você precisa estar logado para realizar esta ação',

  /** Credenciais */
  invalidCredentials: 'E-mail ou senha incorretos',
  invalidPassword: 'Senha incorreta',
  invalidToken: 'Token de autenticação inválido',
  tokenExpired: 'Token expirado',

  /** MFA */
  mfaRequired: 'Autenticação em duas etapas necessária',
  mfaInvalid: 'Código de verificação inválido',
  mfaExpired: 'Código de verificação expirado',

  /** Conta */
  accountLocked: 'Conta bloqueada. Entre em contato com o suporte.',
  accountDisabled: 'Conta desativada',
  accountNotFound: 'Conta não encontrada',
  accountNotVerified: 'Conta não verificada. Verifique seu e-mail.',

  /** Permissões */
  unauthorized: 'Você não tem permissão para realizar esta ação',
  forbidden: 'Acesso negado',
  insufficientPermissions: 'Permissões insuficientes',

  /** Login */
  loginFailed: 'Falha no login',
  logoutFailed: 'Falha ao sair da conta',
  tooManyAttempts: 'Muitas tentativas. Tente novamente em alguns minutos.',
} as const;

/** Mensagens de erro de créditos */
export const creditsErrors = {
  /** Saldo */
  insufficient: 'Créditos insuficientes',
  insufficientForAction: (action: string) => `Créditos insuficientes para ${action}`,
  expired: 'Seus créditos expiraram',
  noCredits: 'Você não possui créditos disponíveis',

  /** Compra */
  purchaseFailed: 'Falha na compra de créditos',
  paymentFailed: 'Falha no pagamento',
  paymentCancelled: 'Pagamento cancelado',
  paymentExpired: 'Pagamento expirado',

  /** Uso */
  creditDeductionFailed: 'Falha ao deduzir créditos',
  creditRefundFailed: 'Falha ao estornar créditos',

  /** Limites */
  dailyLimitReached: 'Limite diário de créditos atingido',
  monthlyLimitReached: 'Limite mensal de créditos atingido',
} as const;

/** Mensagens de erro de blockchain */
export const blockchainErrors = {
  /** Registro */
  registrationFailed: 'Falha no registro blockchain',
  transactionFailed: 'Transação blockchain falhou',
  transactionTimeout: 'Tempo limite da transação excedido',
  transactionRejected: 'Transação rejeitada pela rede',

  /** Verificação */
  verificationFailed: 'Falha na verificação blockchain',
  hashMismatch: 'Hash não corresponde ao registro',
  notFound: 'Registro não encontrado na blockchain',

  /** Rede */
  networkUnavailable: 'Rede blockchain indisponível',
  networkCongested: 'Rede blockchain congestionada',
  insufficientGas: 'Gas insuficiente para transação',

  /** Confirmação */
  confirmationFailed: 'Falha na confirmação da transação',
  confirmationTimeout: 'Tempo limite de confirmação excedido',
} as const;

/** Mensagens de erro de armazenamento */
export const storageErrors = {
  /** Local */
  localStorageFull: 'Armazenamento local cheio',
  localStorageUnavailable: 'Armazenamento local indisponível',
  quotaExceeded: 'Cota de armazenamento excedida',

  /** Arquivos */
  fileNotFound: 'Arquivo não encontrado',
  fileCorrupted: 'Arquivo corrompido',
  fileAccessDenied: 'Acesso ao arquivo negado',
  invalidFileType: 'Tipo de arquivo inválido',
  fileTooLarge: 'Arquivo muito grande',

  /** Cache */
  cacheClearFailed: 'Falha ao limpar cache',
  cacheReadFailed: 'Falha ao ler cache',
  cacheWriteFailed: 'Falha ao gravar cache',

  /** Sincronização */
  syncFailed: 'Falha na sincronização',
  syncConflict: 'Conflito de sincronização detectado',
} as const;

/** Mensagens de erro de evidência */
export const evidenceErrors = {
  /** Geral */
  notFound: 'Evidência não encontrada',
  accessDenied: 'Acesso à evidência negado',
  expired: 'Esta evidência expirou',
  discarded: 'Esta evidência foi descartada',

  /** Operações */
  deleteFailed: 'Falha ao excluir evidência',
  downloadFailed: 'Falha ao baixar evidência',
  shareFailed: 'Falha ao compartilhar evidência',
  exportFailed: 'Falha ao exportar evidência',

  /** Validação */
  invalidEvidence: 'Evidência inválida',
  integrityCheckFailed: 'Falha na verificação de integridade',
  tamperingDetected: 'Possível adulteração detectada',

  /** Preview */
  previewExpired: 'O preview desta captura expirou',
  previewNotAvailable: 'Preview não disponível',
  confirmationRequired: 'Confirmação necessária antes de prosseguir',
} as const;

/** Mensagens de erro genéricas */
export const genericErrors = {
  /** Erros gerais */
  unknown: 'Ocorreu um erro inesperado',
  tryAgain: 'Ocorreu um erro. Tente novamente.',
  contactSupport: 'Ocorreu um erro. Entre em contato com o suporte.',

  /** Operações */
  operationFailed: 'Operação falhou',
  operationCancelled: 'Operação cancelada',
  operationTimeout: 'Tempo limite da operação excedido',

  /** Recursos */
  resourceNotFound: 'Recurso não encontrado',
  resourceUnavailable: 'Recurso indisponível',
  resourceLocked: 'Recurso bloqueado',

  /** Sistema */
  systemError: 'Erro do sistema',
  configurationError: 'Erro de configuração',
  initializationFailed: 'Falha na inicialização',
} as const;

/** Exportação consolidada de todas as mensagens de erro */
export const errorMessages = {
  validation: validationErrors,
  capture: captureErrors,
  network: networkErrors,
  auth: authErrors,
  credits: creditsErrors,
  blockchain: blockchainErrors,
  storage: storageErrors,
  evidence: evidenceErrors,
  generic: genericErrors,
} as const;

export type ErrorMessages = typeof errorMessages;
