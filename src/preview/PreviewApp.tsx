import React, { useEffect, useState, useCallback } from 'react';
import { TimestampBadge } from '../components/ui/TimestampBadge';
import { Shield, FileCheck, XCircle, CheckCircle } from 'lucide-react';
import { TimestampResult } from '../lib/evidence-pipeline/types';
import { CatalogModal, type CatalogData } from './CatalogModal';

// Tipos adaptados para o Preview (dados que vêm do Service Worker)
interface PreviewData {
    evidenceId: string;
    title: string;
    url: string;
    type: 'screenshot' | 'video';
    mediaUrl?: string; // URL S3 ou Blob URL
    status: string;
    timestamp?: TimestampResult;
    hash?: string;
}

export const PreviewApp: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<PreviewData | null>(null);
    const [showCatalog, setShowCatalog] = useState(false);

    useEffect(() => {
        // Obter ID da URL
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        if (!id) {
            setError('ID da evidência não fornecido');
            setLoading(false);
            return;
        }

        // Buscar dados reais via message passing
        chrome.runtime.sendMessage({ type: 'GET_PREVIEW_DATA', payload: { id } }, (response) => {
             if (chrome.runtime.lastError) {
                setError('Erro ao comunicar com a extensão: ' + chrome.runtime.lastError.message);
                setLoading(false);
                return;
            }

            if (response?.success && response.data) {
                setData(response.data);
            } else {
                setError(response?.error ?? 'Falha ao carregar dados da evidência');
            }
            setLoading(false);
        });
    }, []);

    // Abre o modal de catalogacao ao clicar em aprovar
    const handleApprove = useCallback(() => {
        if (!data) return;
        setShowCatalog(true);
    }, [data]);

    // Envia aprovacao com dados de catalogacao
    const handleCatalogConfirm = useCallback((catalogData: CatalogData) => {
        if (!data) return;
        setShowCatalog(false);
        chrome.runtime.sendMessage({ 
            type: 'APPROVE_EVIDENCE', 
            payload: { 
                evidenceId: data.evidenceId,
                catalog: {
                    title: catalogData.title,
                    tags: catalogData.tags,
                    caseNumber: catalogData.caseNumber,
                    notes: catalogData.notes,
                    collectionId: catalogData.collectionId,
                    newCollection: catalogData.newCollection,
                },
            } 
        }, (response) => {
             if (response?.success) {
                 window.close();
             } else {
                 console.error('[PreviewApp] Erro ao aprovar:', response?.error ?? 'Desconhecido');
                 setError('Erro ao aprovar: ' + (response?.error ?? 'Desconhecido'));
             }
        });
    }, [data]);

    // Aprovacao rapida sem catalogacao
    const handleCatalogSkip = useCallback(() => {
        if (!data) return;
        setShowCatalog(false);
        chrome.runtime.sendMessage({ 
            type: 'APPROVE_EVIDENCE', 
            payload: { evidenceId: data.evidenceId } 
        }, (response) => {
             if (response?.success) {
                 window.close();
             } else {
                 console.error('[PreviewApp] Erro ao aprovar:', response?.error ?? 'Desconhecido');
                 setError('Erro ao aprovar: ' + (response?.error ?? 'Desconhecido'));
             }
        });
    }, [data]);

    const handleCatalogCancel = useCallback(() => {
        setShowCatalog(false);
    }, []);

    const handleDiscard = () => {
        if (!data) {return;}
        // eslint-disable-next-line no-alert -- Confirmação necessária para ação destrutiva
        if (!window.confirm('Tem certeza que deseja descartar esta evidência?')) {
            return;
        }
        chrome.runtime.sendMessage({ 
            type: 'DISCARD_EVIDENCE', 
            payload: { evidenceId: data.evidenceId } 
        }, (response) => {
            if (response?.success) {
                window.close();
            } else {
                console.error('[PreviewApp] Erro ao descartar:', response?.error ?? 'Desconhecido');
                setError('Erro ao descartar: ' + (response?.error ?? 'Desconhecido'));
            }
        });
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-600 dark:text-gray-400">Carregando evidência...</p>
            </div>
        </div>;
    }

    if (error || !data) {
        return <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
            <div className="text-center max-w-md p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
                <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Erro</h2>
                <p className="text-gray-600 dark:text-gray-400">{error ?? 'Evidência não encontrada'}</p>
            </div>
        </div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col items-center">
            
            <header className="w-full max-w-4xl mb-8 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Shield className="w-8 h-8 text-indigo-600" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Revisão de Evidência</h1>
                </div>
                <TimestampBadge timestamp={data.timestamp} />
            </header>

            <main className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                
                {/* Header da Evidência */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{data.title}</h2>
                    <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline truncate block mt-1">
                        {data.url}
                    </a>
                </div>

                {/* Área de Preview Mídia */}
                <div className="aspect-video bg-gray-900 flex items-center justify-center relative group overflow-hidden">
                    {data.mediaUrl ? (
                        data.type === 'video' ? (
                            <video src={data.mediaUrl} controls className="w-full h-full object-contain" />
                        ) : (
                            <img src={data.mediaUrl} alt="Preview" className="w-full h-full object-contain" />
                        )
                    ) : (
                         <div className="text-white flex flex-col items-center">
                            <Shield className="w-12 h-12 mb-2 opacity-50" />
                            <p>Visualização não disponível</p>
                         </div>
                    )}
                </div>
                
                {/* Ações */}
                <div className="p-6 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <FileCheck className="w-4 h-4" />
                        <span>Hash SHA-256 verificado: {data.hash ? data.hash.substring(0, 10) + '...' : 'Pendente'}</span>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={handleDiscard}
                            className="px-6 py-2.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
                        >
                            Descartar
                        </button>
                        <button 
                            onClick={handleApprove}
                            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Aprovar e Certificar
                        </button>
                    </div>
                </div>

            </main>

            <footer className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Esta evidência será registrada em blockchain e assinada digitalmente após aprovação.</p>
                <p className="mt-1 text-xs">Aprovação expira em 24 horas.</p>
            </footer>

            {/* Modal de Catalogacao */}
            {data && (
                <CatalogModal
                    open={showCatalog}
                    initialTitle={data.title}
                    pageUrl={data.url}
                    onConfirm={handleCatalogConfirm}
                    onSkip={handleCatalogSkip}
                    onCancel={handleCatalogCancel}
                />
            )}

        </div>
    );
};
