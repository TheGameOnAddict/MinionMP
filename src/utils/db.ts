import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface RequestLineItem {
    id: string
    raw: string
    part_number: string
    nomenclature: string
    qty: string | number
    original_qty: string | number
    qtyUnit?: string
    group: string
    status: string // New, Picked, Partial Stock, On Order, Fulfilled, Canceled
    filled_qty?: string | number
    requested_changes?: string
}

export interface PartsRequest {
    id: string
    mechanic: string
    tail: string
    discrepancy: string
    status: string // New, Processing, Ready, Picked, etc.
    items: RequestLineItem[]
    timestamp: string
    notes?: string
}

export interface PDFAnnotation {
    type: 'rect' | 'circle' | 'pen' | 'text' | 'part_box'
    id: string
    pageNumber: number
    color: string
    thickness?: number
    points?: { x: number; y: number }[] // For pen drawing
    // Bounding box for rect, circle, text, part_box
    x?: number
    y?: number
    width?: number
    height?: number
    text?: string // For notes/sticky text or part_box part number
    nomenclature?: string // For part_box nomenclature
    qty?: string | number // For part_box qty
}

export interface InventoryItem {
    part_number: string
    nomenclature?: string
    qty_available: number
    location?: string
    unit?: string
    updated_at?: string
}

export interface PartImage {
    id?: number
    part_number: string
    image_url: string
    created_at?: string
}

export interface ShopOrder {
    id: string
    title: string
    tail?: string
    mechanic?: string
    status: string
    created_at?: string
}

class DbService {
    private supabase: SupabaseClient | null = null
    private url: string | null = null
    private key: string | null = null
    private isCloud = false

    constructor() {
        this.initialize()
    }

    public initialize() {
        const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL
        const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY

        this.url = localStorage.getItem('minion_supabase_url') || (envUrl && envUrl !== 'https://your-project-id.supabase.co' ? envUrl : null)
        this.key = localStorage.getItem('minion_supabase_key') || (envKey && envKey !== 'your-anon-public-key-here' ? envKey : null)

        if (this.url && this.key) {
            try {
                this.supabase = createClient(this.url, this.key)
                this.isCloud = true
                console.log('MinionMP: Supabase connected successfully.')
            } catch (err) {
                console.error('MinionMP: Failed to connect to Supabase, falling back to Local Storage.', err)
                this.supabase = null
                this.isCloud = false
            }
        } else {
            this.supabase = null
            this.isCloud = false
            console.log('MinionMP: Operating in Local Mode (localStorage).')
        }
    }

    public getConfig() {
        return {
            url: this.url || '',
            key: this.key || '',
            isCloud: this.isCloud
        }
    }

    public setConfig(url: string, key: string) {
        if (url.trim() && key.trim()) {
            localStorage.setItem('minion_supabase_url', url.trim())
            localStorage.setItem('minion_supabase_key', key.trim())
        } else {
            localStorage.removeItem('minion_supabase_url')
            localStorage.removeItem('minion_supabase_key')
        }
        this.initialize()
    }

    // --- REQUESTS CRUD ---

    public async getRequests(): Promise<PartsRequest[]> {
        if (this.isCloud && this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('minion_requests')
                    .select('*')
                    .order('timestamp', { ascending: false })

                if (error) throw error
                return (data || []).map(row => ({
                    id: row.id,
                    mechanic: row.mechanic,
                    tail: row.tail,
                    discrepancy: row.discrepancy,
                    status: row.status,
                    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
                    timestamp: row.timestamp,
                    notes: row.notes || ''
                }))
            } catch (e) {
                console.error('Supabase getRequests failed, falling back to localStorage:', e)
            }
        }

