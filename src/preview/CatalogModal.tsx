/**
 * Modal de Catalogacao - Lexato Chrome Extension
 *
 * Modal glassmorphism exibido apos o usuario clicar em "Aprovar e Certificar".
 * Permite enriquecer a evidencia com titulo, tags, numero do processo (CNJ)
 * e notas antes da certificacao.
 *
 * Campos:
 * - Titulo: pre-preenchido com document.title, editavel
 * - Tags: input com chips, autocomplete de tags existentes
 * - Numero do Processo: mascara CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO), opcional
 * - Notas: textarea opcional, colapsavel
 *
 * @module CatalogModal
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Tag, FileText, Hash, ChevronDown, ChevronUp, FolderPlus, Folder, Loader2 } from 'lucide-react';
import { catalogService, type Collection, type TagSuggestion } from '../lib/catalog.service';

// -- Tipos --

/** Dados de catalogacao retornados pelo modal */
export interface CatalogData {
  title: string;
  tags: string[];
  caseNumber: string;
  notes: string;
  collectionId?: string | undefined;
  newCollection?: {
    name: string;
    description?: string | undefined;
  } | undefined;
}

interface CatalogModalProps {
  /** Se o modal esta aberto */
  open: boolean;
  /** Titulo pre-preenchido (document.title da pagina capturada) */
  initialTitle: string;
  /** URL da pagina capturada (exibida como referencia) */
  pageUrl: string;
  /** Callback ao confirmar com dados de catalogacao */
  onConfirm: (data: CatalogData) => void;
  /** Callback ao pular catalogacao (aprovar sem metadados) */
  onSkip: () => void;
  /** Callback ao cancelar (voltar ao preview) */
  onCancel: () => void;
}

// -- Constantes --

/** Regex para validacao do formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO */
const CNJ_REGEX = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

/** Comprimento maximo do titulo */
const MAX_TITLE_LENGTH = 200;

/** Maximo de tags permitidas */
const MAX_TAGS = 10;

/** Comprimento maximo de cada tag */
const MAX_TAG_LENGTH = 50;

// -- Helpers --

/**
 * Aplica mascara CNJ ao valor digitado.
 * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
 */
export function applyCnjMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 20);
  let masked = '';

  for (let i = 0; i < digits.length; i++) {
    if (i === 7) { masked += '-'; }
    if (i === 9) { masked += '.'; }
    if (i === 13) { masked += '.'; }
    if (i === 14) { masked += '.'; }
    if (i === 16) { masked += '.'; }
    masked += digits[i];
  }

  return masked;
}

/**
 * Valida se o numero do processo esta no formato CNJ correto.
 */
export function isValidCnj(value: string): boolean {
  if (!value) { return true; } // Campo opcional
  return CNJ_REGEX.test(value);
}

// -- Componente --

