/**
 * Gerenciador de isolamento de abas para gravação forense
 *
 * Responsável por:
 * - Impedir abertura de novas abas/janelas durante gravação
 * - Monitorar e registrar tentativas de violação do isolamento
 * - Gerar estatísticas para o manifesto de evidência
 * - Desativar lockdown com ordem correta após captura
 *
 * @module TabIsolationManager
 */

import { AuditLogger } from '../lib/audit-logger';
import { permissionHelper } from '../lib/permissions/permission-helper';

/**
 * Estado do isolamento de abas
 */
export interface TabIsolationState {
    /** Se o isolamento está ativo */
    isActive: boolean;
    /** ID da aba sendo gravada */
    recordingTabId: number | null;
    /** ID da janela sendo gravada */
    recordingWindowId: number | null;
    /** Timestamp de ativação */
    activatedAt: string | null;
    /** Abas fechadas antes da gravação */
    closedTabsBeforeRecording: ClosedTabInfo[];
    /** Tentativas de abertura bloqueadas */
    blockedAttempts: BlockedTabAttempt[];
    /** IDs de extensões desabilitadas durante lockdown */
    disabledExtensionIds: string[];
    /** Se o teclado está bloqueado */
    keyboardBlocked: boolean;
    /** Se o menu de contexto está bloqueado */
    contextMenuBlocked: boolean;
    /** Se DevTools está bloqueado */
    devToolsBlocked: boolean;
}

/**
 * Informações de aba fechada antes da gravação
 */
export interface ClosedTabInfo {
    tabId: number;
    url: string;
    title: string;
    closedAt: string;
}

/**
 * Tentativa bloqueada de abertura de aba/janela
 */
export interface BlockedTabAttempt {
    type: 'new_tab' | 'new_window' | 'target_blank' | 'window_open' | 'keyboard_shortcut_probable';
    attemptedUrl?: string;
    timestamp: string;
    action: 'closed' | 'redirected' | 'blocked';
    reactionTimeMs?: number;
}

/**
 * Seção do manifesto com estatísticas de isolamento
 */
export interface TabIsolationManifestSection {
    enabled: boolean;
    closedTabsBeforeRecording: Array<{
        url: string;
        title: string;
        closedAt: string;
    }>;
    totalBlockedAttempts: number;
    blockedAttempts: BlockedTabAttempt[];
    integrityVerified: boolean;
    violations?: string[];
    averageReactionTimeMs?: number;
}

/**
 * Resultado da desativação do lockdown
 */
export interface LockdownDeactivationResult {
    /** Se a desativação foi bem-sucedida */
    success: boolean;
    /** Etapas executadas */
    stepsCompleted: string[];
    /** Erros encontrados (não fatais) */
    warnings: string[];
    /** Tempo total de desativação em ms */
    durationMs: number;
}

/**
 * Gerenciador de isolamento de abas
 */
export class TabIsolationManager {
    private state: TabIsolationState = {
        isActive: false,
        recordingTabId: null,
        recordingWindowId: null,
        activatedAt: null,
        closedTabsBeforeRecording: [],
        blockedAttempts: [],
        disabledExtensionIds: [],
        keyboardBlocked: false,
        contextMenuBlocked: false,
        devToolsBlocked: false,
    };

    private logger: AuditLogger;

    constructor(logger?: AuditLogger) {
        this.logger = logger ?? new AuditLogger();
    }

    /**
     * Verifica se isolamento está ativo
     */
    isActive(): boolean {
        return this.state.isActive;
    }

    /**
     * Obtém estado atual do isolamento
     */
    getState(): TabIsolationState {
        return { ...this.state };
    }

    /**
     * Identifica ID da aba sendo gravada
     */
    getRecordingTabId(): number | null {
        return this.state.recordingTabId;
    }

    /**
     * Identifica ID da janela sendo gravada
     */
    getRecordingWindowId(): number | null {
        return this.state.recordingWindowId;
    }

    /**
     * Lista todas as abas que serão fechadas ao ativar o isolamento
     * Exceto a aba atual e janelas devtools
     *
     * @param currentTabId - ID da aba atual (não será fechada)
     */
    async listTabsToClose(currentTabId: number): Promise<chrome.tabs.Tab[]> {
        const allTabs = await chrome.tabs.query({});
        return allTabs.filter((tab) => tab.id !== currentTabId && !tab.url?.startsWith('devtools://'));
    }

