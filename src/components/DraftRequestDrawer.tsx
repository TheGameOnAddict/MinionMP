import { useState, useEffect, useRef } from 'react'
import {
    X, Trash2, Send, Plus, Minus, Clipboard, Info, ShoppingCart, Pin
} from 'lucide-react'
import { parseIPC, ParsedItem } from '../utils/parser'
import { db, RequestLineItem } from '../utils/db'

type SelectableParsedItem = ParsedItem & { selected: boolean }

interface DraftRequestDrawerProps {
    isOpen: boolean
    onClose: () => void
}

interface ScrollableFigureTextProps {
    text: string
}

function ScrollableFigureText({ text }: ScrollableFigureTextProps) {
    const textRef = useRef<HTMLSpanElement>(null)
    const [shouldAnimate, setShouldAnimate] = useState(false)
    const parentWidth = 85

    const handleMouseEnter = () => {
        if (textRef.current) {
            const hasOverflow = textRef.current.scrollWidth > parentWidth
            setShouldAnimate(hasOverflow)
        }
    }

    const handleMouseLeave = () => {
        setShouldAnimate(false)
    }

    const overflowOffset = textRef.current
        ? textRef.current.scrollWidth - parentWidth
        : 0

    return (
        <span
            className="inline-flex items-center select-none"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <span className="text-gray-600 shrink-0 mr-1">FIG</span>
            <span className="w-[85px] overflow-hidden relative inline-block align-middle h-3.5">
                <span
                    ref={textRef}
                    className="inline-block whitespace-nowrap text-minion-400 absolute left-0 font-bold"
                    style={{
                        transform: shouldAnimate && overflowOffset > 0
                            ? `translateX(-${overflowOffset}px)`
                            : 'translateX(0)',
                        transition: shouldAnimate ? `transform ${Math.max(1.5, overflowOffset / 25)}s linear` : 'transform 0.2s ease-out'
                    }}
                >
                    {text}
                </span>
            </span>
        </span>
    )
}

