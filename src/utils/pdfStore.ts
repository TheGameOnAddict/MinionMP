// IndexedDB storage service for local PDF files to persist across refreshes
const dbName = 'MinionPdfStore'
const storeName = 'pdf_blobs'
const keyName = 'current_pdf'

export const savePdfToIndexedDb = (file: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName)
        }
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            const putReq = store.put(file, keyName)
            putReq.onsuccess = () => resolve()
            putReq.onerror = () => reject(putReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}

export const getPdfFromIndexedDb = (): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName)
        }
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readonly')
            const store = transaction.objectStore(storeName)
            const getReq = store.get(keyName)
            getReq.onsuccess = () => resolve(getReq.result || null)
            getReq.onerror = () => reject(getReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}

export const clearPdfFromIndexedDb = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1)
        request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(storeName, 'readwrite')
            const store = transaction.objectStore(storeName)
            const delReq = store.delete(keyName)
            delReq.onsuccess = () => resolve()
            delReq.onerror = () => reject(delReq.error)
        }
        request.onerror = () => reject(request.error)
    })
}