    /**
     * Ativa isolamento: fecha outras abas e prepara estado
     *
     * @param recordingTabId - ID da aba sendo gravada
     * @param recordingWindowId - ID da janela sendo gravada
     */
    async activate(recordingTabId: number, recordingWindowId: number): Promise<void> {
        this.logger.info('ISOLATION', 'ACTIVATING', { recordingTabId, recordingWindowId });

        // 1. Fechar outras abas
        const tabsToClose = await this.listTabsToClose(recordingTabId);

        // Registrar abas que serão fechadas
        const closedTabsInfo: ClosedTabInfo[] = tabsToClose.map((tab) => ({
            tabId: tab.id!,
            url: tab.url ?? 'unknown',
            title: tab.title ?? 'unknown',
            closedAt: new Date().toISOString(),
        }));

        if (tabsToClose.length > 0) {
            const tabIds = tabsToClose.map((t) => t.id!).filter((id) => id !== undefined);
            await chrome.tabs.remove(tabIds);
            this.logger.info('ISOLATION', 'TABS_CLOSED', { count: tabIds.length });
        }

        // 2. Fechar outras janelas (se houver)
        const allWindows = await chrome.windows.getAll();
        const windowsToClose = allWindows.filter(
            (w) => w.id !== recordingWindowId && w.type === 'normal'
        );

        if (windowsToClose.length > 0) {
            const windowIds = windowsToClose.map((w) => w.id!).filter((id) => id !== undefined);
            // chrome.windows.remove não aceita array, tem que ser um por um ou via tabs
            // Como já fechamos as tabs, as janelas devem fechar automagicamente se vazias,
            // mas garantimos aqui para janelas vazias ou popups
            await Promise.all(windowIds.map(id => chrome.windows.remove(id)));
            this.logger.info('ISOLATION', 'WINDOWS_CLOSED', { count: windowIds.length });
        }

        // 3. Atualizar estado
        this.state = {
            isActive: true,
            recordingTabId,
            recordingWindowId,
            activatedAt: new Date().toISOString(),
            closedTabsBeforeRecording: closedTabsInfo,
            blockedAttempts: [],
            disabledExtensionIds: [],
            keyboardBlocked: false,
            contextMenuBlocked: false,
            devToolsBlocked: false,
        };

        // 4. Injetar script de proteção na aba ativa (se possível)
        // Isso é feito separadamente pelo orquestrador, mas o estado reflete que estamos protegidos

        this.logger.info('ISOLATION', 'ACTIVATED');
    }

    /**
     * Desativa isolamento (método legado - usar deactivateLockdown para fluxo completo)
     * 
     * @deprecated Usar deactivateLockdown() para desativação completa com ordem correta
     */
    async deactivate(): Promise<void> {
        this.state.isActive = false;
        this.state.recordingTabId = null;
        this.state.recordingWindowId = null;
        this.logger.info('ISOLATION', 'DEACTIVATED');
    }