export default function DraftRequestDrawer({ isOpen, onClose }: DraftRequestDrawerProps) {
    const [draftItems, setDraftItems] = useState<Omit<RequestLineItem, 'status'>[]>(() => {
        const local = localStorage.getItem('minion_draft_items')
        return local ? JSON.parse(local) : []
    })

    // Pin State
    const [isPinned, setIsPinned] = useState(() => localStorage.getItem('minion_drawer_pinned') === 'true')

    const handleTogglePin = () => {
        const next = !isPinned
        setIsPinned(next)
        localStorage.setItem('minion_drawer_pinned', String(next))
        window.dispatchEvent(new CustomEvent('minion_drawer_pin_toggle', { detail: { isPinned: next } }))
    }

    const saveAndSyncDraft = (items: Omit<RequestLineItem, 'status'>[]) => {
        localStorage.setItem('minion_draft_items', JSON.stringify(items))
        setDraftItems(items)
        window.dispatchEvent(new CustomEvent('minion_draft_update', { detail: { sender: 'drawer' } }))
    }

    const handleUpdateQty = (id: string, newQty: number) => {
        const updated = draftItems.map(item => {
            if (item.id === id) {
                return { ...item, qty: newQty, original_qty: newQty }
            }
            return item
        })
        saveAndSyncDraft(updated)
    }

    // Form inputs
    const [mechanicName, setMechanicName] = useState(() => localStorage.getItem('minion_draft_mechanic') || '')
    const [tail, setTail] = useState(() => localStorage.getItem('minion_draft_tail') || '')
    const [discrepancy, setDiscrepancy] = useState('')
    const [orderNotes, setOrderNotes] = useState('')

    // Manual Entry
    const [showManualEntry, setShowManualEntry] = useState(true)
    const [partNumberInput, setPartNumberInput] = useState('')
    const [qtyInput, setQtyInput] = useState('')

    // Clipboard parser
    const [ipcText, setIpcText] = useState('')
    const [parsedItems, setParsedItems] = useState<SelectableParsedItem[]>([])

    // Toast feedback
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ message, type })
        toastTimer.current = setTimeout(() => setToast(null), 3000)
    }

    const formatSourceGroup = (group: string) => {
        let figure = ''
        let index = ''
        let page = ''

        let working = group
        const figMatch = working.match(/fig\.\s*([^|]+)/i)
        if (figMatch) {
            figure = figMatch[1].trim()
            working = working.replace(/fig\.\s*[^|]+\|?/, '').trim()
        }

        const pgMatch = working.match(/pg\.\s*(.+)$/i)
        if (pgMatch) {
            page = pgMatch[1].trim()
            working = working.replace(/\s+pg\.\s*.+$/, '').trim()
        }

        index = working.replace(/^\|\s*/, '').trim()

        return { figure, index, page }
    }

    const handleChipClick = (type: 'fig' | 'idx' | 'pg', value: string, group: string) => {
        window.dispatchEvent(new CustomEvent('minion_jump_to_target', {
            detail: { type, value, group }
        }))
    }

    const getFigureTitle = (figNum: string): string => {
        const pdfName = localStorage.getItem('minion_current_pdf_name') || 'sample-catalog.pdf'
        let pdfId = pdfName.replace(/\.pdf$/i, '')

        const profilesLocal = localStorage.getItem('minion_save_profiles')
        if (profilesLocal) {
            try {
                const profiles = JSON.parse(profilesLocal)
                const match = profiles.find((p: any) => p.bindKeyword?.trim() && pdfName.includes(p.bindKeyword.trim()))
                if (match) {
                    pdfId = match.id
                }
            } catch (e) {}
        }

        const override = localStorage.getItem('minion_active_pdf_id_override')
        if (override) {
            pdfId = override
        }

        const cached = localStorage.getItem(`pdf_metadata_v3_${pdfId}`)
        if (cached) {
            try {
                const parsed = JSON.parse(cached)
                const title = parsed[`fig-title-${figNum.toLowerCase()}`]
                if (title) {
                    return title.replace(/^(Figure|Fig\.)\s*/i, '')
                }
            } catch (e) {}
        }
        return figNum
    }

    // Load from local storage
    const loadDraft = () => {
        const local = localStorage.getItem('minion_draft_items')
        if (local) {
            try {
                setDraftItems(JSON.parse(local))
            } catch (e) {
                console.error(e)
            }
        }
    }

    // Sync draft updates across elements
    useEffect(() => {
        loadDraft()

        const handleDraftUpdate = (e: Event) => {
            if ((e as CustomEvent).detail?.sender !== 'drawer') {
                loadDraft()
            }
        }
        const handleFocus = () => loadDraft()

        window.addEventListener('minion_draft_update', handleDraftUpdate)
        window.addEventListener('focus', handleFocus)

        return () => {
            window.removeEventListener('minion_draft_update', handleDraftUpdate)
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    // Save inputs to localStorage so they persist when toggling pages
    useEffect(() => {
        localStorage.setItem('minion_draft_mechanic', mechanicName)
    }, [mechanicName])

    useEffect(() => {
        localStorage.setItem('minion_draft_tail', tail)
    }, [tail])

    const handleAddManualPart = () => {
        if (!partNumberInput.trim() || !qtyInput.trim()) return

        const newItem = {
            id: `manual-${Date.now()}`,
            raw: `Manual entry: ${partNumberInput}`,
            part_number: partNumberInput.toUpperCase().trim(),
            nomenclature: 'Manual request',
            qty: isNaN(Number(qtyInput)) ? qtyInput.trim() : Number(qtyInput),
            original_qty: isNaN(Number(qtyInput)) ? qtyInput.trim() : Number(qtyInput),
            group: 'Manual'
        }

        const updated = [...draftItems, newItem]
        saveAndSyncDraft(updated)
        setPartNumberInput('')
        setQtyInput('')
    }

    const handleParseClipboard = () => {
        if (!ipcText.trim()) return
        const parsed = parseIPC(ipcText).map(i => ({ ...i, selected: true }))
        setParsedItems(parsed)
    }

    const handleImportParsedItems = () => {
        const selected = parsedItems.filter(i => i.selected)
        if (selected.length === 0) return

        const mapped = selected.map(i => ({
            id: i.id,
            raw: i.raw,
            part_number: i.partNumber,
            nomenclature: i.nomenclature,
            qty: i.qty,
            original_qty: i.originalQty,
            qtyUnit: i.qtyUnit,
            group: i.group
        }))

        const updated = [...draftItems, ...mapped]
        saveAndSyncDraft(updated)
        setParsedItems([])
        setIpcText('')
        showToast(`Imported ${mapped.length} parts from clipboard`)
    }

    const handleRemoveDraftItem = (id: string) => {
        const updated = draftItems.filter(i => i.id !== id)
        saveAndSyncDraft(updated)
    }

    const handleClearDraft = () => {
        saveAndSyncDraft([])
    }

    const handleSubmitRequest = async () => {
        if (!mechanicName.trim() || tail.trim().length < 3 || !discrepancy.trim()) {
            showToast('Please fill in required fields (Mechanic, Tail, Discrepancy)', 'error')
            return
        }

        if (draftItems.length === 0) {
            showToast('Request draft is empty', 'error')
            return
        }

        const id = `req-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
        const finalItems = draftItems.map(item => ({
            ...item,
            status: 'New',
            filled_qty: ''
        }))

        const result = await db.saveRequest({
            id,
            mechanic: mechanicName,
            tail: tail.toUpperCase(),
            discrepancy,
            status: 'New',
            items: finalItems,
            notes: orderNotes
        })

        if (result.success) {
            showToast(`Request submitted! ID: #${id.slice(-5)}`, 'success')
            handleClearDraft()
            setDiscrepancy('')
            setOrderNotes('')
            // Close drawer after short delay
            setTimeout(() => onClose(), 1000)
        } else {
            showToast('Failed to submit request', 'error')
        }
    }

    return (
        <>
            {/* Drawer Overlay Backdrop (only if not pinned) */}
            {isOpen && !isPinned && (
                <div
                    onClick={onClose}
                    className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
                />
            )}

            {/* Slider panel */}
            <div
                className={`fixed top-0 right-0 h-full w-[360px] bg-gray-900 border-l border-gray-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="text-minion-500" size={18} />
                        <h2 className="text-sm font-bold text-minion-450 uppercase tracking-wider">
                            Request Draft
                        </h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleTogglePin}
                            className={`p-1 rounded transition-colors cursor-pointer ${isPinned ? 'bg-minion-500/20 text-minion-400' : 'text-gray-450 hover:bg-gray-800 hover:text-white'}`}
                            title={isPinned ? "Unpin Panel" : "Pin Panel"}
                        >
                            <Pin size={15} className={`transition-transform duration-300 ${isPinned ? '-rotate-45 text-minion-400' : ''}`} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-gray-800 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form Inputs */}
                <div className="p-4 border-b border-gray-800 space-y-2 select-none">
                    <input
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:ring-1 focus:ring-minion-500 outline-none"
                        placeholder="Mechanic Name"
                        value={mechanicName}
                        onChange={e => setMechanicName(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <input
                            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:ring-1 focus:ring-minion-500 outline-none uppercase font-mono"
                            placeholder="Tail Number"
                            value={tail}
                            onChange={e => setTail(e.target.value)}
                            maxLength={6}
                        />
                        <input
                            className="w-28 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:ring-1 focus:ring-minion-500 outline-none font-mono"
                            placeholder="Discrepancy #"
                            value={discrepancy}
                            onChange={e => setDiscrepancy(e.target.value)}
                            type="number"
                        />
                    </div>
                </div>

                {/* List Items */}
                <div className="flex-1 overflow-auto p-3 custom-scrollbar space-y-3 min-h-0 select-none">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-450 uppercase">Selected Parts ({draftItems.length})</span>
                        {draftItems.length > 0 && (
                            <button
                                onClick={handleClearDraft}
                                className="text-[9px] text-red-405 hover:text-red-300 font-bold transition-colors cursor-pointer"
                            >
                                Clear All
                            </button>
                        )}
                    </div>

                    {draftItems.length === 0 ? (
                        <div className="py-8 border border-dashed border-gray-850 rounded-xl flex flex-col items-center justify-center text-center px-4">
                            <div className="text-gray-600 text-xs mb-2">💡 Your draft is empty</div>
                            <p className="text-[9.5px] text-gray-500 max-w-[200px] leading-relaxed">
                                Go to **Catalog Viewer** to draw boxes around parts, click part cards in **Parts Discovery**, or add them manually below.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {draftItems.map(item => (
                                <div
                                    key={item.id}
                                    className="bg-gray-850/35 border border-gray-800/80 px-2.5 py-1.5 rounded-lg flex items-start justify-between gap-2 group"
                                >
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="font-mono text-[12px] leading-none font-black text-minion-400 truncate">
                                            {item.part_number}
                                        </div>
                                        <div className="text-[9.5px] text-gray-350 leading-tight line-clamp-2 -mt-0.5">
                                            {item.nomenclature}
                                        </div>
                                        {item.group && (() => {
                                            const source = formatSourceGroup(item.group)
                                            return (
                                                <div className="flex w-fit max-w-full items-center gap-1 pt-0.5 text-[9px] font-mono font-bold select-none">
                                                    {source.figure && (
                                                        <>
                                                            <button
                                                                onClick={() => handleChipClick('fig', source.figure, item.group)}
                                                                className="shrink-0 rounded bg-gray-900/70 border border-gray-800 px-1.5 py-0.5 text-gray-450 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                                                                title={`Jump to Figure ${source.figure}: ${getFigureTitle(source.figure)}`}
                                                            >
                                                                <ScrollableFigureText text={getFigureTitle(source.figure)} />
                                                            </button>
                                                            {(source.index || source.page) && <span className="text-gray-700">|</span>}
                                                        </>
                                                    )}
                                                    {source.index && (
                                                        <>
                                                            <button
                                                                onClick={() => handleChipClick('idx', source.index, item.group)}
                                                                className="min-w-0 truncate rounded bg-gray-900/70 border border-gray-800 px-1.5 py-0.5 text-gray-450 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                                                                title="Jump to Index page and highlight"
                                                            >
                                                                <span className="text-gray-600">IDX</span> <span className="text-minion-400">{source.index}</span>
                                                            </button>
                                                            {source.page && <span className="text-gray-700">|</span>}
                                                        </>
                                                    )}
                                                    {source.page && (
                                                        <button
                                                            onClick={() => handleChipClick('pg', source.page, item.group)}
                                                            className="shrink-0 rounded bg-gray-900/70 border border-gray-800 px-1.5 py-0.5 text-gray-450 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                                                            title="Jump to physical page"
                                                        >
                                                            <span className="text-gray-600">PG</span> <span className="text-minion-400">{source.page}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-0.5 rounded border border-gray-800 bg-gray-900/70 px-0.5 py-px select-none">
                                            <button
                                                onClick={() => handleUpdateQty(item.id, Math.max(1, Number(item.qty) - 1))}
                                                className="p-px hover:bg-gray-800 text-gray-500 hover:text-white rounded cursor-pointer transition-colors"
                                            >
                                                <Minus size={8} />
                                            </button>
                                            <input
                                                type="number"
                                                min={1}
                                                value={item.qty}
                                                onChange={e => handleUpdateQty(item.id, Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-5 bg-transparent text-center font-mono font-black text-[10px] outline-none text-minion-300"
                                            />
                                            <button
                                                onClick={() => handleUpdateQty(item.id, Number(item.qty) + 1)}
                                                className="p-px hover:bg-gray-800 text-gray-500 hover:text-white rounded cursor-pointer transition-colors"
                                            >
                                                <Plus size={8} />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveDraftItem(item.id)}
                                            className="rounded-md border border-gray-800 bg-gray-900/60 px-1.5 py-1 text-gray-500 hover:text-red-400 hover:border-red-500/35 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                            title="Remove part"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Manual Entry Form */}
                    <div className="pt-2 border-t border-gray-850">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5 select-none">
                            <input
                                type="checkbox"
                                checked={showManualEntry}
                                onChange={e => setShowManualEntry(e.target.checked)}
                                className="rounded border-gray-700 bg-gray-850 text-minion-500 focus:ring-minion-500 w-3 h-3"
                            />
                            <span>Manual Entry Row</span>
                        </label>

                        {showManualEntry && (
                            <div className="bg-gray-850/35 border border-gray-800/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                                <input
                                    className="min-w-0 flex-1 bg-gray-900/70 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-minion-500 focus:ring-1 focus:ring-minion-500/30 font-mono uppercase placeholder-gray-600"
                                    placeholder="PART NUMBER"
                                    value={partNumberInput}
                                    onChange={e => setPartNumberInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddManualPart()}
                                />
                                <input
                                    className="w-11 bg-gray-900/70 border border-gray-800 rounded px-1 py-1 text-[11px] text-center text-gray-100 outline-none focus:border-minion-500 focus:ring-1 focus:ring-minion-500/30 font-mono placeholder-gray-600"
                                    placeholder="QTY"
                                    value={qtyInput}
                                    onChange={e => setQtyInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddManualPart()}
                                />
                                <button
                                    onClick={handleAddManualPart}
                                    disabled={!partNumberInput.trim() || !qtyInput.trim()}
                                    className="bg-minion-500 hover:bg-minion-400 disabled:opacity-30 p-1.5 text-black rounded-md transition-colors cursor-pointer flex items-center justify-center border border-minion-400/40"
                                >
                                    <Plus size={15} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Clipboard parsing */}
                    <div className="pt-2 border-t border-gray-850 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                            <span>CLIPBOARD PARSER</span>
                            <Clipboard size={12} className="text-gray-500" />
                        </div>
                        <textarea
                            className="w-full h-20 bg-gray-900 border border-gray-800 rounded p-2 text-[10px] font-mono focus:ring-1 focus:ring-minion-500 outline-none custom-scrollbar text-gray-300 placeholder-gray-600"
                            placeholder="Paste parts catalog listing text lines..."
                            value={ipcText}
                            onChange={e => setIpcText(e.target.value)}
                        />
                        <button
                            onClick={handleParseClipboard}
                            disabled={!ipcText.trim()}
                            className="w-full bg-gray-800 border border-gray-750 hover:bg-gray-750 text-gray-250 text-xs font-bold py-1.5 rounded transition-all disabled:opacity-30 cursor-pointer"
                        >
                            Parse Clipboard
                        </button>

                        {parsedItems.length > 0 && (
                            <div className="bg-gray-950/80 p-2 border border-gray-850 rounded-lg space-y-2">
                                <div className="text-[10px] text-minion-400 font-bold flex justify-between items-center">
                                    <span>Parsed {parsedItems.length} lines:</span>
                                    <button
                                        onClick={handleImportParsedItems}
                                        className="text-green-400 hover:text-green-300 font-bold cursor-pointer"
                                    >
                                        Add Selected
                                    </button>
                                </div>
                                <div className="max-h-32 overflow-auto space-y-1 custom-scrollbar">
                                    {parsedItems.map(item => (
                                        <label
                                            key={item.id}
                                            className={`flex items-center gap-2 p-1 rounded text-[10px] bg-gray-900 border border-gray-850 ${!item.selected ? 'opacity-40' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={item.selected}
                                                onChange={() => {
                                                    setParsedItems(prev => prev.map(p => p.id === item.id ? { ...p, selected: !p.selected } : p))
                                                }}
                                                className="rounded border-gray-700 accent-minion-500"
                                            />
                                            <span className="font-mono text-yellow-305">{item.partNumber}</span>
                                            <span className="text-gray-400 truncate flex-1">{item.nomenclature}</span>
                                            <span className="font-mono text-gray-500">x{item.qty}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Submit Action & Order Notes */}
                <div className="p-4 border-t border-gray-800 bg-gray-900/90 flex flex-col gap-3 shrink-0">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                            Order Notes / Special Instructions (Optional)
                        </label>
                        <textarea
                            rows={2}
                            value={orderNotes}
                            onChange={e => setOrderNotes(e.target.value)}
                            placeholder="e.g., Need by 2 PM, AOG, Deliver to Hangar 3..."
                            className="w-full bg-gray-950/80 border border-gray-800 rounded-lg p-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-minion-500 focus:ring-1 focus:ring-minion-500/30 font-sans custom-scrollbar resize-none"
                        />
                    </div>
                    <button
                        onClick={handleSubmitRequest}
                        disabled={draftItems.length === 0}
                        className="w-full bg-gradient-to-r from-minion-400 to-minion-600 hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed transition-all py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold text-black shadow-lg shadow-yellow-950/20 cursor-pointer text-xs"
                    >
                        <Send size={14} /> Submit Order
                    </button>
                </div>
            </div>

            {/* Float Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-[380px] px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-2.5 z-55 animate-fade-in ${toast.type === 'success' ? 'bg-green-600/20 border-green-500/30 text-green-400' : 'bg-red-600/20 border-red-500/30 text-red-400'}`}>
                    <Info size={14} />
                    <span className="text-[11px] font-semibold">{toast.message}</span>
                </div>
            )}
        </>
    )
}
