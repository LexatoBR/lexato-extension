/**
 * Tipos do sistema de internacionalização (i18n)
 * Extensão Lexato - 3 idiomas: pt-BR, en, es
 *
 * @module i18n/types
 */

/** Idiomas suportados */
export type Locale = 'pt-BR' | 'en' | 'es';

/** Labels dos idiomas para exibição */
export const LOCALE_LABELS: Record<Locale, string> = {
  'pt-BR': 'Português (BR)',
  en: 'English',
  es: 'Español',
};

/** Labels curtos para seletor compacto */
export const LOCALE_SHORT: Record<Locale, string> = {
  'pt-BR': 'PT',
  en: 'EN',
  es: 'ES',
};

/** Idioma padrão */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Chave de persistência no localStorage */
export const LOCALE_STORAGE_KEY = 'lexato_locale';

/**
 * Estrutura de traduções
 * Todas as strings da extensão organizadas por contexto
 */
export interface Translations {
  /** Header */
  header: {
    openMenu: string;
    menuTooltip: string;
    credit: string;
    credits: string;
    creditBalance: string;
    available: string;
    usedThisMonth: string;
    currentPlan: string;
    buyMore: string;
  };

  /** Menu lateral */
  menu: {
    navigation: string;
    newCapture: string;
    captureDescription: string;
    history: string;
    historyDescription: string;
    diagnostic: string;
    diagnosticDescription: string;
    settings: string;
    settingsLabel: string;
    settingsDescription: string;
    helpAndSupport: string;
    helpDescription: string;
    logout: string;
    language: string;
  };

  /** Login */
  login: {
    tagline: string;
    accessAccount: string;
    enterCredentials: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    forgotPassword: string;
    showPassword: string;
    hidePassword: string;
    enter: string;
    entering: string;
    noAccount: string;
    createAccount: string;
    terms: string;
    privacy: string;
    loadingVerification: string;
    errorEmailRequired: string;
    errorEmailInvalid: string;
    errorPasswordRequired: string;
    errorPasswordMinLength: string;
    errorSecurityCheck: string;
    errorMfaDisabled: string;
    errorLoginFailed: string;
    errorServerConnection: string;
    orContinueWith: string;
    googleLogin: string;
    googleLoggingIn: string;
    googleLoginError: string;
  };

  /** Captura */
  capture: {
    title: string;
    subtitle: string;
    screenshot: string;
    screenshotDescription: string;
    video: string;
    videoDescription: string;
    fullPageCapture: string;
    autoScroll: string;
    maxDuration: string;
    secureFormat: string;
  };

  /** Diagnóstico */
  diagnostic: {
    title: string;
    subtitle: string;
    integrityCheck: string;
    integrityDescription: string;
    homologated: string;
    pending: string;
    extension: string;
    chrome: string;
    platform: string;
    lastCheck: string;
    duration: string;
    status: string;
    verified: string;
    waiting: string;
    healthyEnvironment: string;
    warningsDetected: string;
    criticalProblems: string;
    checking: string;
    awaitingDiagnostic: string;
    allChecksPassed: string;
    warningsNeedAttention: string;
    criticalProblemsFound: string;
    runningChecks: string;
    runDiagnosticDescription: string;
    success: string;
    warnings: string;
    errors: string;
    checkAndRepair: string;
    runDiagnosticAndRepair: string;
    verifying: string;
    runAgain: string;
    checkResult: string;
    repaired: string;
    moreInfo: string;
    hideDetails: string;
    viewDetails: string;
    fixing: string;
    tryFix: string;
    reportCopied: string;
    copyError: string;
    downloadStarted: string;
    copyReport: string;
    downloadReport: string;
    platformUnknown: string;
  };

  /** Erros de captura */
  captureError: {
    title: string;
    phase: string;
    cancel: string;
    close: string;
    tryAgain: string;
    trying: string;
    technicalDetails: string;
    code: string;
    attempts: string;
    nonRecoverable: string;
    retriesLeft: string;
    retryOnce: string;
    retryMultiple: string;
    phaseCapture: string;
    phaseTimestamp: string;
    phaseUpload: string;
    phasePreview: string;
    phaseBlockchain: string;
    phaseCertificate: string;
  };

  /** Página de opções (configurações) */
  options: {
    /** Header */
    subtitle: string;
    notAuthenticated: string;
    notAuthenticatedDescription: string;
    /** Perfil */
    profile: string;
    user: string;
    accountTypeIndividual: string;
    accountTypeEnterprise: string;
    creditsLabel: string;
    /** Segurança */
    security: string;
    twoFactorAuth: string;
    twoFactorEnabled: string;
    twoFactorDisabled: string;
    manage: string;
    activate: string;
    resetPassword: string;
    resetPasswordDescription: string;
    change: string;
    userId: string;
    signOut: string;
    confirmSignOut: string;
    confirmButton: string;
    cancelButton: string;
    signingOut: string;
    /** Configurações */
    generalSettings: string;
    captureSection: string;
    environmentIsolation: string;
    environmentIsolationDescription: string;
    storageLabel: string;
    storageDuration: string;
    captureQualityLabel: string;
    captureQualityValue: string;
    notifications: string;
    enableNotifications: string;
    enableNotificationsDescription: string;
    settingsSaved: string;
    settingsError: string;
    /** Geolocalização */
    geolocation: string;
    geolocationDescription: string;
    geoAlways: string;
    geoAlwaysDescription: string;
    geoAsk: string;
    geoAskDescription: string;
    geoIpOnly: string;
    geoIpOnlyDescription: string;
    geoTip: string;
    /** Idioma */
    languageSection: string;
    /** Sobre */
    about: string;
    digitalEvidence: string;
    aboutDescription: string;
    usefulLinks: string;
    documentation: string;
    documentationDescription: string;
    support: string;
    supportDescription: string;
    privacyPolicy: string;
    privacyPolicyDescription: string;
    termsOfUse: string;
    termsOfUseDescription: string;
    sourceCode: string;
    sourceCodeDescription: string;
    technicalInfo: string;
  };

  /** Geral */
  common: {
    loading: string;
    version: string;
    latestVersion: string;
  };
}
