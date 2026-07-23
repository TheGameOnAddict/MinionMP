// IndexedDB storage service for multiple local PDF catalogs
const dbName = 'MinionPdfStore'
const storeName = 'pdf_blobs'
const defaultKey = 'current_pdf'

export interface CatalogMetadata {
    id: string
    name: string
    filename: string
    size: number
    uploadDate: string
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

// --- CATALOG LIBRARY HELPERS ---

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

export const addCatalogToLibrary = async (file: File, customName?: string): Promise<CatalogMetadata> => {
    const id = `catalog_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const meta: CatalogMetadata = {
        id,
        name: customName || file.name.replace(/\.pdf$/i, ''),
        filename: file.name,
        size: file.size,
        uploadDate: new Date().toLocaleDateString()
    }

    // Save blob to IndexedDB under catalog id
    await savePdfToIndexedDb(file, id)

    // Save catalog metadata list
    const currentList = getCatalogLibrary()
    const updated = [meta, ...currentList.filter(c => c.id !== id)]
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))

    return meta
}

export const removeCatalogFromLibrary = async (catalogId: string): Promise<void> => {
    if (catalogId === DEFAULT_CATALOG.id) return

    await clearPdfFromIndexedDb(catalogId)
    const currentList = getCatalogLibrary()
    const updated = currentList.filter(c => c.id !== catalogId)
    localStorage.setItem('minion_catalog_library', JSON.stringify(updated))
}