export function CatalogModal({
  open,
  initialTitle,
  pageUrl,
  onConfirm,
  onSkip,
  onCancel,
}: CatalogModalProps): React.ReactElement | null {
  // Estado dos campos
  const [title, setTitle] = useState(initialTitle);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [caseNumber, setCaseNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [cnjError, setCnjError] = useState('');
  
  // Estado de coleções
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);

  // Refs
  const tagInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const collectionDropdownRef = useRef<HTMLDivElement>(null);
  const collectionSearchRef = useRef<HTMLInputElement>(null);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setTags([]);
      setTagInput('');
      setCaseNumber('');
      setNotes('');
      setShowNotes(false);
      setCnjError('');
      setSelectedCollectionId('');
      setIsCreatingCollection(false);
      setNewCollectionName('');
      setNewCollectionDescription('');
      setCollectionSearch('');
      setShowCollectionDropdown(false);
      
      // Load collections
      setIsLoadingCollections(true);
      catalogService.getCollections()
        .then(setCollections)
        .catch(err => console.error('Error loading collections:', err))
        .finally(() => setIsLoadingCollections(false));

      // Foco no titulo apos animacao
      setTimeout(() => titleInputRef.current?.select(), 400);
    }
  }, [open, initialTitle]);

  // Escape para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onCancel();
    };
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onCancel]);

  // Adicionar tag
  const addTag = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) { return; }
    if (trimmed.length > MAX_TAG_LENGTH) { return; }
    if (tags.length >= MAX_TAGS) { return; }
    if (tags.includes(trimmed)) { return; }
    setTags(prev => [...prev, trimmed]);
    setTagInput('');
  }, [tags]);

  // Remover tag
  const removeTag = useCallback((index: number) => {
    setTags(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagSuggestions([]);
    }
    // Backspace remove ultima tag se input vazio
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags.length - 1);
    }
    // Escape fecha sugestoes
    if (e.key === 'Escape' && showTagSuggestions) {
      e.preventDefault();
      e.stopPropagation(); // Evita fechar o modal
      setShowTagSuggestions(false);
    }
  }, [tagInput, tags, addTag, removeTag, showTagSuggestions]);

  // Busca tags
  useEffect(() => {
      const delayDebounceFn = setTimeout(() => {
        if (tagInput.length >= 2) {
            catalogService.searchTags(tagInput)
                .then(suggestions => {
                    setTagSuggestions(suggestions);
                    setShowTagSuggestions(true);
                })
                .catch(console.error);
        } else {
            setTagSuggestions([]);
            setShowTagSuggestions(false);
        }
      }, 300);

      return () => clearTimeout(delayDebounceFn);
  }, [tagInput]);

  // Fechar dropdown de coleções ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(e.target as Node)) {
        setShowCollectionDropdown(false);
      }
    };
    if (showCollectionDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCollectionDropdown]);

  // Coleções filtradas por texto digitado (case-insensitive substring match)
  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(collectionSearch.toLowerCase())
  );

  // Nome da coleção selecionada para exibir no campo
  const selectedCollectionName = collections.find(c => c.id === selectedCollectionId)?.name ?? '';

  // Criar coleção
  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) { return; }
    try {
        setIsLoadingCollections(true);
        const newCol = await catalogService.createCollection({
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim() || undefined,
        });
        setCollections(prev => [newCol, ...prev]);
        setSelectedCollectionId(newCol.id);
        setIsCreatingCollection(false);
        setNewCollectionName('');
        setNewCollectionDescription('');
        setCollectionSearch('');
        setShowCollectionDropdown(false);
    } catch (err) {
        console.error('Erro ao criar coleção:', err);
    } finally {
        setIsLoadingCollections(false);
    }
  };

  // Handler do numero CNJ
  const handleCaseNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = applyCnjMask(e.target.value);
    setCaseNumber(masked);
    if (masked && !isValidCnj(masked) && masked.length === 25) {
      setCnjError('Formato invalido. Use: NNNNNNN-DD.AAAA.J.TR.OOOO');
    } else {
      setCnjError('');
    }
  }, []);

  // Confirmar catalogacao
  const handleConfirm = useCallback(() => {
    if (caseNumber && !isValidCnj(caseNumber)) {
      setCnjError('Formato invalido. Use: NNNNNNN-DD.AAAA.J.TR.OOOO');
      return;
    }

    // Monta dados de nova coleção inline (se o usuário preencheu nome sem salvar)
    const pendingNewCollection = isCreatingCollection && newCollectionName.trim()
      ? { name: newCollectionName.trim(), description: newCollectionDescription.trim() || undefined }
      : undefined;

    onConfirm({
      title: title.trim() || initialTitle,
      tags,
      caseNumber: caseNumber.trim(),
      notes: notes.trim(),
      collectionId: selectedCollectionId || undefined,
      newCollection: pendingNewCollection,
    });
  }, [title, tags, caseNumber, notes, selectedCollectionId, initialTitle, onConfirm, isCreatingCollection, newCollectionName, newCollectionDescription]);

  // Atalho Ctrl+Enter para confirmar
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (open && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, handleConfirm]);

  if (!open) { return null; }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'catalog-backdrop-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-modal-title"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: '20px',
          border: '1px solid rgba(0, 222, 165, 0.2)',
          background: 'linear-gradient(135deg, rgba(0, 222, 165, 0.08) 0%, rgba(15, 14, 16, 0.95) 30%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 32px 64px -16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04) inset',
          animation: 'catalog-modal-slide 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2
              id="catalog-modal-title"
              style={{ fontSize: '18px', fontWeight: 600, color: '#F7F9FB', margin: 0 }}
            >
              Catalogar Evidencia
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(247, 249, 251, 0.5)', margin: '4px 0 0', lineHeight: 1.4 }}>
              Organize sua captura antes da certificacao (opcional)
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Fechar"
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { 
                e.currentTarget.style.color = '#FFF'; 
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; 
            }}
            onMouseLeave={e => { 
                e.currentTarget.style.color = '#9CA3AF'; 
                e.currentTarget.style.backgroundColor = 'transparent'; 
            }}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* URL de referencia */}
        <div style={{ padding: '12px 24px 0' }}>
          <div style={{
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '12px',
            color: 'rgba(247, 249, 251, 0.4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {pageUrl}
          </div>
        </div>

        {/* Campos */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Titulo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="catalog-title"
              style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(247, 249, 251, 0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <FileText style={{ width: '14px', height: '14px' }} />
              Titulo
            </label>
            <input
              ref={titleInputRef}
              id="catalog-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH))}
              placeholder="Titulo da evidencia"
              style={{
                width: '100%',
                height: '44px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(10px)',
                color: '#F7F9FB',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(0, 222, 165, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 222, 165, 0.1)';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
              }}
            />
            <span style={{ fontSize: '11px', color: 'rgba(247, 249, 251, 0.3)', textAlign: 'right' }}>
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="catalog-tags"
              style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(247, 249, 251, 0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Tag style={{ width: '14px', height: '14px' }} />
              Tags
              <span style={{ fontSize: '11px', color: 'rgba(247, 249, 251, 0.3)', fontWeight: 400 }}>
                ({tags.length}/{MAX_TAGS})
              </span>
            </label>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px 12px',
                minHeight: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(10px)',
                alignItems: 'center',
                cursor: 'text',
                transition: 'all 0.2s ease',
              }}
              onClick={() => tagInputRef.current?.focus()}
              onFocus={() => {
                const el = tagInputRef.current?.parentElement;
                if (el) {
                  el.style.borderColor = 'rgba(0, 222, 165, 0.5)';
                  el.style.boxShadow = '0 0 25px rgba(0, 222, 165, 0.1)';
                  el.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                }
              }}
              onBlur={() => {
                const el = tagInputRef.current?.parentElement;
                if (el) {
                  el.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  el.style.boxShadow = 'none';
                  el.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }
              }}
            >
              {tags.map((tag, index) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(0, 222, 165, 0.1)',
                    border: '1px solid rgba(0, 222, 165, 0.2)',
                    color: '#00DEA5',
                    fontSize: '12px',
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeTag(index); }}
                    aria-label={`Remover tag ${tag}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(0, 222, 165, 0.6)',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '14px',
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#00DEA5'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0, 222, 165, 0.6)'; }}
                  >
                    <X style={{ width: '12px', height: '12px' }} />
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                id="catalog-tags"
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={(e) => {
                  // Não adicionar tag se o clique foi em uma sugestão do dropdown
                  const relatedTarget = e.relatedTarget as HTMLElement | null;
                  if (relatedTarget?.closest('[data-tag-suggestions]')) { return; }
                  if (tagInput.trim()) { addTag(tagInput); }
                  // Fechar sugestões ao perder foco (com delay para permitir clique)
                  setTimeout(() => setShowTagSuggestions(false), 150);
                }}
                placeholder={tags.length === 0 ? 'Digite e pressione Enter' : ''}
                disabled={tags.length >= MAX_TAGS}
                style={{
                  flex: 1,
                  minWidth: '80px',
                  border: 'none',
                  background: 'transparent',
                  color: '#F7F9FB',
                  fontSize: '13px',
                  outline: 'none',
                  padding: '2px 0',
                }}
              />
              
              {/* Sugestões de Tags */}
              {showTagSuggestions && tagSuggestions.length > 0 && (
                <div data-tag-suggestions style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: '#1A1D1F',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                    zIndex: 10,
                    maxHeight: '150px',
                    overflowY: 'auto',
                }}>
                    {tagSuggestions.map((s) => (
                        <button
                            key={s.tag}
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                addTag(s.tag);
                                setTagInput('');
                                setTagSuggestions([]);
                                setShowTagSuggestions(false);
                                tagInputRef.current?.focus();
                            }}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#F7F9FB',
                                fontSize: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <span>{s.tag}</span>
                            <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{s.count}</span>
                        </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Coleções - dropdown com busca e criação inline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(247, 249, 251, 0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Folder style={{ width: '14px', height: '14px' }} />
              Coleção
              <span style={{ fontSize: '11px', color: 'rgba(247, 249, 251, 0.3)', fontWeight: 400 }}>
                (opcional)
              </span>
            </label>
            
            {!isCreatingCollection ? (
              <div ref={collectionDropdownRef} style={{ position: 'relative' }}>
                {/* Campo de seleção com busca */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '44px',
                    borderRadius: '10px',
                    border: `1px solid ${showCollectionDropdown ? 'rgba(0, 222, 165, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                    backgroundColor: showCollectionDropdown ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                    boxShadow: showCollectionDropdown ? '0 0 25px rgba(0, 222, 165, 0.1)' : 'none',
                    transition: 'all 0.2s ease',
                    cursor: 'text',
                    overflow: 'hidden',
                  }}
                  onClick={() => {
                    setShowCollectionDropdown(true);
                    setTimeout(() => collectionSearchRef.current?.focus(), 0);
                  }}
                >
                  <input
                    ref={collectionSearchRef}
                    type="text"
                    value={showCollectionDropdown ? collectionSearch : selectedCollectionName}
                    onChange={e => {
                      setCollectionSearch(e.target.value);
                      if (!showCollectionDropdown) setShowCollectionDropdown(true);
                    }}
                    onFocus={() => {
                      setShowCollectionDropdown(true);
                      setCollectionSearch('');
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCollectionDropdown(false);
                        setCollectionSearch('');
                        collectionSearchRef.current?.blur();
                      }
                    }}
                    placeholder="Buscar ou selecionar coleção..."
                    style={{
                      flex: 1,
                      height: '100%',
                      padding: '0 14px',
                      border: 'none',
                      background: 'transparent',
                      color: '#F7F9FB',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                  {/* Botão limpar seleção */}
                  {selectedCollectionId && !showCollectionDropdown && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedCollectionId('');
                        setCollectionSearch('');
                      }}
                      aria-label="Limpar seleção"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 4px',
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.4)',
                        cursor: 'pointer',
                      }}
                    >
                      <X style={{ width: '14px', height: '14px' }} />
                    </button>
                  )}
                  <div style={{ padding: '0 12px 0 4px', display: 'flex', alignItems: 'center', color: 'rgba(255, 255, 255, 0.4)' }}>
                    {isLoadingCollections
                      ? <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                      : <ChevronDown style={{ width: '16px', height: '16px', transform: showCollectionDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    }
                  </div>
                </div>

                {/* Dropdown de coleções */}
                {showCollectionDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: '#1A1D1F',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                    zIndex: 20,
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}>
                    {/* Opção: Criar nova coleção */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingCollection(true);
                        setShowCollectionDropdown(false);
                        setCollectionSearch('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '10px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                        color: '#00DEA5',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 222, 165, 0.08)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <FolderPlus style={{ width: '15px', height: '15px', flexShrink: 0 }} />
                      Criar nova coleção
                    </button>

                    {/* Lista de coleções filtradas */}
                    {filteredCollections.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)', textAlign: 'center' }}>
                        Nenhuma coleção encontrada
                      </div>
                    ) : (
                      filteredCollections.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCollectionId(c.id);
                            setCollectionSearch('');
                            setShowCollectionDropdown(false);
                          }}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            padding: '10px 12px',
                            background: c.id === selectedCollectionId ? 'rgba(0, 222, 165, 0.08)' : 'transparent',
                            border: 'none',
                            color: '#F7F9FB',
                            fontSize: '13px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = c.id === selectedCollectionId ? 'rgba(0, 222, 165, 0.08)' : 'transparent'}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          {c.evidence_count > 0 && (
                            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.3)', flexShrink: 0, marginLeft: '8px' }}>
                              {c.evidence_count}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Formulário de criação inline */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Nome da coleção"
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCollectionName.trim()) handleCreateCollection();
                    else if (e.key === 'Escape') { setIsCreatingCollection(false); setNewCollectionName(''); setNewCollectionDescription(''); }
                  }}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0, 222, 165, 0.5)',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#F7F9FB',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  type="text"
                  placeholder="Descrição (opcional)"
                  value={newCollectionDescription}
                  onChange={e => setNewCollectionDescription(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCollectionName.trim()) handleCreateCollection();
                    else if (e.key === 'Escape') { setIsCreatingCollection(false); setNewCollectionName(''); setNewCollectionDescription(''); }
                  }}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    color: '#F7F9FB',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => { setIsCreatingCollection(false); setNewCollectionName(''); setNewCollectionDescription(''); }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      background: 'transparent',
                      color: '#F7F9FB',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim() || isLoadingCollections}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#00DEA5',
                      color: '#000',
                      fontWeight: 500,
                      fontSize: '13px',
                      cursor: 'pointer',
                      opacity: (!newCollectionName.trim() || isLoadingCollections) ? 0.5 : 1,
                    }}
                  >
                    {isLoadingCollections ? 'Salvando...' : 'Criar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Numero do Processo (CNJ) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="catalog-case-number"
              style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(247, 249, 251, 0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Hash style={{ width: '14px', height: '14px' }} />
              Numero do Processo
              <span style={{ fontSize: '11px', color: 'rgba(247, 249, 251, 0.3)', fontWeight: 400 }}>
                (opcional)
              </span>
            </label>
            <input
              id="catalog-case-number"
              type="text"
              value={caseNumber}
              onChange={handleCaseNumberChange}
              placeholder="NNNNNNN-DD.AAAA.J.TR.OOOO"
              maxLength={25}
              style={{
                width: '100%',
                height: '44px',
                padding: '0 14px',
                borderRadius: '10px',
                border: `1px solid ${cnjError ? 'rgba(239, 83, 80, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(10px)',
                color: '#F7F9FB',
                fontSize: '14px',
                fontFamily: 'monospace',
                letterSpacing: '0.5px',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxSizing: 'border-box',
              }}
              onFocus={e => {
                if (!cnjError) {
                  e.currentTarget.style.borderColor = 'rgba(0, 222, 165, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 222, 165, 0.1)';
                }
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = cnjError ? 'rgba(239, 83, 80, 0.5)' : 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.boxShadow = cnjError ? '0 0 15px rgba(239, 83, 80, 0.1)' : 'none';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
              }}
            />
            {cnjError && (
              <span style={{ fontSize: '11px', color: '#EF5350' }}>{cnjError}</span>
            )}
          </div>

          {/* Notas (colapsavel) */}
          <div>
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                color: 'rgba(247, 249, 251, 0.5)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '4px 0',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(247, 249, 251, 0.7)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(247, 249, 251, 0.5)'; }}
            >
              {showNotes ? <ChevronUp style={{ width: '14px', height: '14px' }} /> : <ChevronDown style={{ width: '14px', height: '14px' }} />}
              Notas adicionais (opcional)
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observacoes sobre esta evidencia..."
                rows={3}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  backdropFilter: 'blur(10px)',
                  color: '#F7F9FB',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  outline: 'none',
                  resize: 'vertical',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(0, 222, 165, 0.5)';
                  e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 222, 165, 0.1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }}
              />
            )}
          </div>
        </div>

        {/* Footer com botoes */}
        <div style={{
          padding: '16px 24px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          {/* Atalho */}
          <span style={{ fontSize: '11px', color: 'rgba(247, 249, 251, 0.25)' }}>
            Ctrl+Enter para confirmar
          </span>

          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Pular e Aprovar */}
            <CatalogButton
              label="Pular e Aprovar"
              variant="secondary"
              onClick={onSkip}
            />
            {/* Aprovar e Certificar */}
            <CatalogButton
              label="Aprovar e Certificar"
              variant="primary"
              onClick={handleConfirm}
            />
          </div>
        </div>
      </div>

      {/* Animacoes CSS */}
      <style>{`
        @keyframes catalog-backdrop-fade {
          from { opacity: 0; backdrop-filter: blur(0); }
          to { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes catalog-modal-slide {
          0% { opacity: 0; transform: translateY(32px) scale(0.94); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// -- Botao interno --

interface CatalogButtonProps {
  label: string;
  variant: 'primary' | 'secondary';
  onClick: () => void;
}

function CatalogButton({ label, variant, onClick }: CatalogButtonProps): React.ReactElement {
  const [isHovering, setIsHovering] = useState(false);

  const isPrimary = variant === 'primary';

  const baseStyle: React.CSSProperties = {
    padding: '12px 20px',
    borderRadius: '12px',
    fontWeight: 500,
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    border: 'none',
    whiteSpace: 'nowrap',
  };

  const primaryStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: isHovering ? '#00C896' : '#00DEA5',
    color: '#000000',
    boxShadow: isHovering
      ? '0 16px 32px -8px rgba(0, 222, 165, 0.4)'
      : '0 10px 25px -5px rgba(0, 222, 165, 0.3)',
    transform: isHovering ? 'translateY(-2px)' : 'translateY(0)',
  };

  const secondaryStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: isHovering ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
    color: isHovering ? '#FFFFFF' : '#D1D5DB',
    border: `1px solid ${isHovering ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
    backdropFilter: 'blur(4px)',
    transform: isHovering ? 'translateY(-2px)' : 'translateY(0)',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={isPrimary ? primaryStyle : secondaryStyle}
    >
      {label}
    </button>
  );
}

export default CatalogModal;