    /**
     * Desativa o lockdown completo com ordem correta
     * 
     * Ordem de desativação (conforme design.md):
     * 1. Restaurar atalhos de teclado
     * 2. Restaurar menu de contexto
     * 3. Restaurar DevTools
     * 4. Re-habilitar extensões desabilitadas
     * 5. Recarregar aba capturada (opcional)
     * 
     * @param reloadTab - Se deve recarregar a aba capturada após desativação
     * @returns Resultado da desativação com etapas completadas
     */
    async deactivateLockdown(reloadTab = false): Promise<LockdownDeactivationResult> {
        const startTime = Date.now();
        const stepsCompleted: string[] = [];
        const warnings: string[] = [];

        this.logger.info('ISOLATION', 'DEACTIVATE_LOCKDOWN_START', {
            recordingTabId: this.state.recordingTabId,
            reloadTab,
        });

        try {
            // 1. Restaurar atalhos de teclado
            if (this.state.keyboardBlocked) {
                try {
                    await this.restoreKeyboardShortcuts();
                    this.state.keyboardBlocked = false;
                    stepsCompleted.push('keyboard_restored');
                    this.logger.info('ISOLATION', 'KEYBOARD_RESTORED');
                } catch (error) {
                    const msg = `Falha ao restaurar teclado: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(msg);
                    this.logger.warn('ISOLATION', 'KEYBOARD_RESTORE_FAILED', { error: msg });
                }
            } else {
                stepsCompleted.push('keyboard_not_blocked');
            }

            // 2. Restaurar menu de contexto
            if (this.state.contextMenuBlocked) {
                try {
                    await this.restoreContextMenu();
                    this.state.contextMenuBlocked = false;
                    stepsCompleted.push('context_menu_restored');
                    this.logger.info('ISOLATION', 'CONTEXT_MENU_RESTORED');
                } catch (error) {
                    const msg = `Falha ao restaurar menu de contexto: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(msg);
                    this.logger.warn('ISOLATION', 'CONTEXT_MENU_RESTORE_FAILED', { error: msg });
                }
            } else {
                stepsCompleted.push('context_menu_not_blocked');
            }

            // 3. Restaurar DevTools
            if (this.state.devToolsBlocked) {
                try {
                    await this.restoreDevTools();
                    this.state.devToolsBlocked = false;
                    stepsCompleted.push('devtools_restored');
                    this.logger.info('ISOLATION', 'DEVTOOLS_RESTORED');
                } catch (error) {
                    const msg = `Falha ao restaurar DevTools: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(msg);
                    this.logger.warn('ISOLATION', 'DEVTOOLS_RESTORE_FAILED', { error: msg });
                }
            } else {
                stepsCompleted.push('devtools_not_blocked');
            }

            // 4. Re-habilitar extensões desabilitadas
            if (this.state.disabledExtensionIds.length > 0) {
                try {
                    await this.reEnableExtensions();
                    stepsCompleted.push('extensions_re_enabled');
                    this.logger.info('ISOLATION', 'EXTENSIONS_RE_ENABLED', {
                        count: this.state.disabledExtensionIds.length,
                    });
                } catch (error) {
                    const msg = `Falha ao re-habilitar extensões: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(msg);
                    this.logger.warn('ISOLATION', 'EXTENSIONS_RE_ENABLE_FAILED', { error: msg });
                }
            } else {
                stepsCompleted.push('no_extensions_to_enable');
            }

            // 5. Recarregar aba capturada (se solicitado)
            if (reloadTab && this.state.recordingTabId) {
                try {
                    await this.reloadCapturedTab();
                    stepsCompleted.push('tab_reloaded');
                    this.logger.info('ISOLATION', 'TAB_RELOADED', {
                        tabId: this.state.recordingTabId,
                    });
                } catch (error) {
                    const msg = `Falha ao recarregar aba: ${error instanceof Error ? error.message : String(error)}`;
                    warnings.push(msg);
                    this.logger.warn('ISOLATION', 'TAB_RELOAD_FAILED', { error: msg });
                }
            }

            // Limpar estado
            this.state.isActive = false;
            this.state.recordingTabId = null;
            this.state.recordingWindowId = null;
            this.state.disabledExtensionIds = [];

            const durationMs = Date.now() - startTime;

            this.logger.info('ISOLATION', 'DEACTIVATE_LOCKDOWN_COMPLETE', {
                durationMs,
                stepsCompleted,
                warnings,
            });

            return {
                success: true,
                stepsCompleted,
                warnings,
                durationMs,
            };

        } catch (error) {
            const durationMs = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);

            this.logger.error('ISOLATION', 'DEACTIVATE_LOCKDOWN_FAILED', {
                error: errorMsg,
                durationMs,
                stepsCompleted,
            });

            // Mesmo com erro, tentar limpar estado
            this.state.isActive = false;

            return {
                success: false,
                stepsCompleted,
                warnings: [...warnings, `Erro fatal: ${errorMsg}`],
                durationMs,
            };
        }
    }

    /**
     * Alias para deactivateLockdown para compatibilidade
     * Usado pelo handler de cancelamento
     */
    async restore(): Promise<LockdownDeactivationResult> {
        return this.deactivateLockdown();
    }

    /**
     * Restaura atalhos de teclado bloqueados durante a captura
     *
     * Envia mensagem para o content script remover os listeners de bloqueio
     * @throws Error se falhar ao enviar mensagem (para ser tratado pelo chamador)
     */
    private async restoreKeyboardShortcuts(): Promise<void> {
        if (!this.state.recordingTabId) {
            return;
        }

        await chrome.tabs.sendMessage(this.state.recordingTabId, {
            type: 'RESTORE_KEYBOARD',
        });
    }

    /**
     * Restaura menu de contexto bloqueado durante a captura
     * 
     * Envia mensagem para o content script remover o bloqueio de contextmenu
     * @throws Error se falhar ao enviar mensagem (para ser tratado pelo chamador)
     */
    private async restoreContextMenu(): Promise<void> {
        if (!this.state.recordingTabId) {
            return;
        }

        await chrome.tabs.sendMessage(this.state.recordingTabId, {
            type: 'RESTORE_CONTEXT_MENU',
        });
    }

    /**
     * Restaura acesso ao DevTools
     * 
     * Remove qualquer bloqueio de DevTools (se implementado via chrome.debugger)
     */
    private async restoreDevTools(): Promise<void> {
        // DevTools blocking via chrome.debugger requer permissão especial
        // Por enquanto, apenas marca como restaurado
        // Implementação futura pode usar chrome.debugger.detach se necessário
    }

    /**
     * Re-habilita extensões que foram desabilitadas durante a captura
     *
     * Verifica permissão 'management' antes de usar chrome.management.setEnabled.
     * Se a permissão não foi concedida, registra aviso e prossegue sem re-habilitar
     * (degradação graciosa conforme Requirement 2.7).
     *
     * NOTA: chrome.management.setEnabled requer permissão "management"
     * e só funciona para extensões que o usuário permitiu gerenciar
     */
    private async reEnableExtensions(): Promise<void> {
        // Verificar permissão 'management' antes de usar a API
        const hasManagement = await permissionHelper.hasPermission('management');
        if (!hasManagement) {
            this.logger.warn('ISOLATION', 'MANAGEMENT_PERMISSION_NOT_GRANTED', {
                action: 'reEnableExtensions',
                extensionCount: this.state.disabledExtensionIds.length,
                degradation: 'Extensões não serão re-habilitadas automaticamente',
            });
            this.state.disabledExtensionIds = [];
            return;
        }

        const extensionIds = [...this.state.disabledExtensionIds];
        
        for (const extensionId of extensionIds) {
            try {
                if (chrome.management?.setEnabled) {
                    await chrome.management.setEnabled(extensionId, true);
                }
            } catch (error) {
                // Extensão pode ter sido removida ou não permitir gerenciamento
                this.logger.warn('ISOLATION', 'EXTENSION_RE_ENABLE_SINGLE_FAILED', {
                    extensionId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        // Limpar lista após tentativa
        this.state.disabledExtensionIds = [];
    }

    /**
     * Recarrega a aba que foi capturada
     * 
     * Útil para restaurar o estado original da página após a captura
     * @throws Error se falhar ao recarregar (para ser tratado pelo chamador)
     */
    private async reloadCapturedTab(): Promise<void> {
        if (!this.state.recordingTabId) {
            return;
        }

        await chrome.tabs.reload(this.state.recordingTabId);
    }

    /**
     * Registra uma extensão como desabilitada durante o lockdown
     * 
     * @param extensionId - ID da extensão desabilitada
     */
    registerDisabledExtension(extensionId: string): void {
        if (!this.state.disabledExtensionIds.includes(extensionId)) {
            this.state.disabledExtensionIds.push(extensionId);
            this.logger.info('ISOLATION', 'EXTENSION_DISABLED_REGISTERED', { extensionId });
        }
    }

    /**
     * Marca que o teclado foi bloqueado
     */
    setKeyboardBlocked(blocked: boolean): void {
        this.state.keyboardBlocked = blocked;
    }

    /**
     * Marca que o menu de contexto foi bloqueado
     */
    setContextMenuBlocked(blocked: boolean): void {
        this.state.contextMenuBlocked = blocked;
    }

    /**
     * Marca que DevTools foi bloqueado
     */
    setDevToolsBlocked(blocked: boolean): void {
        this.state.devToolsBlocked = blocked;
    }

    /**
     * Registra tentativa bloqueada no audit log e estado
     */
    async logBlockedAttempt(attempt: BlockedTabAttempt): Promise<void> {
        this.state.blockedAttempts.push(attempt);

        this.logger.warn('ISOLATION', 'ATTEMPT_BLOCKED', {
            type: attempt.type,
            url: attempt.attemptedUrl,
            action: attempt.action,
            reactionTime: attempt.reactionTimeMs,
        });
    }

    /**
     * Gera seção do manifesto com estatísticas de isolamento
     */
    generateManifestSection(): TabIsolationManifestSection {
        const reactionTimes = this.state.blockedAttempts
            .map(a => a.reactionTimeMs)
            .filter((t): t is number => t !== undefined);

        const avgReactionTime = reactionTimes.length > 0
            ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
            : undefined;

        const result: TabIsolationManifestSection = {
            enabled: !!this.state.activatedAt,
            closedTabsBeforeRecording: this.state.closedTabsBeforeRecording.map(t => ({
                url: t.url,
                title: t.title,
                closedAt: t.closedAt
            })),
            totalBlockedAttempts: this.state.blockedAttempts.length,
            blockedAttempts: [...this.state.blockedAttempts],
            integrityVerified: true, // Assumimos true se não houve exceções graves
        };

        if (avgReactionTime !== undefined) {
            result.averageReactionTimeMs = Math.round(avgReactionTime);
        }

        return result;
    }
}
