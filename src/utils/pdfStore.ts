// IndexedDB & Cloud storage service for multiple PDF catalogs
import { db } from './db'

const dbName = 'MinionPdfStore'
const storeName = 'pdf_blobs'
const defaultKey = 'current_pdf'

export interface CatalogMetadata {
    id: string
    name: string
    filename: string
    size: number
    uploadDate: string
    folder_id?: string
    folder_name?: string
    pdf_url?: string
    isDefault?: boolean
}

// Default builtin catalog metadata
export const DEFAULT_CATALOG: CatalogMetadata = {
    id: 'sample-catalog.pdf',
    name: 'Piper PA-28 Parts Catalog',
    filename: 'sample-catalog.pdf',
    size: 13264,
    uploadDate: 'System Default',
    isDefault: true
}

export const savePdfToIndexedDb = (file: Blob, key: string = defaultKey): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName)
        }
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            const putReq = store.put(file, key)
            putReq.onsuccess = () => resolve()
            putReq.onerror = () => reject(putReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}

export const getPdfFromIndexedDb = (key: string = defaultKey): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName)
        }
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readonly')
            const store = transaction.objectStore(storeName)
            const getReq = store.get(key)
            getReq.onsuccess = () => resolve(getReq.result || null)
            getReq.onerror = () => reject(getReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}

export const clearPdfFromIndexedDb = (key: string = defaultKey): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            const delReq = store.delete(key)
            delReq.onsuccess = () => resolve()
            delReq.onerror = () => reject(delReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}

// --- CATALOG LIBRARY HELPERS (LOCAL + CLOUD) ---

const getFolderMap = (): Record<string, { folder_id: string; folder_name: string }> => {
    const local = localStorage.getItem('minion_catalog_folders_map')
    if (local) {
        try { return JSON.parse(local) } catch (e) {}
    }
    return {}
}

export const getCatalogLibrary = (): CatalogMetadata[] => {
    const local = localStorage.getItem('minion_catalog_library')
    if (local) {
        try {
            const list = JSON.parse(local) as CatalogMetadata[]
            if (Array.isArray(list)) return list
        } catch (e) {
            console.error(e)
        }
    }
    return []
}

export const fetchMergedCatalogLibrary = async (): Promise<CatalogMetadata[]> => {
    const localList = getCatalogLibrary()
    const cloudCatalogs = await db.getCatalogsFromCloud()
    const folderMap = getFolderMap()

    const map = new Map<string, CatalogMetadata>()

    if (cloudCatalogs && cloudCatalogs.length > 0) {
        // Cloud is active: populate with cloud catalogs as source of truth
        cloudCatalogs.forEach(c => {
            map.set(c.id, {
                id: c.id,
                name: c.name,
                filename: c.filename,
                folder_id: (c as any).folder_id,
                folder_name: (c as any).folder_name,
                pdf_url: c.pdf_url,
                size: c.size,
                uploadDate: new Date(c.updated_at).toLocaleDateString()
            })
        })
    } else {
        // Local mode
        localList.forEach(c => map.set(c.id, c))
    }

    // Apply local folder overrides & perform deduplication
    const finalItems: CatalogMetadata[] = []
    const seenNames = new Set<string>()

    for (const item of map.values()) {
        const override = folderMap[item.id]
        const finalItem = override
            ? { ...item, folder_id: override.folder_id, folder_name: override.folder_name }
            : item

        const normKey = `${(finalItem.name || '').toLowerCase().trim()}::${(finalItem.filename || '').toLowerCase().trim()}`
        if (!seenNames.has(normKey)) {
            seenNames.add(normKey)
            finalItems.push(finalItem)
        }
    }

    localStorage.setItem('minion_catalog_library', JSON.stringify(finalItems))
    return finalItems
}

export const addCatalogToLibrary = async (file: File, customName?: string, targetId?: string, folderId?: string, folderName?: string): Promise<CatalogMetadata> => {
    const id = targetId || `catalog_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const catalogName = customName || file.name.replace(/\.pdf$/i, '')

    if (folderId && folderName) {
        const folderMap = getFolderMap()
        folderMap[id] = { folder_id: folderId, folder_name: folderName }
        localStorage.setItem('minion_catalog_folders_map', JSON.stringify(folderMap))
    }

    // 1. Upload to Supabase Cloud if active
    const cloudRes = await db.uploadCatalogToCloud(id, catalogName, file, folderId, folderName)

    const meta: CatalogMetadata = {
        id,
        name: catalogName,
        filename: file.name,
        folder_id: folderId,
        folder_name: folderName,
        size: file.size,
        pdf_url: cloudRes.pdfUrl,
        uploadDate: new Date().toLocaleDateString()
    }

    // 2. Save blob to IndexedDB under catalog id (for fast local caching)
    await savePdfToIndexedDb(file, id)

    // 3. Save catalog metadata list locally
    const currentList = getCatalogLibrary()
    const updated = [meta, ...currentList.filter(c => c.id !== id)]
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))

    return meta
}

export const updateCatalogFolderInLibrary = async (catalogId: string, folderId: string, folderName: string): Promise<CatalogMetadata[]> => {
    // 1. Persist in local folder map override
    const folderMap = getFolderMap()
    folderMap[catalogId] = { folder_id: folderId, folder_name: folderName }
    localStorage.setItem('minion_catalog_folders_map', JSON.stringify(folderMap))

    // 2. Update local catalog library array
    const currentList = getCatalogLibrary()
    const updated = currentList.map(c => {
        if (c.id === catalogId) {
            return { ...c, folder_id: folderId, folder_name: folderName }
        }
        return c
    })
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))

    // 3. Sync to Supabase cloud table if active
    await db.updateCatalogFolderInCloud(catalogId, folderId, folderName)

    return updated
}

export const loadCatalogPdfBlob = async (catId: string, pdfUrl?: string): Promise<string | null> => {
    // 1. Try local IndexedDB blob first (Instant 0.05s load, zero network latency!)
    try {
        const localBlob = await getPdfFromIndexedDb(catId)
        if (localBlob && localBlob.size > 0) {
            return URL.createObjectURL(localBlob)
        }
    } catch (e) {
        console.warn('IndexedDB read warning:', e)
    }

    // 2. Fetch from Cloud URL & save to IndexedDB in background
    if (pdfUrl) {
        try {
            const response = await fetch(pdfUrl)
            if (response.ok) {
                const blob = await response.blob()
                savePdfToIndexedDb(blob, catId).catch(err => console.warn('Background cache error:', err))
                return URL.createObjectURL(blob)
            }
        } catch (e) {
            console.error('Fetch cloud PDF failed:', e)
        }
    }

    return null
}

export const removeCatalogFromLibrary = async (catalogId: string): Promise<void> => {
    await db.deleteCatalogFromCloud(catalogId)
    await clearPdfFromIndexedDb(catalogId)

    const folderMap = getFolderMap()
    delete folderMap[catalogId]
    localStorage.setItem('minion_catalog_folders_map', JSON.stringify(folderMap))

    const currentList = getCatalogLibrary()
    const updated = currentList.filter(c => c.id !== catalogId)
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))
}
