import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Search, RefreshCw, FolderOpen, ChevronDown, ChevronRight,
    Check, XCircle, Timer, FileDown,
    Settings2, X, Download, Upload, ArrowLeft, Info, HelpCircle,
    BookOpen, Plus, Printer, MessageSquare, Edit3
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { playDing } from '../utils/sound'
import { computeOrderStatus } from '../utils/orderStatus'
import { db } from '../utils/db'

export default function PartsDashboard() {
    const navigate = useNavigate()

    const [filter, setFilter] = useState('All')
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [dbConfig] = useState(db.getConfig())
    const [expandedRow, setExpandedRow] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [dashInterval, setDashInterval] = useState(5000)

    // Feature Parity States
    const [addingLineToReqId, setAddingLineToReqId] = useState<string | null>(null)
    const [newLinePartNum, setNewLinePartNum] = useState('')
    const [newLineNomenclature, setNewLineNomenclature] = useState('')
    const [newLineQty, setNewLineQty] = useState('1')
    const [newLineGroup, setNewLineGroup] = useState('')

    const [editingNotesReqId, setEditingNotesReqId] = useState<string | null>(null)
    const [editingNotesText, setEditingNotesText] = useState('')

    const [printTicketReq, setPrintTicketReq] = useState<any | null>(null)

    // Settings / Backup modals state
    const [showSettingsMenu, setShowSettingsMenu] = useState(false)
    const [showBackupModal, setShowBackupModal] = useState(false)
    const [showSqlSetupModal, setShowSqlSetupModal] = useState(false)
    const settingsMenuRef = useRef<HTMLDivElement>(null)

    // Toast feedback state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    // Tracking refs for sound alert on new orders
    const isFirstFetchRef = useRef(true)
    const knownOrderIdsRef = useRef<Set<string>>(new Set())

    const fetchRequests = async () => {
        setLoading(true)
        try {
            const reqs = await db.getRequests()
            const formatted = reqs.map(req => ({
                id: req.id,
                mechanic: req.mechanic,
                tail: req.tail,
                discrepancy: req.discrepancy,
                notes: req.notes || '',
                order_status_raw: req.status,
                time: new Date(req.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: req.timestamp,
                items: req.items,
                status: computeOrderStatus(req.items, req.status)
            }))

            // Play ding ONLY if a new order populates on the dashboard after initial load
            if (!isFirstFetchRef.current) {
                const hasNewOrder = formatted.some(r => !knownOrderIdsRef.current.has(r.id))
                if (hasNewOrder) {
                    playDing()
                }
            } else {
                isFirstFetchRef.current = false
            }

            knownOrderIdsRef.current = new Set(formatted.map(r => r.id))
            setRequests(formatted)
        } catch (e) {
            console.error(e)
            showToast('Failed to fetch requests', 'error')
        }
        setLoading(false)
    }

    // Dynamic Excel Export client-side
    const handleExport = async () => {
        setExporting(true)
        try {
            const workbook = new ExcelJS.Workbook()
            const sheet = workbook.addWorksheet('Parts Requests')

            sheet.columns = [
                { header: 'Request ID', key: 'id', width: 22 },
                { header: 'Mechanic', key: 'mechanic', width: 18 },
                { header: 'Tail Number', key: 'tail', width: 12 },
                { header: 'Discrepancy', key: 'discrepancy', width: 15 },
                { header: 'Order Status', key: 'status', width: 15 },
                { header: 'Time Received', key: 'time', width: 15 },
                { header: 'Part Number', key: 'part_number', width: 20 },
                { header: 'Nomenclature', key: 'nomenclature', width: 30 },
                { header: 'Qty Requested', key: 'qty', width: 15 },
                { header: 'Qty Filled', key: 'filled_qty', width: 15 },
                { header: 'Line Status', key: 'line_status', width: 15 },
                { header: 'Index/Group', key: 'group', width: 15 }
            ]

            // Format header row style
            sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
            sheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1F2937' } // Gray-800
            }

            filteredRequests.forEach(req => {
                req.items.forEach((item: any) => {
                    sheet.addRow({
                        id: req.id,
                        mechanic: req.mechanic,
                        tail: req.tail,
                        discrepancy: req.discrepancy,
                        status: req.status,
                        time: req.time,
                        part_number: item.part_number,
                        nomenclature: item.nomenclature,
                        qty: item.qty,
                        filled_qty: item.filled_qty || 0,
                        line_status: item.status,
                        group: item.group
                    })
                })
            })

            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Parts_Requests_Export_${new Date().toISOString().slice(0, 10)}.xlsx`
            a.click()
            window.URL.revokeObjectURL(url)
            showToast('Excel report downloaded successfully')
        } catch (e) {
            console.error('Export failed:', e)
            showToast('Excel export failed', 'error')
        }
        setExporting(false)
    }

    // JSON Database Backup Operations
    const handleExportBackup = async () => {
        try {
            const dataStr = await db.exportDbJson()
            const blob = new Blob([dataStr], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `MinionMP_DB_Backup_${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            showToast('Database backup downloaded')
        } catch (e) {
            console.error(e)
            showToast('Backup failed', 'error')
        }
    }

    const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            const content = event.target?.result as string
            const success = await db.importDbJson(content)
            if (success) {
                showToast('Database imported successfully!')
                fetchRequests()
                setShowBackupModal(false)
            } else {
                showToast('Database import failed', 'error')
            }
        }
        reader.readAsText(file)
    }

    const handleStatusChange = async (requestId: string, newStatus: string) => {
        const success = await db.updateRequestStatus(requestId, newStatus)
        if (success) {
            setRequests(prev => prev.map(r =>
                r.id === requestId ? { ...r, status: newStatus } : r
            ))
            showToast('Order status updated')
        }
    }

    const handleLineQtyChange = async (lineId: string, newQty: string) => {
        const success = await db.updateLineItem(lineId, item => ({
            ...item,
            qty: newQty
        }))
        if (success) fetchRequests()
    }

    const handleLineFilledQtyChange = async (lineId: string, filledQty: string) => {
        const success = await db.updateLineItem(lineId, item => {
            const filled = parseFloat(filledQty)
            const requested = parseFloat(String(item.qty))
            let newStatus = item.status
            if (!isNaN(filled) && !isNaN(requested)) {
                newStatus = filled < requested ? 'Partial Stock' : 'Picked'
            }
            return {
                ...item,
                filled_qty: filledQty,
                status: newStatus
            }
        })
        if (success) fetchRequests()
    }

    const handlePickLine = async (lineId: string, qty: string | number) => {
        const success = await db.updateLineItem(lineId, item => ({
            ...item,
            filled_qty: String(qty),
            status: 'Picked'
        }))
        if (success) fetchRequests()
    }

    const handleLineStatusChange = async (lineId: string, newStatus: string) => {
        const success = await db.updateLineItem(lineId, item => ({
            ...item,
            status: newStatus
        }))
        if (success) fetchRequests()
    }

    const handleMarkAllLines = async (requestId: string, newStatus: string) => {
        const req = requests.find(r => r.id === requestId)
        if (!req) return

        const updatedItems = req.items.map((item: any) => ({
            ...item,
            status: newStatus,
            filled_qty: newStatus === 'Fulfilled' ? item.qty : item.filled_qty
        }))

        const success = await db.updateRequest({
            ...req,
            status: newStatus,
            items: updatedItems
        })

        if (success) {
            fetchRequests()
            showToast(`All items marked as ${newStatus}`)
        }
    }

    const handleApproveChange = async (item: any, requestId: string) => {
        const changes = item.requested_changes
        if (!changes) return

        let targetQty = item.qty
        let targetStatus = item.status

        if (changes.includes('Qty:')) {
            const match = changes.match(/Qty: (\d+(\.\d+)?)/)
            if (match) targetQty = match[1]
        }
        if (changes.includes('Cancel Line')) {
            targetStatus = 'Canceled'
        }

        const success = await db.updateLineItem(item.id, line => ({
            ...line,
            qty: targetQty,
            status: targetStatus,
            requested_changes: ''
        }))

        if (success) {
            // Reevaluate order level status
            const req = requests.find(r => r.id === requestId)
            if (req) {
                const freshItems = req.items.map((i: any) => i.id === item.id ? { ...i, qty: targetQty, status: targetStatus, requested_changes: '' } : i)
                const hasPending = freshItems.some((i: any) => i.requested_changes)
                let newStatus = req.status
                if (!hasPending) {
                    newStatus = computeOrderStatus(freshItems, undefined)
                }
                await db.updateRequest({
                    ...req,
                    status: newStatus,
                    items: freshItems
                })
            }
            fetchRequests()
            showToast('Changes approved')
        }
    }

    const handleDenyChange = async (item: any, requestId: string) => {
        const success = await db.updateLineItem(item.id, line => ({
            ...line,
            requested_changes: ''
        }))
        if (success) {
            // Reevaluate order level status
            const req = requests.find(r => r.id === requestId)
            if (req) {
                const freshItems = req.items.map((i: any) => i.id === item.id ? { ...i, requested_changes: '' } : i)
                const hasPending = freshItems.some((i: any) => i.requested_changes)
                let newStatus = req.status
                if (!hasPending) {
                    newStatus = computeOrderStatus(freshItems, undefined)
                }
                await db.updateRequest({
                    ...req,
                    status: newStatus,
                    items: freshItems
                })
            }
            fetchRequests()
            showToast('Changes denied')
        }
    }

    const handleFulfillPicked = async (requestId: string) => {
        const req = requests.find(r => r.id === requestId)
        if (!req) return

        const updatedItems = req.items.map((item: any) => {
            if (item.status === 'Picked') {
                return { ...item, status: 'Fulfilled' }
            }
            return item
        })

        const success = await db.updateRequest({
            ...req,
            status: computeOrderStatus(updatedItems, undefined),
            items: updatedItems
        })

        if (success) {
            fetchRequests()
            showToast('All Picked items Fulfilled')
        }
    }

    // Add extra part to an existing order
    const handleAddLineItemToOrder = async (requestId: string) => {
        if (!newLinePartNum.trim()) {
            showToast('Please enter a part number', 'error')
            return
        }
        const req = requests.find(r => r.id === requestId)
        if (!req) return

        const newItem = {
            id: `line-${Date.now()}`,
            raw: `Dashboard Added: ${newLinePartNum}`,
            part_number: newLinePartNum.toUpperCase().trim(),
            nomenclature: newLineNomenclature.trim() || 'Added by Parts Room',
            qty: newLineQty.trim() || '1',
            original_qty: newLineQty.trim() || '1',
            group: newLineGroup.trim() || 'Manual Add',
            status: 'New',
            filled_qty: ''
        }

        const updatedItems = [...(req.items || []), newItem]
        const success = await db.updateRequest({
            ...req,
            items: updatedItems,
            status: computeOrderStatus(updatedItems, undefined)
        })

        if (success) {
            setAddingLineToReqId(null)
            setNewLinePartNum('')
            setNewLineNomenclature('')
            setNewLineQty('1')
            setNewLineGroup('')
            fetchRequests()
            showToast(`Added part ${newItem.part_number} to order`)
        } else {
            showToast('Failed to add part to order', 'error')
        }
    }

    // Save order notes
    const handleSaveOrderNotes = async (requestId: string, newNotes: string) => {
        const req = requests.find(r => r.id === requestId)
        if (!req) return

        const success = await db.updateRequest({
            ...req,
            notes: newNotes
        })

        if (success) {
            setEditingNotesReqId(null)
            fetchRequests()
            showToast('Order notes updated')
        } else {
            showToast('Failed to update order notes', 'error')
        }
    }

    // DB setup subscriptions and settings
    useEffect(() => {
        fetchRequests()

        // Fetch settings from local storage
        const localSettings = localStorage.getItem('minion_settings')
        if (localSettings) {
            try {
                const settings = JSON.parse(localSettings)
                if (settings.dashInterval) setDashInterval(settings.dashInterval)
            } catch (e) {
                console.error(e)
            }
        }

        // Realtime Subscription
        const unsubscribe = db.subscribeToRequests(() => {
            fetchRequests()
        })
        return () => unsubscribe()
    }, [])

    // Polling backup timer (acts as fallback if offline/no supabase real-time)
    useEffect(() => {
        const timer = setInterval(fetchRequests, dashInterval)
        return () => clearInterval(timer)
    }, [dashInterval])

    // Close settings menu on outside click
    useEffect(() => {
        if (!showSettingsMenu) return
        const handler = (e: MouseEvent) => {
            if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
                setShowSettingsMenu(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [showSettingsMenu])

    const handleSaveSettings = (key: string, value: any) => {
        const localSettings = localStorage.getItem('minion_settings')
        const settings = localSettings ? JSON.parse(localSettings) : {}
        settings[key] = value
        localStorage.setItem('minion_settings', JSON.stringify(settings))
    }

    const filteredRequests = requests.filter(r => {
        const matchesFilter = filter === 'All' || r.status === filter
        const matchesSearch = !searchQuery ||
            r.mechanic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.tail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.id?.includes(searchQuery)
        return matchesFilter && matchesSearch
    })

    const statusColors: Record<string, string> = {
        'New': 'bg-green-600/20 text-green-405 border border-green-500/30',
        'Processing': 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
        'Picked': 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
        'Ready': 'bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse',
        'Partial Stock': 'bg-amber-600/20 text-amber-300 border border-amber-500/30',
        'Complete': 'bg-gray-600/30 text-gray-300 border border-gray-700/50',
        'Edit Request': 'bg-orange-700/30 text-orange-400 border border-orange-600/30',
        'Needs Attention': 'bg-orange-700/30 text-orange-400 border border-orange-600/30 animate-pulse',
        'On Order': 'bg-purple-700/30 text-purple-400 border border-purple-600/30',
        'Fulfilled': 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30',
        'Canceled': 'bg-red-600/20 text-red-400 border border-red-500/30',
    }

    const statusDotColors: Record<string, string> = {
        'New': 'bg-green-400',
        'Processing': 'bg-yellow-300',
        'Picked': 'bg-sky-300',
        'Ready': 'bg-sky-300',
        'Partial Stock': 'bg-amber-400',
        'Complete': 'bg-gray-400',
        'Edit Request': 'bg-orange-400',
        'Needs Attention': 'bg-orange-400',
        'On Order': 'bg-purple-400',
        'Fulfilled': 'bg-emerald-400',
        'Canceled': 'bg-red-400',
    }

    const allStatuses = ['New', 'Processing', 'On Order', 'Edit Request', 'Needs Attention', 'Ready', 'Fulfilled', 'Canceled', 'Complete']
    const lineStatuses = ['New', 'Picked', 'Partial Stock', 'On Order', 'Fulfilled', 'Canceled']

    const groupItemsByIndex = (items: any[]) => {
        const groups: Record<string, any[]> = {}
        const order: string[] = []
        for (const item of items) {
            const groupKey = item.group || 'Ungrouped'
            if (!groups[groupKey]) {
                groups[groupKey] = []
                order.push(groupKey)
            }
            groups[groupKey].push(item)
        }
        return { groups, order }
    }

    const sqlSetupCommand = `
-- COPY & PASTE IN SUPABASE SQL EDITOR TO UPDATE OR CREATE TABLES:

-- Add notes column if table already exists:
ALTER TABLE minion_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Create table if creating from scratch:
CREATE TABLE IF NOT EXISTS minion_requests (
    id TEXT PRIMARY KEY,
    mechanic TEXT NOT NULL,
    tail TEXT NOT NULL,
    discrepancy TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    items JSONB NOT NULL DEFAULT '[]',
    notes TEXT DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE minion_annotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pdf_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    shapes JSONB NOT NULL DEFAULT '[]',
    notes JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(pdf_id, page_number)
);

-- Enable Realtime for both tables
alter publication supabase_realtime add table minion_requests;
alter publication supabase_realtime add table minion_annotations;
    `.trim()

    return (
        <div className="h-screen bg-gray-950 text-gray-100 p-6 overflow-auto custom-scrollbar flex flex-col font-sans select-none">
            {/* Header Title Row */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/launchpad')}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                        title="Back to Launchpad"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="h-4 w-px bg-gray-800" />
                    <h1 className="text-2xl font-extrabold flex items-center gap-2.5">
                        Parts Department Dashboard
                        {loading && <RefreshCw className="animate-spin text-minion-500" size={18} />}
                    </h1>
                </div>

                <div className="flex gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                        <input
                            className="pl-9 pr-4 py-2 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-minion-500 transition-colors"
                            placeholder="Search requests..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Excel Export */}
                    <button
                        onClick={handleExport}
                        disabled={exporting || filteredRequests.length === 0}
                        className="flex items-center gap-2 px-3.5 py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        title="Export visible requests to Excel"
                    >
                        <FileDown size={14} className={exporting ? 'animate-bounce text-minion-500' : 'text-minion-500'} />
                        <span className="text-gray-400 font-bold">{exporting ? 'Exporting…' : 'Export Excel'}</span>
                    </button>

                    {/* Settings Dropdown Gear */}
                    <div className="relative" ref={settingsMenuRef}>
                        <button
                            onClick={() => setShowSettingsMenu(v => !v)}
                            className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all cursor-pointer ${showSettingsMenu ? 'bg-gray-800 border-minion-500 text-minion-450' : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-gray-400 hover:text-white'}`}
                            title="Database & Backup Settings"
                        >
                            <Settings2 size={16} className={showSettingsMenu ? 'rotate-45 transition-transform duration-200' : 'transition-transform duration-200'} />
                        </button>

                        {showSettingsMenu && (
                            <div className="absolute right-0 top-11 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                                <div className="px-3.5 py-2 border-b border-gray-700/80">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Storage Sync</span>
                                </div>
                                <button
                                    onClick={() => { setShowSettingsMenu(false); setShowBackupModal(true) }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-750 hover:text-white transition-colors cursor-pointer"
                                >
                                    <FolderOpen size={14} className="text-minion-500" />
                                    <span>Export/Import JSON</span>
                                </button>
                                <button
                                    onClick={() => { setShowSettingsMenu(false); setShowSqlSetupModal(true) }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:bg-gray-750 hover:text-white transition-colors border-t border-gray-750 cursor-pointer"
                                >
                                    <HelpCircle size={14} className="text-purple-400" />
                                    <span>Get Supabase SQL Schema</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Refresh intervals info */}
            <div className="flex items-center gap-4 mb-5 text-xs text-gray-500 select-none">
                <Timer size={14} className="text-minion-500" />
                <div className="flex items-center gap-2">
                    <span>Auto-Refresh Pull:</span>
                    <select
                        value={dashInterval}
                        onChange={e => {
                            const val = Number(e.target.value)
                            setDashInterval(val)
                            handleSaveSettings('dashInterval', val)
                        }}
                        className="bg-gray-900 border border-gray-800 rounded px-2 py-0.5 text-xs outline-none text-gray-300"
                    >
                        <option value={2000}>2s</option>
                        <option value={5000}>5s</option>
                        <option value={10000}>10s</option>
                        <option value={30000}>30s</option>
                    </select>
                </div>
                <div className="h-3 w-px bg-gray-800" />
                <div className="text-[10px] text-gray-500">
                    Database mode: <span className="font-bold font-mono text-minion-450">{dbConfig.isCloud ? 'SUPABASE CLOUD' : 'LOCAL STORAGE'}</span>
                </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 mb-6 flex-wrap select-none">
                {['All', ...allStatuses].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${filter === f
                            ? 'bg-minion-500 text-black font-bold shadow-md'
                            : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Main table list */}
            <div className="bg-gray-900 border border-gray-850 rounded-xl shadow-lg overflow-hidden flex-1 min-h-0">
                <div className="overflow-auto h-full custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 sticky top-0 z-10 text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-850">
                            <tr>
                                <th className="px-6 py-3 w-8"></th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">ID</th>
                                <th className="px-6 py-3">Tail</th>
                                <th className="px-6 py-3">Mechanic</th>
                                <th className="px-6 py-3">Discrepancy</th>
                                <th className="px-6 py-3">Time</th>
                                <th className="px-6 py-3">Parts</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-850 bg-gray-900/50">
                            {filteredRequests.map(req => {
                                const isExpanded = expandedRow === req.id
                                return (
                                    <>
                                        {/* Main Row */}
                                        <tr
                                            key={req.id}
                                            className="hover:bg-gray-800/40 transition-colors cursor-pointer"
                                            onClick={() => setExpandedRow(isExpanded ? null : req.id)}
                                        >
                                            <td className="px-6 py-4">
                                                {isExpanded
                                                    ? <ChevronDown size={14} className="text-minion-500" />
                                                    : <ChevronRight size={14} className="text-gray-600" />
                                                }
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={req.status}
                                                        onChange={e => {
                                                            e.stopPropagation()
                                                            handleStatusChange(req.id, e.target.value)
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                        className={`px-2 py-1 rounded text-[10px] font-bold outline-none cursor-pointer border border-transparent focus:border-minion-500 ${statusColors[req.status] || 'bg-gray-600 text-gray-300'}`}
                                                    >
                                                        {allStatuses.map(s => (
                                                            <option key={s} value={s} className="bg-gray-900 text-gray-200">
                                                                {s}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500">#{req.id.slice(-5)}</td>
                                            <td className="px-6 py-4 font-bold text-gray-200">{req.tail}</td>
                                            <td className="px-6 py-4 text-sm text-gray-300">{req.mechanic}</td>
                                            <td className="px-6 py-4 text-xs font-mono text-gray-500">
                                                <div className="space-y-1">
                                                    <div>{req.discrepancy || '—'}</div>
                                                    {req.notes && (
                                                        <div className="flex items-center gap-1 text-[10px] text-yellow-300 font-sans font-medium italic">
                                                            <MessageSquare size={10} className="text-yellow-400 shrink-0" />
                                                            <span className="truncate max-w-[180px]">{req.notes}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-550">{req.time}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-minion-500 font-bold text-xs">{req.items?.length || 0}</span>
                                                    <span className="text-gray-500 text-xs">items</span>
                                                    {(() => {
                                                        const ls: string[] = [...new Set<string>((req.items || []).map((i: any) => i.status))]
                                                        const hasOnOrder = ls.includes('On Order')
                                                        const onOrderCount = (req.items || []).filter((i: any) => i.status === 'On Order').length
                                                        return (
                                                            <div className="flex items-center gap-1.5 ml-1">
                                                                {hasOnOrder && (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-purple-600/30 border border-purple-500/50 text-[9px] font-bold text-purple-300"
                                                                        title={`${onOrderCount} On Order`}
                                                                    >
                                                                        {onOrderCount} On Order
                                                                    </span>
                                                                )}
                                                                {ls.filter(s => s !== 'On Order').map(s => (
                                                                    <span
                                                                        key={s}
                                                                        className={`w-1.5 h-1.5 rounded-full ${statusDotColors[s] || 'bg-gray-550'}`}
                                                                        title={`${(req.items || []).filter((i: any) => i.status === s).length} ${s}`}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )
                                                    })()}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Expanded Items Row */}
                                        {isExpanded && (() => {
                                            const { groups, order } = groupItemsByIndex(req.items || [])
                                            const isEditingNotes = editingNotesReqId === req.id
                                            const isAddingLine = addingLineToReqId === req.id

                                            return (
                                                <tr key={`${req.id}-detail`}>
                                                    <td colSpan={8} className="px-6 py-3 bg-gray-900/40">
                                                        <div className="pl-6 border-l border-gray-800 space-y-3">
                                                            {/* Order Notes & Actions Header */}
                                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-gray-850">
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-gray-500 uppercase font-bold flex items-center gap-2">
                                                                        <span>Discrepancy:</span>
                                                                        <span className="text-gray-300 normal-case font-normal">{req.discrepancy || 'Not specified'}</span>
                                                                    </div>

                                                                    {/* Order Notes Display / Edit */}
                                                                    <div className="flex items-center gap-2 text-xs">
                                                                        <MessageSquare size={13} className="text-minion-500 shrink-0" />
                                                                        <span className="text-gray-400 font-bold uppercase text-[10px]">Order Notes:</span>
                                                                        {isEditingNotes ? (
                                                                            <div className="flex items-center gap-1.5 flex-1">
                                                                                <input
                                                                                    type="text"
                                                                                    value={editingNotesText}
                                                                                    onChange={e => setEditingNotesText(e.target.value)}
                                                                                    className="bg-gray-950 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 outline-none focus:border-minion-500 font-sans flex-1"
                                                                                    placeholder="Enter order notes or special instructions..."
                                                                                />
                                                                                <button
                                                                                    onClick={() => handleSaveOrderNotes(req.id, editingNotesText)}
                                                                                    className="px-2 py-0.5 bg-minion-500 text-black text-[10px] font-bold rounded hover:bg-minion-400 cursor-pointer"
                                                                                >
                                                                                    Save
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setEditingNotesReqId(null)}
                                                                                    className="px-2 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded hover:bg-gray-750 cursor-pointer"
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className={req.notes ? 'text-yellow-300 font-medium italic' : 'text-gray-550 italic'}>
                                                                                    {req.notes || 'No notes attached to this order.'}
                                                                                </span>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingNotesReqId(req.id)
                                                                                        setEditingNotesText(req.notes || '')
                                                                                    }}
                                                                                    className="p-1 text-gray-400 hover:text-minion-400 rounded hover:bg-gray-800 cursor-pointer transition-colors"
                                                                                    title="Edit order notes"
                                                                                >
                                                                                    <Edit3 size={11} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Fulfill / Cancel / Add Part / Print actions */}
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    {/* Print Ticket Button */}
                                                                    <button
                                                                        onClick={() => setPrintTicketReq(req)}
                                                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-purple-600/20 text-purple-300 hover:bg-purple-600/40 transition-colors border border-purple-500/30 cursor-pointer"
                                                                        title="Print physical pick ticket for stockroom"
                                                                    >
                                                                        <Printer size={11} /> Print Ticket
                                                                    </button>

                                                                    {/* Add Line Item Button */}
                                                                    <button
                                                                        onClick={() => {
                                                                            setAddingLineToReqId(isAddingLine ? null : req.id)
                                                                            setNewLinePartNum('')
                                                                            setNewLineNomenclature('')
                                                                            setNewLineQty('1')
                                                                            setNewLineGroup('')
                                                                        }}
                                                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-minion-500/20 text-minion-400 hover:bg-minion-500/40 transition-colors border border-minion-500/30 cursor-pointer"
                                                                        title="Add a missing part to this active order"
                                                                    >
                                                                        <Plus size={11} /> Add Part
                                                                    </button>

                                                                    <button
                                                                        onClick={() => handleMarkAllLines(req.id, 'Fulfilled')}
                                                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 transition-colors border border-emerald-500/25 cursor-pointer"
                                                                    >
                                                                        <Check size={11} /> Fulfill All
                                                                    </button>
                                                                    {req.items.some((i: any) => i.status === 'Picked') && (
                                                                        <button
                                                                            onClick={() => handleFulfillPicked(req.id)}
                                                                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-sky-650/20 text-sky-350 hover:bg-sky-650/45 transition-colors border border-sky-500/25 cursor-pointer"
                                                                        >
                                                                            <Check size={11} /> Fulfill Picked ({req.items.filter((i: any) => i.status === 'Picked').length})
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => handleMarkAllLines(req.id, 'Canceled')}
                                                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors border border-red-500/25 cursor-pointer"
                                                                    >
                                                                        <XCircle size={11} /> Cancel All
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Inline Add Part Form */}
                                                            {isAddingLine && (
                                                                <div className="bg-gray-950/70 border border-minion-500/30 rounded-xl p-3 space-y-2 animate-fade-in">
                                                                    <div className="text-xs font-bold text-minion-400 flex items-center gap-1.5">
                                                                        <Plus size={13} /> Add Extra Line Item to Order #{req.id.slice(-5)}
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Part Number (Required)"
                                                                            value={newLinePartNum}
                                                                            onChange={e => setNewLinePartNum(e.target.value)}
                                                                            className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white uppercase font-mono outline-none focus:border-minion-500"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Nomenclature / Description"
                                                                            value={newLineNomenclature}
                                                                            onChange={e => setNewLineNomenclature(e.target.value)}
                                                                            className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-minion-500"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Qty (default 1)"
                                                                            value={newLineQty}
                                                                            onChange={e => setNewLineQty(e.target.value)}
                                                                            className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-minion-500"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Index / Location (e.g. -14a)"
                                                                            value={newLineGroup}
                                                                            onChange={e => setNewLineGroup(e.target.value)}
                                                                            className="bg-gray-900 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-minion-500"
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-end gap-2 pt-1">
                                                                        <button
                                                                            onClick={() => setAddingLineToReqId(null)}
                                                                            className="px-3 py-1 bg-gray-800 text-gray-300 text-xs rounded hover:bg-gray-750 cursor-pointer"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleAddLineItemToOrder(req.id)}
                                                                            className="px-3 py-1 bg-minion-500 text-black font-bold text-xs rounded hover:bg-minion-400 cursor-pointer shadow"
                                                                        >
                                                                            Save Part to Order
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <table className="w-full text-xs text-gray-300" style={{ tableLayout: 'fixed' }}>
                                                                <colgroup>
                                                                    <col style={{ width: '20%' }} />
                                                                    <col style={{ width: '32%' }} />
                                                                    <col style={{ width: '10%' }} />
                                                                    <col style={{ width: '13%' }} />
                                                                    <col style={{ width: '25%' }} />
                                                                </colgroup>
                                                                <thead>
                                                                    <tr className="text-gray-500 text-[10px] uppercase font-bold border-b border-gray-800">
                                                                        <th className="text-left py-1.5">Part Number</th>
                                                                        <th className="text-left py-1.5">Nomenclature</th>
                                                                        <th className="text-center py-1.5">Requested Qty</th>
                                                                        <th className="text-center py-1.5">Picked Qty</th>
                                                                        <th className="text-center py-1.5">Line Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {order.map(groupKey => (
                                                                        <>
                                                                            <tr key={`hdr-${groupKey}`}>
                                                                                <td colSpan={5} className="pt-3 pb-1">
                                                                                    <div className="text-[10px] font-bold text-minion-400 border-l-2 border-minion-500 pl-1.5">
                                                                                        Index / Location: {groupKey}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                            {groups[groupKey].map((item: any, idx: number) => {
                                                                                const isCanceled = item.status === 'Canceled'
                                                                                return (
                                                                                    <tr key={`${groupKey}-${idx}`} className={`border-b border-gray-850 hover:bg-gray-800/10 ${isCanceled ? 'opacity-30 line-through' : ''}`}>
                                                                                        <td className="py-2 font-mono text-minion-450 truncate">
                                                                                            <div className="flex items-center gap-1.5 truncate">
                                                                                                <span className="truncate">{item.part_number}</span>
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation()
                                                                                                        localStorage.setItem('minion_pending_jump', JSON.stringify({
                                                                                                            type: 'idx',
                                                                                                            value: item.group || item.part_number,
                                                                                                            group: item.group || '',
                                                                                                            partNumber: item.part_number
                                                                                                        }))
                                                                                                        navigate('/catalog')
                                                                                                    }}
                                                                                                    className="px-1.5 py-0.5 rounded bg-minion-500/10 hover:bg-minion-500 text-minion-400 hover:text-black border border-minion-500/30 text-[9px] font-bold flex items-center gap-0.5 transition-all cursor-pointer shrink-0"
                                                                                                    title="Open in PDF Catalog Viewer"
                                                                                                >
                                                                                                    <BookOpen size={10} /> View
                                                                                                </button>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="py-2 truncate text-gray-300">{item.nomenclature}</td>
                                                                                        <td className="py-2 text-center">
                                                                                            <input
                                                                                                type="text"
                                                                                                value={item.qty}
                                                                                                onChange={e => handleLineQtyChange(item.id, e.target.value)}
                                                                                                className="w-10 text-center bg-gray-900 border border-gray-800 rounded font-mono py-0.5 outline-none focus:ring-1 focus:ring-minion-500 text-gray-100"
                                                                                            />
                                                                                        </td>
                                                                                        <td className="py-2 text-center">
                                                                                            <input
                                                                                                type="text"
                                                                                                value={item.filled_qty || ''}
                                                                                                placeholder="0"
                                                                                                onChange={e => handleLineFilledQtyChange(item.id, e.target.value)}
                                                                                                className="w-10 text-center bg-gray-900 border border-gray-850 rounded font-mono py-0.5 outline-none focus:ring-1 focus:ring-sky-500 text-sky-400"
                                                                                            />
                                                                                            {item.status !== 'Picked' && String(item.qty) !== String(item.filled_qty) && (
                                                                                                <button
                                                                                                    onClick={() => handlePickLine(item.id, item.qty)}
                                                                                                    className="ml-1 px-1 bg-sky-950 border border-sky-800 text-sky-400 hover:bg-sky-900 hover:text-white rounded text-[9px] py-0.5 transition-colors cursor-pointer"
                                                                                                    title="Auto-fill with requested amount"
                                                                                                >
                                                                                                    Full
                                                                                                </button>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="py-2 text-center">
                                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                                <select
                                                                                                    value={item.status}
                                                                                                    onChange={e => handleLineStatusChange(item.id, e.target.value)}
                                                                                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold outline-none cursor-pointer border border-transparent ${statusColors[item.status] || 'bg-gray-700 text-gray-300'}`}
                                                                                                >
                                                                                                    {lineStatuses.map(ls => (
                                                                                                        <option key={ls} value={ls} className="bg-gray-900 text-gray-250">
                                                                                                            {ls}
                                                                                                        </option>
                                                                                                    ))}
                                                                                                </select>

                                                                                                {/* Approve / Deny requests */}
                                                                                                {item.requested_changes && (
                                                                                                    <div className="flex items-center gap-1 bg-orange-950/40 border border-orange-900/50 px-1.5 py-0.5 rounded text-[9px] text-orange-400">
                                                                                                        <span className="font-bold">Req: {item.requested_changes}</span>
                                                                                                        <button
                                                                                                            onClick={() => handleApproveChange(item, req.id)}
                                                                                                            className="text-green-400 hover:text-white cursor-pointer px-0.5"
                                                                                                            title="Approve change"
                                                                                                        >
                                                                                                            ✓
                                                                                                        </button>
                                                                                                        <button
                                                                                                            onClick={() => handleDenyChange(item, req.id)}
                                                                                                            className="text-red-400 hover:text-white cursor-pointer px-0.5"
                                                                                                            title="Deny change"
                                                                                                        >
                                                                                                            ✗
                                                                                                        </button>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                )
                                                                            })}
                                                                        </>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })()}
                                    </>
                                )
                            })}
                            {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">
                                        No parts requests found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Printable Pick Ticket Modal */}
            {printTicketReq && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in select-none">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-2">
                                <Printer className="text-minion-500" size={20} />
                                <h3 className="text-lg font-extrabold text-white">Parts Pick Ticket Preview</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-minion-500 hover:bg-minion-400 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 shadow cursor-pointer transition-colors"
                                >
                                    <Printer size={14} /> Print Ticket
                                </button>
                                <button
                                    onClick={() => setPrintTicketReq(null)}
                                    className="p-2 hover:bg-gray-800 rounded-xl text-gray-400 hover:text-white cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Ticket Paper Area (Print Target) */}
                        <div className="flex-1 overflow-auto p-6 bg-white text-black rounded-xl my-4 font-sans select-text shadow-inner custom-scrollbar printable-ticket-content">
                            <style>{`
                                @media print {
                                    body * { visibility: hidden !important; }
                                    .printable-ticket-content, .printable-ticket-content * { visibility: visible !important; }
                                    .printable-ticket-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; color: black; background: white; }
                                }
                            `}</style>

                            <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
                                <div>
                                    <h1 className="text-2xl font-black tracking-tight text-black">MINION MP — PARTS PICK TICKET</h1>
                                    <p className="text-xs font-bold text-gray-700">AIRCRAFT PARTS REQUISITION & PICK LIST</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-mono font-bold">#{printTicketReq.id.slice(-5)}</div>
                                    <div className="text-xs text-gray-600">{new Date(printTicketReq.timestamp).toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-100 rounded-lg text-xs font-semibold">
                                <div><span className="text-gray-500 uppercase text-[10px] block">AIRCRAFT TAIL:</span> <span className="text-sm font-bold">{printTicketReq.tail}</span></div>
                                <div><span className="text-gray-500 uppercase text-[10px] block">REQUESTING MECHANIC:</span> <span className="text-sm font-bold">{printTicketReq.mechanic}</span></div>
                                <div className="col-span-2"><span className="text-gray-500 uppercase text-[10px] block">DISCREPANCY:</span> <span>{printTicketReq.discrepancy || 'Not specified'}</span></div>
                                {printTicketReq.notes && (
                                    <div className="col-span-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-900"><span className="font-bold">ORDER NOTES:</span> {printTicketReq.notes}</div>
                                )}
                            </div>

                            <table className="w-full text-xs text-left border-collapse mb-6">
                                <thead>
                                    <tr className="border-b-2 border-black text-[11px] uppercase font-bold text-gray-700">
                                        <th className="py-2 w-8 text-center">[✓]</th>
                                        <th className="py-2">PART NUMBER</th>
                                        <th className="py-2">NOMENCLATURE</th>
                                        <th className="py-2 text-center">INDEX / LOC</th>
                                        <th className="py-2 text-center">QTY REQ</th>
                                        <th className="py-2 text-center">QTY PICKED</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(printTicketReq.items || []).map((item: any, idx: number) => (
                                        <tr key={idx} className="border-b border-gray-300 py-2">
                                            <td className="py-2 text-center font-bold text-base">□</td>
                                            <td className="py-2 font-mono font-bold">{item.part_number}</td>
                                            <td className="py-2">{item.nomenclature}</td>
                                            <td className="py-2 text-center font-mono text-xs">{item.group || '—'}</td>
                                            <td className="py-2 text-center font-bold text-sm">{item.qty}</td>
                                            <td className="py-2 text-center text-gray-400">______</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-[11px] text-gray-600 font-medium">
                                <div>Picked By: ___________________________</div>
                                <div>Date / Time: _______________________</div>
                                <div>Received By: ________________________</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* JSON Backup Manager Modal */}
            {showBackupModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
                        <button
                            onClick={() => setShowBackupModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <h3 className="text-md font-bold text-minion-400 mb-3 flex items-center gap-1.5">
                            <FolderOpen size={18} />
                            Database Backup Manager
                        </h3>
                        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                            Export your current requests and annotations as a local JSON file, or restore them from a previous backup.
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={handleExportBackup}
                                className="w-full flex items-center justify-center gap-2 bg-gray-900 border border-gray-700 hover:bg-gray-850 text-gray-200 text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer"
                            >
                                <Download size={14} className="text-minion-500" />
                                Export Database JSON
                            </button>
                            <div className="h-px bg-gray-700 my-2" />
                            <label className="w-full flex items-center justify-center gap-2 bg-minion-500 hover:bg-minion-400 text-black text-xs font-bold py-2.5 rounded-lg transition-colors cursor-pointer text-center">
                                <Upload size={14} />
                                Import Database JSON
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleImportBackup}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Supabase SQL Setup Modal */}
            {showSqlSetupModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
                        <button
                            onClick={() => setShowSqlSetupModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <h3 className="text-md font-bold text-purple-400 mb-2 flex items-center gap-1.5 shrink-0">
                            <HelpCircle size={18} />
                            Supabase SQL Editor Commands
                        </h3>
                        <p className="text-xs text-gray-400 mb-4 shrink-0">
                            Copy and paste the SQL script below into the **SQL Editor** on your Supabase dashboard to create the tables and enable real-time synchronization.
                        </p>
                        <div className="flex-1 overflow-auto bg-gray-900 border border-gray-850 rounded-lg p-3 font-mono text-[10px] text-gray-300 leading-normal custom-scrollbar select-text selection:bg-purple-900/50">
                            <pre className="whitespace-pre-wrap">{sqlSetupCommand}</pre>
                        </div>
                        <div className="mt-4 flex gap-2 shrink-0 justify-end">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(sqlSetupCommand)
                                    showToast('SQL commands copied to clipboard!')
                                }}
                                className="bg-minion-500 hover:bg-minion-400 text-black text-xs font-bold px-4 py-2 rounded-lg cursor-pointer"
                            >
                                Copy SQL Script
                            </button>
                            <button
                                onClick={() => setShowSqlSetupModal(false)}
                                className="bg-gray-755 hover:bg-gray-700 text-gray-300 text-xs px-4 py-2 rounded-lg cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Toast Banner */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-2 z-50 animate-fade-in ${toast.type === 'success' ? 'bg-green-600/20 border-green-500/30 text-green-400' : 'bg-red-600/20 border-red-500/30 text-red-400'}`}>
                    <Info size={14} />
                    <span className="text-xs font-semibold">{toast.message}</span>
                </div>
            )}
        </div>
    )
}
