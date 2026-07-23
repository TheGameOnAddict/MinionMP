import { useState, useEffect, useRef } from 'react'
import { BookOpen, Trash2, Check, X, Plus, FileText, RefreshCw, Lock, UploadCloud } from 'lucide-react'
import { getCatalogLibrary, fetchMergedCatalogLibrary, CatalogMetadata, getPdfFromIndexedDb, addCatalogToLibrary, removeCatalogFromLibrary, DEFAULT_CATALOG } from '../utils/pdfStore'
import { adminStore } from '../utils/adminStore'
import { db } from '../utils/db'

interface CatalogLibraryModalProps {
    isOpen: boolean
    activeCatalogId: string
    onClose: () => void
    onSelectCatalog: (catalog: CatalogMetadata, blobUrl?: string) => void
    onRequestAdminUnlock?: () => void
}

interface CatalogCardProps {
    catalog: CatalogMetadata
    isActive: boolean
    isAdmin: boolean
    onSelect: () => void
    onDelete: () => void
    onUpdatePdf: (file: File) => void
}

function CatalogCard({ catalog, isActive, isAdmin, onSelect, onDelete, onUpdatePdf }: CatalogCardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const updateInputRef = useRef<HTMLInputElement>(null)
    const [loading, setLoading] = useState(true)
    const [pageCount, setPageCount] = useState<number | null>(null)

    useEffect(() => {
        let active = true
        const renderCover = async () => {
            setLoading(true)
            try {
                const pdfjsLib = (window as any).pdfjsLib
                if (!pdfjsLib) {
                    setLoading(false)
                    return
                }
                let doc: any = null

                // Try local IndexedDB blob first
                if (catalog.id !== DEFAULT_CATALOG.id) {
                    try {
                        const blob = await getPdfFromIndexedDb(catalog.id)
                        if (blob) {
                            const arrayBuffer = await blob.arrayBuffer()
                            doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
                        }
                    } catch (e) { /* ignore */ }
                }

                // Try cloud URL
                if (!doc && catalog.pdf_url) {
                    try {
                        doc = await pdfjsLib.getDocument(catalog.pdf_url).promise
                    } catch (e) { /* ignore */ }
                }

                // Fallback to default sample
                if (!doc) {
                    doc = await pdfjsLib.getDocument('sample-catalog.pdf').promise
                }

                if (doc && active) {
                    setPageCount(doc.numPages)
                    const page = await doc.getPage(1)
                    const viewport = page.getViewport({ scale: 0.5 })
                    const canvas = canvasRef.current
                    if (canvas) {
                        canvas.width = viewport.width
                        canvas.height = viewport.height
                        const ctx = canvas.getContext('2d')
                        if (ctx) {
                            await page.render({ canvasContext: ctx, viewport }).promise
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to render cover for ${catalog.name}`, e)
            } finally {
                if (active) setLoading(false)
            }
        }

        renderCover()
        return () => { active = false }
    }, [catalog])

    return (
        <div
            onClick={onSelect}
            className={`group relative bg-gray-850/80 hover:bg-gray-800 border-2 rounded-2xl p-4 flex flex-col items-center transition-all duration-300 hover:scale-[1.03] shadow-xl hover:shadow-2xl hover:shadow-minion-500/10 cursor-pointer overflow-hidden ${
                isActive ? 'border-minion-500 ring-2 ring-minion-500/30' : 'border-gray-800 hover:border-gray-700'
            }`}
        >
            {/* Hidden Input for Updating Catalog File */}
            <input
                ref={updateInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                        onUpdatePdf(file)
                        e.target.value = ''
                    }
                }}
            />

            {/* Active Badge */}
            {isActive && (
                <div className="absolute top-3 left-3 bg-minion-500 text-black text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md z-10">
                    <Check size={12} strokeWidth={3} /> Active
                </div>
            )}

            {/* Admin Action Buttons — hover reveal */}
            {isAdmin && (
                <div className="absolute top-3 right-3 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Update Catalog PDF (Preserves Annotations) */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            updateInputRef.current?.click()
                        }}
                        className="p-1.5 bg-gray-900/90 hover:bg-minion-500 text-gray-300 hover:text-black rounded-lg transition-colors"
                        title="Update PDF (Preserves Notes & Annotations)"
                    >
                        <UploadCloud size={14} />
                    </button>

                    {/* Delete Catalog */}
                    {!catalog.isDefault && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`Delete "${catalog.name}" from catalog library?`)) {
                                    onDelete()
                                }
                            }}
                            className="p-1.5 bg-gray-900/90 hover:bg-red-500 text-gray-300 hover:text-white rounded-lg transition-colors"
                            title="Delete Catalog"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* E-book Cover Frame */}
            <div className="w-full h-48 bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center relative shadow-inner mb-3 border border-gray-800/80">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 z-10">
                        <RefreshCw className="animate-spin text-minion-500" size={20} />
                    </div>
                )}
                <canvas ref={canvasRef} className="max-h-full max-w-full object-contain block group-hover:scale-105 transition-transform duration-500" />
            </div>

            {/* Catalog Info */}
            <div className="w-full text-center space-y-1">
                <h4 className="text-sm font-bold text-gray-100 group-hover:text-minion-400 transition-colors truncate px-1">
                    {catalog.name}
                </h4>
                <div className="flex items-center justify-center gap-2 text-[10.5px] text-gray-450 font-mono">
                    <span className="flex items-center gap-1">
                        <FileText size={11} /> {pageCount !== null ? `${pageCount} pages` : 'PDF Document'}
                    </span>
                    <span>•</span>
                    <span>{(catalog.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
            </div>
        </div>
    )
}

export default function CatalogLibraryModal({
    isOpen,
    activeCatalogId,
    onClose,
    onSelectCatalog,
    onRequestAdminUnlock
}: CatalogLibraryModalProps) {
    const [catalogs, setCatalogs] = useState<CatalogMetadata[]>(getCatalogLibrary())
    const [isAdmin, setIsAdmin] = useState(adminStore.getIsUnlocked())
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const refreshCatalogs = async () => {
        const merged = await fetchMergedCatalogLibrary()
        setCatalogs(merged)
    }

    useEffect(() => {
        const unsubscribeAdmin = adminStore.subscribe(() => {
            setIsAdmin(adminStore.getIsUnlocked())
        })

        // Realtime subscription for cloud catalogs
        const unsubscribeRealtime = db.subscribeToCatalogs(() => {
            refreshCatalogs()
        })

        return () => {
            unsubscribeAdmin()
            unsubscribeRealtime()
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            refreshCatalogs()
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const newMeta = await addCatalogToLibrary(file)
            await refreshCatalogs()
            // Create a direct blob URL from the raw file so the viewer loads it immediately
            const blobUrl = URL.createObjectURL(file)
            onSelectCatalog(newMeta, blobUrl)
            onClose()
        } catch (err) {
            console.error('Failed to upload catalog:', err)
            alert('Failed to save catalog PDF.')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleUpdateCatalogPdf = async (catalogId: string, file: File) => {
        setUploading(true)
        try {
            const targetCatalog = catalogs.find(c => c.id === catalogId)
            const catalogDisplayName = targetCatalog?.name || catalogId
            // Invalidate old page metadata scan cache so new figures and pages are indexed
            localStorage.removeItem(`pdf_metadata_v3_${catalogId}`)

            console.debug('[CatalogUpdate] Starting update for:', catalogId, 'file:', file.name, 'size:', file.size)
            const updatedMeta = await addCatalogToLibrary(file, targetCatalog?.name, catalogId)
            console.debug('[CatalogUpdate] addCatalogToLibrary returned:', updatedMeta)
            await refreshCatalogs()

            // Create a direct blob URL from the raw File object — bypasses ALL caching
            const blobUrl = URL.createObjectURL(file)
            console.debug('[CatalogUpdate] Created blobUrl:', blobUrl, 'calling onSelectCatalog...')
            onSelectCatalog(updatedMeta, blobUrl)
            onClose()
            // Use setTimeout so the alert doesn't block React from flushing the state updates
            setTimeout(() => alert(`Updated PDF for "${catalogDisplayName}"! All linked notes and drawings have been preserved.`), 100)
        } catch (err) {
            console.error('Failed to update catalog PDF:', err)
            alert('Failed to update catalog PDF.')
        } finally {
            setUploading(false)
        }
    }

    const handleDeleteCatalog = async (id: string) => {
        await removeCatalogFromLibrary(id)
        await refreshCatalogs()

        const updated = getCatalogLibrary()
        if (activeCatalogId === id && updated.length > 0) {
            onSelectCatalog(updated[0])
        }
    }

    return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fade-in select-none">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-minion-500/10 border border-minion-500/20 flex items-center justify-center text-minion-500">
                            <BookOpen size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-white tracking-tight">Catalog Library</h2>
                            <p className="text-xs text-gray-400">Select an aircraft manual or catalog to open in the viewer</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isAdmin && onRequestAdminUnlock && (
                            <button
                                onClick={onRequestAdminUnlock}
                                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-minion-400 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 bg-gray-850/50 transition-colors cursor-pointer"
                            >
                                <Lock size={14} /> Unlock Admin Uploads
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Catalog Grid */}
                <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {catalogs.map(cat => (
                            <CatalogCard
                                key={cat.id}
                                catalog={cat}
                                isActive={activeCatalogId === cat.id}
                                isAdmin={isAdmin}
                                onSelect={() => {
                                    onSelectCatalog(cat)
                                    onClose()
                                }}
                                onDelete={() => handleDeleteCatalog(cat.id)}
                                onUpdatePdf={(file) => handleUpdateCatalogPdf(cat.id, file)}
                            />
                        ))}

                        {/* Admin Upload Card */}
                        {isAdmin && (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-800 hover:border-minion-500/60 bg-gray-950/40 hover:bg-gray-850/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-all duration-300 min-h-[260px] cursor-pointer text-center group"
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                {uploading ? (
                                    <RefreshCw className="animate-spin text-minion-500" size={32} />
                                ) : (
                                    <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-500 group-hover:text-minion-400 group-hover:border-minion-500/40 transition-colors">
                                        <Plus size={28} />
                                    </div>
                                )}
                                <div>
                                    <h4 className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">
                                        {uploading ? 'Uploading to Supabase Cloud...' : 'Upload New Catalog'}
                                    </h4>
                                    <p className="text-[11px] text-gray-500 mt-1 max-w-[180px] leading-relaxed">
                                        Add a new PDF manual to the cloud (Shared across all devices)
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
