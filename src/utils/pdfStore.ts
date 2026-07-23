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

export const getCatalogLibrary = (): CatalogMetadata[] => {
    const local = localStorage.getItem('minion_catalog_library')
    if (local) {
        try {
            const list = JSON.parse(local) as CatalogMetadata[]
            if (Array.isArray(list) && list.length > 0) return list
        } catch (e) {
            console.error(e)
        }
    }
    return [DEFAULT_CATALOG]
}

export const fetchMergedCatalogLibrary = async (): Promise<CatalogMetadata[]> => {
    const localList = getCatalogLibrary()
    const cloudCatalogs = await db.getCatalogsFromCloud()

    if (cloudCatalogs && cloudCatalogs.length > 0) {
        const cloudMetas: CatalogMetadata[] = cloudCatalogs.map(c => ({
            id: c.id,
            name: c.name,
            filename: c.filename,
            pdf_url: c.pdf_url,
            size: c.size,
            uploadDate: new Date(c.updated_at).toLocaleDateString()
        }))

        // Merge cloud catalogs with default sample catalog
        const map = new Map<string, CatalogMetadata>()
        map.set(DEFAULT_CATALOG.id, DEFAULT_CATALOG)
        cloudMetas.forEach(c => map.set(c.id, c))
        localList.forEach(c => { if (!map.has(c.id)) map.set(c.id, c) })

        const merged = Array.from(map.values())
        localStorage.setItem('minion_catalog_library', JSON.stringify(merged))
        return merged
    }

    return localList
}

export const addCatalogToLibrary = async (file: File, customName?: string, targetId?: string): Promise<CatalogMetadata> => {
    const id = targetId || `catalog_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const catalogName = customName || file.name.replace(/\.pdf$/i, '')

    // 1. Upload to Supabase Cloud if active
    const cloudRes = await db.uploadCatalogToCloud(id, catalogName, file)

    const meta: CatalogMetadata = {
        id,
        name: catalogName,
        filename: file.name,
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

export const removeCatalogFromLibrary = async (catalogId: string): Promise<void> => {
    if (catalogId === DEFAULT_CATALOG.id) return

    await db.deleteCatalogFromCloud(catalogId)
    await clearPdfFromIndexedDb(catalogId)

    const currentList = getCatalogLibrary()
    const updated = currentList.filter(c => c.id !== catalogId)
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))
}
