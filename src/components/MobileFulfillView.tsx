import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { PackageCheck, CheckCircle2, Clock, XCircle, User, Plane, FileText, Check, RefreshCw, ArrowLeft, Send } from 'lucide-react'
import { db, PartsRequest, RequestLineItem } from '../utils/db'

export default function MobileFulfillView() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [request, setRequest] = useState<PartsRequest | null>(null)
    const [items, setItems] = useState<RequestLineItem[]>([])
    const [pickerName, setPickerName] = useState('')
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [toast, setToast] = useState<string | null>(null)

    useEffect(() => {
        const id = searchParams.get('id')
        const rawPayload = searchParams.get('payload')

        const loadOrder = async () => {
            // 1. Try decoding inline payload from QR link
            if (rawPayload) {
                try {
                    const decoded = JSON.parse(decodeURIComponent(escape(atob(rawPayload))))
                    setRequest(decoded)
                    setItems(decoded.items || [])
                    return
                } catch (e) {
                    console.error('Failed to parse URL payload:', e)
                }
            }

            // 2. Fallback to fetching request from DB/localStorage by ID
            if (id) {
                const reqs = await db.getRequests()
                const match = reqs.find(r => r.id === id || r.id.endsWith(id))
                if (match) {
                    setRequest(match)
                    setItems(match.items || [])
                }
            }
        }

        loadOrder()
    }, [searchParams])

    const handleStatusToggle = (itemId: string, status: 'Picked' | 'Backordered' | 'Out of Stock') => {
        setItems(prev => prev.map(item => {
            if (item.id !== itemId) return item
            const currentStatus = item.status === status ? 'New' : status
            return {
                ...item,
                status: currentStatus,
                filled_qty: currentStatus === 'Picked' ? (item.qty || 1) : 0
            }
        }))
    }

    const handleQtyChange = (itemId: string, delta: number) => {
        setItems(prev => prev.map(item => {
            if (item.id !== itemId) return item
            const curFilled = Number(item.filled_qty ?? (item.status === 'Picked' ? item.qty : 0))
            const newFilled = Math.max(0, curFilled + delta)
            return {
                ...item,
                filled_qty: newFilled,
                status: newFilled > 0 ? (newFilled >= Number(item.qty) ? 'Picked' : 'Partial Stock') : 'New'
            }
        }))
    }

    const handleFulfillSubmit = async () => {
        if (!request) return
        setIsSaving(true)

        const allPicked = items.every(i => i.status === 'Picked' || Number(i.filled_qty) >= Number(i.qty))
        const anyPicked = items.some(i => i.status === 'Picked' || Number(i.filled_qty) > 0)
        const newOverallStatus = allPicked ? 'Fulfilled' : anyPicked ? 'Partial Stock' : 'Processing'

        const updatedReq: PartsRequest = {
            ...request,
            status: newOverallStatus,
            items: items,
            notes: pickerName.trim() 
                ? `${request.notes ? request.notes + ' | ' : ''}Picked by ${pickerName.trim()} on ${new Date().toLocaleTimeString()}`
                : request.notes
        }

        const success = await db.updateRequest(updatedReq)
        setIsSaving(false)

        if (success) {
            setIsSubmitted(true)
            setToast('Order fulfillment updated successfully!')
        } else {
            setToast('Saved locally to device.')
            setIsSubmitted(true)
        }
    }

    if (!request) {
        return (
            <div className="min-h-screen bg-gray-950 text-white p-6 flex flex-col items-center justify-center text-center font-sans">
                <RefreshCw size={36} className="animate-spin text-minion-500 mb-4" />
                <h2 className="text-lg font-bold text-gray-200">Loading Order Details...</h2>
                <p className="text-xs text-gray-400 mt-2 max-w-xs">Reading QR code payload and fetching order requisition data.</p>
            </div>
        )
    }

    const pickedCount = items.filter(i => i.status === 'Picked' || Number(i.filled_qty) >= Number(i.qty)).length

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-sans pb-24">
            {/* Top Bar */}
            <header className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors cursor-pointer"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="text-xs font-black uppercase tracking-wider text-minion-400 flex items-center gap-1.5">
                            <PackageCheck size={16} /> Mobile Parts Fulfillment
                        </div>
                        <div className="text-[11px] font-mono text-gray-400 font-bold">Order #{request.id.slice(-5)}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                        request.status === 'Fulfilled' || isSubmitted
                            ? 'bg-green-500/20 text-green-400 border-green-500/40'
                            : 'bg-minion-500/20 text-minion-400 border-minion-500/40'
                    }`}>
                        {isSubmitted ? 'Fulfilled' : request.status}
                    </span>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-lg mx-auto p-4 space-y-4">
                {/* Order Information Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-xl space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-850">
                            <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                <Plane size={12} className="text-minion-400" /> Aircraft Tail
                            </span>
                            <span className="text-sm font-black text-white font-mono mt-0.5 block">{request.tail}</span>
                        </div>
                        <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-850">
                            <span className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                <User size={12} className="text-minion-400" /> Requesting Mechanic
                            </span>
                            <span className="text-sm font-bold text-gray-100 truncate mt-0.5 block">{request.mechanic}</span>
                        </div>
                    </div>

                    {request.discrepancy && (
                        <div className="bg-gray-950 p-2.5 rounded-xl border border-gray-850 text-xs">
                            <span className="text-[10px] font-bold text-gray-500 uppercase block">Discrepancy #</span>
                            <span className="text-xs font-semibold text-gray-200">{request.discrepancy}</span>
                        </div>
                    )}

                    {request.notes && (
                        <div className="bg-minion-500/10 border border-minion-500/30 p-2.5 rounded-xl text-xs text-minion-300 font-medium flex items-start gap-2">
                            <FileText size={14} className="shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block text-[10px] uppercase text-minion-400">Order Notes:</span>
                                <span>{request.notes}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Progress Indicator */}
                <div className="flex items-center justify-between text-xs font-bold px-1 text-gray-400">
                    <span>Parts Pick List ({pickedCount}/{items.length} Picked)</span>
                    <span className="text-minion-400 font-mono">{Math.round((pickedCount / Math.max(1, items.length)) * 100)}% Complete</span>
                </div>

                {/* Items Checklist */}
                <div className="space-y-3">
                    {items.map((item, idx) => {
                        const isPicked = item.status === 'Picked' || Number(item.filled_qty) >= Number(item.qty)
                        const isBackordered = item.status === 'Backordered'
                        const isOutOfStock = item.status === 'Out of Stock'

                        return (
                            <div
                                key={item.id || idx}
                                className={`bg-gray-900 border rounded-2xl p-4 shadow-md transition-all ${
                                    isPicked
                                        ? 'border-green-500/50 bg-green-950/10'
                                        : isBackordered
                                        ? 'border-yellow-500/50 bg-yellow-950/10'
                                        : isOutOfStock
                                        ? 'border-red-500/50 bg-red-950/10'
                                        : 'border-gray-800'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <div className="text-sm font-black font-mono text-white tracking-wide">{item.part_number}</div>
                                        <div className="text-xs text-gray-300 font-medium mt-0.5 line-clamp-2">{item.nomenclature || 'Standard Part'}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="flex items-center gap-1.5 bg-gray-950 px-2 py-1 rounded-lg border border-gray-800">
                                            <button onClick={() => handleQtyChange(item.id, -1)} className="w-5 h-5 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-black text-xs cursor-pointer">-</button>
                                            <span className="text-xs font-black text-minion-400 font-mono px-0.5">
                                                {item.filled_qty ?? (isPicked ? item.qty : 0)} / {item.qty}
                                            </span>
                                            <button onClick={() => handleQtyChange(item.id, 1)} className="w-5 h-5 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-black text-xs cursor-pointer">+</button>
                                        </div>
                                    </div>
                                </div>

                                {item.group && (
                                    <div className="text-[11px] text-gray-400 font-mono bg-gray-950/60 px-2 py-1 rounded-md border border-gray-850 inline-block mb-3">
                                        📍 Loc: {item.group}
                                    </div>
                                )}

                                {/* Action Buttons for Mobile Tapping */}
                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800/80">
                                    <button
                                        onClick={() => handleStatusToggle(item.id, 'Picked')}
                                        className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                            isPicked
                                                ? 'bg-green-500 text-black font-black shadow-md'
                                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                    >
                                        <CheckCircle2 size={14} />
                                        <span>Picked</span>
                                    </button>

                                    <button
                                        onClick={() => handleStatusToggle(item.id, 'Backordered')}
                                        className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                            isBackordered
                                                ? 'bg-yellow-500 text-black font-black shadow-md'
                                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                    >
                                        <Clock size={14} />
                                        <span>Backorder</span>
                                    </button>

                                    <button
                                        onClick={() => handleStatusToggle(item.id, 'Out of Stock')}
                                        className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                            isOutOfStock
                                                ? 'bg-red-500 text-white font-black shadow-md'
                                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                        }`}
                                    >
                                        <XCircle size={14} />
                                        <span>Out of Stock</span>
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Stockroom Picker Signature & Submit Form */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-xl space-y-3">
                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">
                        Parts Picker Name / Initials:
                    </label>
                    <input
                        type="text"
                        value={pickerName}
                        onChange={e => setPickerName(e.target.value)}
                        placeholder="e.g. J. Doe (Stockroom)"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-minion-500 focus:ring-1 focus:ring-minion-500/30"
                    />

                    <button
                        onClick={handleFulfillSubmit}
                        disabled={isSaving || isSubmitted}
                        className="w-full bg-minion-500 hover:bg-minion-400 active:scale-95 text-black font-black py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-minion-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                <span>Updating Order...</span>
                            </>
                        ) : isSubmitted ? (
                            <>
                                <Check size={16} />
                                <span>Order Fulfilled &amp; Updated!</span>
                            </>
                        ) : (
                            <>
                                <Send size={16} />
                                <span>Complete &amp; Submit Order</span>
                            </>
                        )}
                    </button>
                </div>
            </main>

            {/* Toast Float */}
            {toast && (
                <div className="fixed bottom-4 left-4 right-4 bg-green-500 text-black px-4 py-3 rounded-xl font-bold text-xs shadow-2xl flex items-center justify-between z-50 animate-fade-in">
                    <span>{toast}</span>
                    <button onClick={() => setToast(null)} className="text-black font-black">✕</button>
                </div>
            )}
        </div>
    )
}
