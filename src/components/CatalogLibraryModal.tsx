import { useState, useEffect, useRef } from 'react'
import { BookOpen, Trash2, Check, X, Plus, FileText, RefreshCw, Lock, UploadCloud, Folder } from 'lucide-react'
import { getCatalogLibrary, fetchMergedCatalogLibrary, CatalogMetadata, getPdfFromIndexedDb, addCatalogToLibrary, removeCatalogFromLibrary, updateCatalogFolderInLibrary, DEFAULT_CATALOG } from '../utils/pdfStore'
import { adminStore } from '../utils/adminStore'
import { db, CatalogFolder } from '../utils/db'

interface CatalogLibraryModalProps {
    isOpen: boolean
    activeCatalogId: string
    onClose: () => void
    onSelectCatalog: (catalog: CatalogMetadata, blobUrl?: string) => void
    onRequestAdminUnlock?: () => void
}

interface CatalogCardProps {
    catalog: CatalogMetadata
    folders: CatalogFolder[]
    isActive: boolean
    isAdmin: boolean
    onSelect: () => void
    onDelete: () => void
    onUpdatePdf: (file: File) => void
    onMoveToFolder: (folderId: string, folderName: string) => void
}

function CatalogCard({ catalog, folders, isActive, isAdmin, onSelect, onDelete, onUpdatePdf, onMoveToFolder }: CatalogCardProps) {
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
            draggable={isAdmin}
            onDragStart={(e) => {
                if (!isAdmin) return
                e.dataTransfer.setData('text/plain', catalog.id)
                e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={onSelect}
            className={`group relative bg-gray-850/80 hover:bg-gray-800 border-2 rounded-2xl p-4 flex flex-col items-center transition-all duration-300 hover:scale-[1.02] shadow-xl hover:shadow-2xl hover:shadow-minion-500/10 ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} overflow-hidden ${
                isActive ? 'border-minion-500 ring-2 ring-minion-500/30' : 'border-gray-800 hover:border-gray-700'
            }`}
            title={isAdmin ? "Click to open or Drag card onto a Folder tab above to move!" : "Click to open catalog"}
        >
            {/* Hidden Input for Updating Catalog File */}
            <input
                ref={updateInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
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
                </div>
            )}

            {/* E-book Cover Frame */}
            <div className="w-full h-44 bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center relative shadow-inner mb-3 border border-gray-800/80 pointer-events-none">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 z-10">
                        <RefreshCw className="animate-spin text-minion-500" size={20} />
                    </div>
                )}
                <canvas ref={canvasRef} className="max-h-full max-w-full object-contain block group-hover:scale-105 transition-transform duration-500" />
            </div>

            {/* Catalog Info & Folder Badge */}
            <div className="w-full text-center space-y-1.5">
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

                {/* Assigned Folder Badge */}
                <div className="pt-0.5 flex items-center justify-center">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono text-minion-300 bg-minion-500/10 border border-minion-500/30 px-2 py-0.5 rounded-md">
                        <Folder size={10} /> {catalog.folder_name || 'GENERAL & ENGINES'}
                    </span>
                </div>

                {/* Move to Folder Selector (ADMIN ONLY) */}
                {isAdmin && (
                    <div className="w-full mt-2 pt-2 border-t border-gray-800 flex items-center justify-between gap-1 text-[11px]" onClick={e => e.stopPropagation()}>
                        <span className="text-gray-400 font-bold text-[10px] flex items-center gap-1 shrink-0">
                            <Folder size={11} className="text-minion-400" /> Move to:
                        </span>
                        <select
                            value={catalog.folder_id || 'folder_general'}
                            onChange={(e) => {
                                const selectedF = folders.find(f => f.id === e.target.value)
                                if (selectedF) {
                                    onMoveToFolder(selectedF.id, selectedF.name)
                                }
                            }}
                            className="bg-gray-900 border border-gray-700 hover:border-minion-500 text-gray-200 text-[10px] font-bold rounded-lg px-2 py-1 outline-none cursor-pointer font-mono shrink-0 max-w-[150px] truncate"
                        >
                            {folders.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
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
    const [folders, setFolders] = useState<CatalogFolder[]>([])
    const [selectedFolderId, setSelectedFolderId] = useState<string>('all')
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
    const [isAdmin, setIsAdmin] = useState(adminStore.getIsUnlocked())
    const [uploading, setUploading] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')
    const [showNewFolderInput, setShowNewFolderInput] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const refreshCatalogsAndFolders = async () => {
        const [mergedCats, folderList] = await Promise.all([
            fetchMergedCatalogLibrary(),
            db.getCatalogFolders()
        ])
        setCatalogs(mergedCats)
        setFolders(folderList)
    }

    useEffect(() => {
        const unsubscribeAdmin = adminStore.subscribe(() => {
            setIsAdmin(adminStore.getIsUnlocked())
        })

        const unsubscribeRealtime = db.subscribeToCatalogs(() => {
            refreshCatalogsAndFolders()
        })

        return () => {
            unsubscribeAdmin()
            unsubscribeRealtime()
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            refreshCatalogsAndFolders()
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return
        const newFolder: CatalogFolder = {
            id: `folder_${Date.now()}`,
            name: newFolderName.trim().toUpperCase(),
            order: folders.length + 1
        }
        await db.saveCatalogFolder(newFolder)
        setNewFolderName('')
        setShowNewFolderInput(false)
        await refreshCatalogsAndFolders()
        setSelectedFolderId(newFolder.id)
    }

    const handleMoveCatalogToFolder = async (catalogId: string, folderId: string, folderName: string) => {
        const updated = await updateCatalogFolderInLibrary(catalogId, folderId, folderName)
        setCatalogs(updated)
        await refreshCatalogsAndFolders()
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const activeFolder = folders.find(f => f.id === selectedFolderId) || folders[0]
            const folderId = activeFolder ? activeFolder.id : 'folder_general'
            const folderName = activeFolder ? activeFolder.name : 'GENERAL & ENGINES'

            const newMeta = await addCatalogToLibrary(file, undefined, undefined, folderId, folderName)
            
            await refreshCatalogsAndFolders()
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
            localStorage.removeItem(`pdf_metadata_v3_${catalogId}`)

            const activeFolder = folders.find(f => f.id === selectedFolderId) || folders[0]
            const folderId = targetCatalog?.folder_id || activeFolder?.id || 'folder_general'
            const folderName = targetCatalog?.folder_name || activeFolder?.name || 'GENERAL & ENGINES'

            const updatedMeta = await addCatalogToLibrary(file, targetCatalog?.name, catalogId, folderId, folderName)

            await refreshCatalogsAndFolders()
            const blobUrl = URL.createObjectURL(file)
            onSelectCatalog(updatedMeta, blobUrl)
            onClose()
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
        await refreshCatalogsAndFolders()

        const updated = getCatalogLibrary()
        if (activeCatalogId === id && updated.length > 0) {
            onSelectCatalog(updated[0])
        }
    }

    const filteredCatalogs = catalogs.filter(cat => {
        if (selectedFolderId === 'all') return true
        if (cat.folder_id) return cat.folder_id === selectedFolderId
        const folderObj = folders.find(f => f.id === selectedFolderId)
        if (folderObj) {
            const fName = folderObj.name.toLowerCase()
            return cat.name.toLowerCase().includes(fName) || cat.id.toLowerCase().includes(fName)
        }
        return true
    })

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-fade-in select-none">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-minion-500/10 border border-minion-500/20 flex items-center justify-center text-minion-500">
                            <BookOpen size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-white tracking-tight">Aircraft Catalog Library</h2>
                            <p className="text-xs text-gray-400">Select an aircraft folder and catalog to open in the viewer</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <button
                                onClick={async () => {
                                    const merged = await fetchMergedCatalogLibrary()
                                    setCatalogs(merged)
                                    alert('Catalog library cleaned and deduplicated!')
                                }}
                                className="text-[11px] font-bold text-minion-400 hover:text-minion-300 border border-minion-500/30 hover:border-minion-500 bg-minion-500/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                title="Purge duplicate catalog entries"
                            >
                                <RefreshCw size={12} /> Clean Duplicates
                            </button>
                        )}
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

                {/* Folder Carousel Bar & Drag Target */}
                <div className="px-6 py-3 bg-gray-950/40 border-b border-gray-800 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
                    <div className="text-[10px] text-minion-300/90 font-mono font-bold flex items-center gap-1 mr-1 shrink-0 bg-minion-500/10 border border-minion-500/20 px-2 py-1 rounded-lg">
                        💡 Drag cards onto tabs to organize!
                    </div>

                    <button
                        onClick={() => setSelectedFolderId('all')}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolderId('all') }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={async (e) => {
                            e.preventDefault()
                            const catId = e.dataTransfer.getData('text/plain')
                            setDragOverFolderId(null)
                            if (catId) {
                                await handleMoveCatalogToFolder(catId, 'folder_general', 'GENERAL & ENGINES')
                            }
                        }}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                            dragOverFolderId === 'all'
                                ? 'bg-minion-400 text-black font-black ring-4 ring-minion-500/60 scale-105 shadow-xl'
                                : selectedFolderId === 'all'
                                ? 'bg-minion-500 text-black font-black shadow-md'
                                : 'bg-gray-850 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-750'
                        }`}
                    >
                        <span>📁 All Aircraft ({catalogs.length})</span>
                    </button>

                    {folders.map(folder => {
                        const count = catalogs.filter(c => c.folder_id === folder.id || (c.folder_name && c.folder_name === folder.name) || c.name.toLowerCase().includes(folder.name.toLowerCase())).length
                        const isHovered = dragOverFolderId === folder.id

                        return (
                            <div
                                key={folder.id}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = 'move'
                                    setDragOverFolderId(folder.id)
                                }}
                                onDragLeave={() => setDragOverFolderId(null)}
                                onDrop={async (e) => {
                                    e.preventDefault()
                                    const catId = e.dataTransfer.getData('text/plain')
                                    setDragOverFolderId(null)
                                    if (catId) {
                                        await handleMoveCatalogToFolder(catId, folder.id, folder.name)
                                    }
                                }}
                                className="flex items-center shrink-0"
                            >
                                <button
                                    onClick={() => setSelectedFolderId(folder.id)}
                                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        isHovered
                                            ? 'bg-minion-400 text-black font-black ring-4 ring-minion-500/60 scale-105 shadow-xl'
                                            : selectedFolderId === folder.id
                                            ? 'bg-minion-500 text-black font-black shadow-md'
                                            : 'bg-gray-850 text-gray-300 hover:text-white hover:bg-gray-800 border border-gray-750'
                                    }`}
                                >
                                    <span>📁 {folder.name} ({count})</span>
                                </button>
                                {isAdmin && folder.id !== 'folder_general' && (
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation()
                                            if (confirm(`Delete folder "${folder.name}"? Catalogs inside will be moved.`)) {
                                                await db.deleteCatalogFolder(folder.id)
                                                await refreshCatalogsAndFolders()
                                                setSelectedFolderId('all')
                                            }
                                        }}
                                        className="ml-1 p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded text-xs cursor-pointer"
                                        title={`Delete folder ${folder.name}`}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        )
                    })}

                    {isAdmin && (
                        showNewFolderInput ? (
                            <div className="flex items-center gap-1.5 shrink-0 animate-fade-in">
                                <input
                                    type="text"
                                    placeholder="FOLDER NAME..."
                                    value={newFolderName}
                                    onChange={e => setNewFolderName(e.target.value)}
                                    className="bg-gray-900 border border-minion-500 text-gray-100 text-xs px-2.5 py-1 rounded-lg outline-none font-mono uppercase"
                                />
                                <button
                                    onClick={handleCreateFolder}
                                    className="px-2.5 py-1 bg-minion-500 hover:bg-minion-400 text-black font-bold rounded-lg text-xs cursor-pointer"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => setShowNewFolderInput(false)}
                                    className="p-1 text-gray-400 hover:text-white text-xs cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowNewFolderInput(true)}
                                className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-gray-700 hover:border-minion-500 text-gray-400 hover:text-minion-400 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                            >
                                <Plus size={14} />
                                <span>New Folder</span>
                            </button>
                        )
                    )}
                </div>

                {/* Catalog Grid */}
                <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                    {filteredCatalogs.length === 0 ? (
                        <div className="py-12 text-center text-gray-500 text-sm italic">
                            No catalogs found in this folder. {isAdmin && 'Click "Upload New Catalog" below to add one.'}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {filteredCatalogs.map(cat => (
                                <CatalogCard
                                    key={cat.id}
                                    catalog={cat}
                                    folders={folders}
                                    isActive={activeCatalogId === cat.id}
                                    isAdmin={isAdmin}
                                    onSelect={() => {
                                        onSelectCatalog(cat)
                                        onClose()
                                    }}
                                    onDelete={() => handleDeleteCatalog(cat.id)}
                                    onUpdatePdf={(file) => handleUpdateCatalogPdf(cat.id, file)}
                                    onMoveToFolder={(fId, fName) => handleMoveCatalogToFolder(cat.id, fId, fName)}
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
                    )}
                </div>
            </div>
        </div>
    )
}