        // Local Fallback
        const localData = localStorage.getItem('minion_requests')
        if (localData) {
            try {
                const reqs = JSON.parse(localData) as PartsRequest[]
                // sort desc
                return reqs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            } catch (e) {
                console.error(e)
            }
        }
        return []
    }

    public async saveRequest(req: Omit<PartsRequest, 'timestamp'> & { timestamp?: string }): Promise<{ success: boolean; id: string }> {
        const fullReq: PartsRequest = {
            ...req,
            timestamp: req.timestamp || new Date().toISOString()
        }

        if (this.isCloud && this.supabase) {
            try {
                const payload: any = {
                    id: fullReq.id,
                    mechanic: fullReq.mechanic,
                    tail: fullReq.tail,
                    discrepancy: fullReq.discrepancy,
                    status: fullReq.status,
                    items: fullReq.items
                }
                if (fullReq.notes) {
                    payload.notes = fullReq.notes
                }

                let { error } = await this.supabase
                    .from('minion_requests')
                    .insert(payload)

                // Fallback if 'notes' column doesn't exist on live Supabase table yet
                if (error && payload.notes) {
                    console.warn('Retrying Supabase insert without notes column:', error)
                    delete payload.notes
                    const retry = await this.supabase.from('minion_requests').insert(payload)
                    error = retry.error
                }

                if (error) throw error

                // Local Storage Backup Sync
                const localData = localStorage.getItem('minion_requests')
                const list: PartsRequest[] = localData ? JSON.parse(localData) : []
                if (!list.some(r => r.id === fullReq.id)) {
                    list.unshift(fullReq)
                    localStorage.setItem('minion_requests', JSON.stringify(list))
                }

                this.triggerLocalUpdate('requests')
                return { success: true, id: fullReq.id }
            } catch (e) {
                console.error('Supabase saveRequest failed, saving to localStorage fallback:', e)
            }
        }

        // Local Storage
        const requests = await this.getRequests()
        requests.unshift(fullReq)
        localStorage.setItem('minion_requests', JSON.stringify(requests))
        this.triggerLocalUpdate('requests')
        return { success: true, id: fullReq.id }
    }

    public async updateRequestStatus(requestId: string, status: string): Promise<boolean> {
        if (this.isCloud && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('minion_requests')
                    .update({ status })
                    .eq('id', requestId)

                if (error) throw error
                this.triggerLocalUpdate('requests')
                return true
            } catch (e) {
                console.error('Supabase updateRequestStatus failed:', e)
            }
        }

        // Local Storage
        const requests = await this.getRequests()
        const index = requests.findIndex(r => r.id === requestId)
        if (index !== -1) {
            requests[index].status = status
            localStorage.setItem('minion_requests', JSON.stringify(requests))
            this.triggerLocalUpdate('requests')
            return true
        }
        return false
    }

    public async updateRequest(req: PartsRequest): Promise<boolean> {
        if (this.isCloud && this.supabase) {
            try {
                const payload: any = {
                    mechanic: req.mechanic,
                    tail: req.tail,
                    discrepancy: req.discrepancy,
                    status: req.status,
                    items: req.items
                }
                if (req.notes !== undefined) {
                    payload.notes = req.notes
                }

                let { error } = await this.supabase
                    .from('minion_requests')
                    .update(payload)
                    .eq('id', req.id)

                if (error && payload.notes !== undefined) {
                    delete payload.notes
                    const retry = await this.supabase.from('minion_requests').update(payload).eq('id', req.id)
                    error = retry.error
                }

                if (error) throw error

                // Local Storage backup
                const localData = localStorage.getItem('minion_requests')
                if (localData) {
                    try {
                        const requests = JSON.parse(localData) as PartsRequest[]
                        const idx = requests.findIndex(r => r.id === req.id)
                        if (idx !== -1) {
                            requests[idx] = req
                            localStorage.setItem('minion_requests', JSON.stringify(requests))
                        }
                    } catch (e) {}
                }

                this.triggerLocalUpdate('requests')
                return true
            } catch (e) {
                console.error('Supabase updateRequest failed:', e)
            }
        }

        // Local Storage
        const requests = await this.getRequests()
        const index = requests.findIndex(r => r.id === req.id)
        if (index !== -1) {
            requests[index] = req
            localStorage.setItem('minion_requests', JSON.stringify(requests))
            this.triggerLocalUpdate('requests')
            return true
        }
        return false
    }

    /**
     * Finds the request containing a line item and updates that line item
     */
    public async updateLineItem(lineId: string, updater: (item: RequestLineItem) => RequestLineItem): Promise<boolean> {
        const requests = await this.getRequests()
        let foundReq: PartsRequest | null = null

        for (const req of requests) {
            const itemIdx = req.items.findIndex(i => i.id === lineId)
            if (itemIdx !== -1) {
                req.items[itemIdx] = updater(req.items[itemIdx])
                foundReq = req
                break
            }
        }

        if (foundReq) {
            return this.updateRequest(foundReq)
        }
        return false
    }

    // --- ANNOTATIONS CRUD ---

    public async getAnnotations(pdfId: string, pageNumber: number): Promise<PDFAnnotation[]> {
        if (this.isCloud && this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('minion_annotations')
                    .select('shapes, notes')
                    .eq('pdf_id', pdfId)
                    .eq('page_number', pageNumber)
                    .maybeSingle()

                if (error) throw error
                if (data) {
                    const shapes = typeof data.shapes === 'string' ? JSON.parse(data.shapes) : data.shapes
                    const notes = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes
                    return [...(shapes || []), ...(notes || [])]
                }
            } catch (e) {
                console.error('Supabase getAnnotations failed, fallback to local:', e)
            }
        }

        // Local fallback
        const localKey = `minion_anno_${pdfId}_${pageNumber}`
        const localData = localStorage.getItem(localKey)
        if (localData) {
            try {
                return JSON.parse(localData) as PDFAnnotation[]
            } catch (e) {
                console.error(e)
            }
        }
        return []
    }

    public async saveAnnotations(pdfId: string, pageNumber: number, annotations: PDFAnnotation[]): Promise<boolean> {
        const shapes = annotations.filter(a => a.type !== 'text')
        const notes = annotations.filter(a => a.type === 'text')

        if (this.isCloud && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('minion_annotations')
                    .upsert({
                        pdf_id: pdfId,
                        page_number: pageNumber,
                        shapes,
                        notes,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'pdf_id,page_number'
                    })

                if (error) throw error
                this.triggerLocalUpdate('annotations')
                return true
            } catch (e) {
                console.error('Supabase saveAnnotations failed, fallback to local:', e)
            }
        }

        // Local fallback
        const localKey = `minion_anno_${pdfId}_${pageNumber}`
        localStorage.setItem(localKey, JSON.stringify(annotations))
        this.triggerLocalUpdate('annotations')
        return true
    }

    // --- REALTIME SUBSCRIPTIONS ---

    public subscribeToRequests(callback: () => void): () => void {
        const unsubscribers: Array<() => void> = []

        if (this.isCloud && this.supabase) {
            const channel = this.supabase
                .channel('realtime:minion_requests')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'minion_requests' }, () => {
                    callback()
                })
                .subscribe()

            unsubscribers.push(() => {
                this.supabase?.removeChannel(channel)
            })
        }

        // Local event listener ALWAYS enabled for instant local updates across tabs/components
        const handleLocalChange = (e: Event) => {
            if ((e as CustomEvent).detail?.type === 'requests') {
                callback()
            }
        }
        window.addEventListener('minion_db_update', handleLocalChange)
        unsubscribers.push(() => {
            window.removeEventListener('minion_db_update', handleLocalChange)
        })

        return () => {
            unsubscribers.forEach(unsub => unsub())
        }
    }

    public subscribeToAnnotations(callback: () => void): () => void {
        if (this.isCloud && this.supabase) {
            const channel = this.supabase
                .channel('realtime:minion_annotations')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'minion_annotations' }, () => {
                    callback()
                })
                .subscribe()

            return () => {
                this.supabase?.removeChannel(channel)
            }
        }

        const handleLocalChange = (e: Event) => {
            if ((e as CustomEvent).detail?.type === 'annotations') {
                callback()
            }
        }
        window.addEventListener('minion_db_update', handleLocalChange)
        return () => {
            window.removeEventListener('minion_db_update', handleLocalChange)
        }
    }

    public async renamePdfId(oldId: string, newId: string): Promise<boolean> {
        if (this.isCloud && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('minion_annotations')
                    .update({ pdf_id: newId })
                    .eq('pdf_id', oldId)

                if (error) throw error
                this.triggerLocalUpdate('annotations')
                return true
            } catch (e) {
                console.error('Supabase renamePdfId failed:', e)
            }
        }
        return false
    }

    public async deleteAnnotationsForPdf(pdfId: string): Promise<boolean> {
        if (this.isCloud && this.supabase) {
            try {
                const { error } = await this.supabase
                    .from('minion_annotations')
                    .delete()
                    .eq('pdf_id', pdfId)

                if (error) throw error
                this.triggerLocalUpdate('annotations')
                return true
            } catch (e) {
                console.error('Supabase deleteAnnotationsForPdf failed:', e)
            }
        }
        return false
    }

    private triggerLocalUpdate(type: 'requests' | 'annotations' = 'requests') {
        const event = new CustomEvent('minion_db_update', { detail: { type } })
        window.dispatchEvent(event)
    }

    // --- DATABASE BACKUP / IMPORT / EXPORT ---

    public async exportDbJson(): Promise<string> {
        const requests = await this.getRequests()
        
        // Grab all annotations from localStorage since we don't dump all Supabase ones here (but we can bundle localStorage ones)
        const annotations: Record<string, any> = {}
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith('minion_anno_')) {
                const data = localStorage.getItem(key)
                if (data) {
                    annotations[key] = JSON.parse(data)
                }
            }
        }

        const payload = {
            version: 'minionmp-0.0.1',
            timestamp: new Date().toISOString(),
            requests,
            annotations
        }

        return JSON.stringify(payload, null, 2)
    }

    public async importDbJson(jsonString: string): Promise<boolean> {
        try {
            const payload = JSON.parse(jsonString)
            if (!payload || payload.version !== 'minionmp-0.0.1') {
                alert('Invalid database backup file.')
                return false
            }

            // Save requests
            if (Array.isArray(payload.requests)) {
                if (this.isCloud && this.supabase) {
                    for (const req of payload.requests) {
                        await this.supabase.from('minion_requests').upsert({
                            id: req.id,
                            mechanic: req.mechanic,
                            tail: req.tail,
                            discrepancy: req.discrepancy,
                            status: req.status,
                            items: req.items,
                            timestamp: req.timestamp
                        })
                    }
                } else {
                    localStorage.setItem('minion_requests', JSON.stringify(payload.requests))
                }
            }

            // Save annotations
            if (payload.annotations && typeof payload.annotations === 'object') {
                for (const [key, list] of Object.entries(payload.annotations)) {
                    if (this.isCloud && this.supabase) {
                        // key is e.g. minion_anno_filename_5
                        const parts = key.split('_')
                        const pageNumber = parseInt(parts.pop() || '0', 10)
                        const pdfId = parts.slice(2).join('_')
                        if (pdfId && pageNumber > 0 && Array.isArray(list)) {
                            const shapes = list.filter((a: any) => a.type !== 'text')
                            const notes = list.filter((a: any) => a.type === 'text')
                            await this.supabase.from('minion_annotations').upsert({
                                pdf_id: pdfId,
                                page_number: pageNumber,
                                shapes,
                                notes,
                                updated_at: new Date().toISOString()
                            }, {
                                onConflict: 'pdf_id,page_number'
                            })
                        }
                    } else {
                        localStorage.setItem(key, JSON.stringify(list))
                    }
                }
            }

            this.triggerLocalUpdate('requests')
            this.triggerLocalUpdate('annotations')
            return true
        } catch (e) {
            console.error('Import failed:', e)
            return false
        }
    }

    // --- CLOUD CATALOGS CRUD & STORAGE ---

    public async getCatalogsFromCloud(): Promise<Array<{ id: string; name: string; filename: string; pdf_url: string; size: number; updated_at: string }> | null> {
        if (this.isCloud && this.supabase) {
            try {
                const { data, error } = await this.supabase
                    .from('minion_catalogs')
                    .select('*')
                    .order('updated_at', { ascending: false })

                if (error) throw error
                return data || []
            } catch (e) {
                console.error('Supabase getCatalogs failed:', e)
            }
        }
        return null
    }

    public async uploadCatalogToCloud(catalogId: string, catalogName: string, file: File): Promise<{ success: boolean; pdfUrl?: string }> {
        if (this.isCloud && this.supabase) {
            try {
                // 1. Delete any existing storage file for this catalog (handles path changes between versions)
                const { data: existingRow } = await this.supabase
                    .from('minion_catalogs')
                    .select('pdf_url')
                    .eq('id', catalogId)
                    .single()

                if (existingRow?.pdf_url) {
                    const match = existingRow.pdf_url.match(/\/storage\/v1\/object\/public\/catalogs\/(.+?)(?:\?|#|$)/)
                    if (match?.[1]) {
                        const oldPath = decodeURIComponent(match[1])
                        console.log('Removing old storage file before update:', oldPath)
                        await this.supabase.storage.from('catalogs').remove([oldPath])
                    }
                }

                // 2. Upload PDF file to a stable path: <catalogId>.pdf
                const cleanId = catalogId.replace(/[^a-zA-Z0-9._-]/g, '_')
                const storagePath = `${cleanId}.pdf`

                const { error: uploadError } = await this.supabase.storage
                    .from('catalogs')
                    .upload(storagePath, file, { upsert: true })

                if (uploadError) {
                    console.warn('Storage bucket upload warning:', uploadError)
                }

                // 3. Get public URL
                const { data: urlData } = this.supabase.storage
                    .from('catalogs')
                    .getPublicUrl(storagePath)

                const pdfUrl = urlData?.publicUrl || ''

                // 4. Upsert metadata in minion_catalogs table
                const { error: dbError } = await this.supabase
                    .from('minion_catalogs')
                    .upsert({
                        id: catalogId,
                        name: catalogName,
                        filename: file.name,
                        pdf_url: pdfUrl,
                        size: file.size,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'id'
                    })

                if (dbError) throw dbError
                this.triggerLocalUpdate('requests')
                return { success: true, pdfUrl }
            } catch (e) {
                console.error('Supabase uploadCatalogToCloud failed:', e)
            }
        }
        return { success: false }
    }

    public async deleteCatalogFromCloud(catalogId: string): Promise<boolean> {
        if (this.isCloud && this.supabase) {
            try {
                // 1. Look up the catalog row to get pdf_url (contains the storage path)
                const { data: catRow } = await this.supabase
                    .from('minion_catalogs')
                    .select('pdf_url')
                    .eq('id', catalogId)
                    .single()

                // 2. Extract storage path from the public URL and delete the physical file
                if (catRow?.pdf_url) {
                    // Public URL looks like: https://xxx.supabase.co/storage/v1/object/public/catalogs/some/path.pdf
                    // We need just the path after /catalogs/
                    const match = catRow.pdf_url.match(/\/storage\/v1\/object\/public\/catalogs\/(.+?)(?:\?|#|$)/)
                    if (match?.[1]) {
                        const storagePath = decodeURIComponent(match[1])
                        console.log('Deleting storage file:', storagePath)
                        const { error: removeErr } = await this.supabase.storage
                            .from('catalogs')
                            .remove([storagePath])
                        if (removeErr) console.warn('Storage delete warning:', removeErr)
                    }
                }

                // 3. Delete metadata row from minion_catalogs table
                const { error } = await this.supabase
                    .from('minion_catalogs')
                    .delete()
                    .eq('id', catalogId)

                if (error) throw error
                this.triggerLocalUpdate('requests')
                return true
            } catch (e) {
                console.error('Supabase deleteCatalogFromCloud failed:', e)
            }
        }
        return false
    }

    public subscribeToCatalogs(callback: () => void): () => void {
        if (this.isCloud && this.supabase) {
            const channel = this.supabase
                .channel('realtime:minion_catalogs')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'minion_catalogs' }, () => {
                    callback()
                })
                .subscribe()

            return () => {
                this.supabase?.removeChannel(channel)
            }
        }
        return () => {}
    }
}

export const db = new DbService()
