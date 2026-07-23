import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Plus, Minus, Check, ShoppingCart } from 'lucide-react'
import DraftRequestDrawer from './DraftRequestDrawer'

interface DiscoveryPart {
    partNumber: string
    nomenclature: string
    category: 'Fasteners' | 'Seals' | 'Fittings' | 'Electrical' | 'Cabin'
    description: string
    specs: string
    icon: React.ReactNode
}

export default function PartsDiscovery() {
    const navigate = useNavigate()
    const [searchQuery, setSearchQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState<string>('All')
    
    // Modal Details State
    const [selectedPart, setSelectedPart] = useState<DiscoveryPart | null>(null)
    const [requestQty, setRequestQty] = useState<number>(1)
    
    // Toast notification state
    const [toastMessage, setToastMessage] = useState<string | null>(null)

    // Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(() => localStorage.getItem('minion_drawer_pinned') === 'true')
    const [draftCount, setDraftCount] = useState(0)
    const [isDrawerPinned, setIsDrawerPinned] = useState(() => localStorage.getItem('minion_drawer_pinned') === 'true')

    const showToast = (msg: string) => {
        setToastMessage(msg)
        setTimeout(() => setToastMessage(null), 2500)
    }

    const updateDraftCount = () => {
        try {
            const rawDraft = localStorage.getItem('minion_draft_items')
            const draft = rawDraft ? JSON.parse(rawDraft) : []
            setDraftCount(draft.length)
        } catch (e) {
            setDraftCount(0)
        }
    }

    useEffect(() => {
        updateDraftCount()

        const handlePinToggle = (e: Event) => {
            const pinned = (e as CustomEvent).detail.isPinned
            setIsDrawerPinned(pinned)
            if (pinned) setIsDrawerOpen(true)
        }

        const handleDraftUpdate = (e: Event) => {
            if ((e as CustomEvent).detail?.sender !== 'discovery') {
                updateDraftCount()
            }
        }

        window.addEventListener('minion_draft_update', handleDraftUpdate)
        window.addEventListener('focus', updateDraftCount)
        window.addEventListener('minion_drawer_pin_toggle', handlePinToggle)
        return () => {
            window.removeEventListener('minion_draft_update', handleDraftUpdate)
            window.removeEventListener('focus', updateDraftCount)
            window.removeEventListener('minion_drawer_pin_toggle', handlePinToggle)
        }
    }, [])

    // Load and add to shared draft items in localStorage
    const handleAddPartToDraft = (part: DiscoveryPart, qty: number) => {
        try {
            const rawDraft = localStorage.getItem('minion_draft_items')
            const draft: any[] = rawDraft ? JSON.parse(rawDraft) : []

            const newItem = {
                id: `disc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                raw: `Discovery catalog selection: ${part.partNumber}`,
                part_number: part.partNumber,
                nomenclature: part.nomenclature,
                qty: qty,
                original_qty: qty,
                group: 'Discovery'
            }

            draft.push(newItem)
            localStorage.setItem('minion_draft_items', JSON.stringify(draft))
            // Dispatch update event to sync lists instantly
            window.dispatchEvent(new CustomEvent('minion_draft_update', { detail: { sender: 'discovery' } }))
            
            showToast(`Added ${qty}x ${part.partNumber} to request draft!`)
            setSelectedPart(null)
        } catch (e) {
            console.error('Failed to add part to draft:', e)
        }
    }

    const categories = ['All', 'Fasteners', 'Seals', 'Fittings', 'Electrical', 'Cabin']

    // Beautiful SVG icons representing the parts
    const partsData: DiscoveryPart[] = [
        {
            partNumber: 'AN3-10A',
            nomenclature: 'BOLT, MACHINE - HEX HEAD',
            category: 'Fasteners',
            description: 'Standard cadmium-plated steel aerospace structural hex bolt. 3/16 inch diameter, thread size 10-32, length 1-1/32 inches.',
            specs: 'Material: Alloy Steel | Coating: Cadmium Plated | Specs: MIL-B-6812',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="32,8 48,16 48,32 32,40 16,32 16,16" fill="rgba(245, 224, 80, 0.15)" stroke="#F5E050" />
                    <line x1="32" y1="40" x2="32" y2="58" stroke="#F5E050" strokeWidth="3" />
                    <line x1="26" y1="48" x2="38" y2="48" stroke="#F5E050" />
                    <line x1="26" y1="52" x2="38" y2="52" stroke="#F5E050" />
                    <line x1="26" y1="56" x2="38" y2="56" stroke="#F5E050" />
                </svg>
            )
        },
        {
            partNumber: 'AN4-12A',
            nomenclature: 'BOLT, MACHINE - HEX HEAD',
            category: 'Fasteners',
            description: 'Alloy steel structural hex bolt. 1/4 inch diameter, thread size 1/4-28, length 1-9/32 inches.',
            specs: 'Material: Alloy Steel | Coating: Cadmium Plated | Specs: AN4 Series',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="32,6 50,15 50,30 32,39 14,30 14,15" fill="rgba(245, 224, 80, 0.15)" stroke="#F5E050" />
                    <line x1="32" y1="39" x2="32" y2="60" stroke="#F5E050" strokeWidth="4" />
                    <line x1="24" y1="48" x2="40" y2="48" stroke="#F5E050" strokeWidth="2" />
                    <line x1="24" y1="53" x2="40" y2="53" stroke="#F5E050" strokeWidth="2" />
                </svg>
            )
        },
        {
            partNumber: 'MS20470AD4-4',
            nomenclature: 'RIVET, SOLID - UNIVERSAL HEAD',
            category: 'Fasteners',
            description: 'Aluminum alloy universal dome head solid rivet. 1/8 inch diameter, 1/4 inch length. Distinguishable by the dimple on the head.',
            specs: 'Material: 2117-T4 Aluminum | Head Type: Universal Dome | Specs: MS20470',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16,24 C16,14 48,14 48,24 Z" fill="rgba(245, 224, 80, 0.15)" stroke="#F5E050" />
                    <rect x="26" y="24" width="12" height="30" fill="rgba(245, 224, 80, 0.05)" stroke="#F5E050" />
                    <circle cx="32" cy="19" r="1.5" fill="#F5E050" />
                </svg>
            )
        },
        {
            partNumber: 'AN960-10',
            nomenclature: 'WASHER, FLAT - REGULAR',
            category: 'Fasteners',
            description: 'Flat washer used with #10 bolts to provide a smooth bearing surface and prevent damage to skin/structural members.',
            specs: 'Material: Carbon Steel | ID: 0.203 in | OD: 0.438 in | Thickness: 0.063 in',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="32" cy="32" r="22" fill="rgba(245, 224, 80, 0.15)" stroke="#F5E050" strokeWidth="3" />
                    <circle cx="32" cy="32" r="8" fill="#111827" stroke="#F5E050" strokeWidth="2" />
                </svg>
            )
        },
        {
            partNumber: 'MS28775-214',
            nomenclature: 'O-RING - SYNTHETIC RUBBER',
            category: 'Seals',
            description: 'Medium nitrile rubber O-ring for hydraulic systems and oil seals. Temperature range -65°F to 275°F.',
            specs: 'Material: Buna-N (Nitrile) | ID: 0.984 in | Cross Section: 0.139 in | MIL-G-5514',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="32" cy="32" r="20" stroke="#F5E050" strokeWidth="6" strokeLinecap="round" />
                    <circle cx="32" cy="32" r="19" stroke="#A69214" strokeWidth="1" />
                </svg>
            )
        },
        {
            partNumber: 'MS21919WDG6',
            nomenclature: 'CLAMP, LOOP - CUSHIONED',
            category: 'Fittings',
            description: 'Adel style cushioned support clamp for securing wires, conduits, and tubing. Features a chloroprene rubber cushion.',
            specs: 'Material: Aluminum Band | Cushion: Chloroprene Rubber | Size: 3/8 inch',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16,42 C12,30 20,16 34,16 C46,16 52,26 48,36 C46,42 38,44 32,44 C26,44 22,46 22,52 L40,52" stroke="#F5E050" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="40" cy="52" r="2" fill="white" />
                </svg>
            )
        },
        {
            partNumber: 'AE344301-6',
            nomenclature: 'HOSE ASSEMBLY - TEFLON MEDIUM PRESSURE',
            category: 'Fittings',
            description: 'Teflon inner tube hose reinforced with corrosion-resistant stainless steel wire braid. Designed for fuel and hydraulic fluids.',
            specs: 'Material: PTFE / SS Braid | Pressure Rating: 1500 PSI | Operating Temp: -65°F to 450°F',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="8" y="24" width="8" height="16" fill="rgba(245, 224, 80, 0.3)" stroke="#F5E050" rx="1" />
                    <rect x="16" y="26" width="32" height="12" fill="none" stroke="#F5E050" strokeWidth="2" strokeDasharray="3,2" />
                    <rect x="48" y="24" width="8" height="16" fill="rgba(245, 224, 80, 0.3)" stroke="#F5E050" rx="1" />
                </svg>
            )
        },
        {
            partNumber: 'W31-X2M1G-5',
            nomenclature: 'CIRCUIT BREAKER - PUSH/PULL',
            category: 'Electrical',
            description: 'Klixon style thermal circuit breaker with push/pull manual trip button. Provides overload protection for aviation electrical buses.',
            specs: 'Current: 5 Amp | Voltage: 28VDC / 120VAC | Mounting: Single Hole',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="18" y="26" width="28" height="26" fill="rgba(245, 224, 80, 0.1)" stroke="#F5E050" strokeWidth="2" rx="2" />
                    <rect x="27" y="10" width="10" height="16" fill="#F5E050" stroke="#F5E050" rx="1" />
                    <circle cx="32" cy="18" r="1.5" fill="black" />
                    <line x1="22" y1="36" x2="42" y2="36" stroke="#F5E050" />
                </svg>
            )
        },
        {
            partNumber: 'MS25036-156',
            nomenclature: 'TERMINAL, LUG - CRIMP STYLE RING',
            category: 'Electrical',
            description: 'Nylon insulated crimp terminal ring for 16-14 AWG wire. Features a tin-plated copper body with nylon sleeve insulation.',
            specs: 'Wire Range: 16-14 AWG | Stud Size: #10 | Color: Blue Insulation',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="42" cy="32" r="12" fill="rgba(0, 122, 255, 0.15)" stroke="#007aff" strokeWidth="3" />
                    <circle cx="42" cy="32" r="4" fill="#111827" stroke="#007aff" strokeWidth="1.5" />
                    <rect x="10" y="27" width="22" height="10" fill="rgba(0, 122, 255, 0.2)" stroke="#007aff" rx="1" />
                </svg>
            )
        },
        {
            partNumber: 'MS35058-22',
            nomenclature: 'SWITCH, TOGGLE - SPDT SEALED',
            category: 'Electrical',
            description: 'Environmentally sealed single-pole double-throw toggle switch with bat handle lever. Ideal for instrument panel cockpits.',
            specs: 'Circuitry: SPDT | Action: ON-OFF-ON | Rating: 15A 125VAC',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="16" y="32" width="32" height="22" fill="rgba(245, 224, 80, 0.1)" stroke="#F5E050" strokeWidth="2" rx="2" />
                    <path d="M32,32 L22,10" stroke="#F5E050" strokeWidth="5" strokeLinecap="round" />
                    <ellipse cx="22" cy="10" rx="3" ry="3" fill="#F5E050" />
                </svg>
            )
        },
        {
            partNumber: 'D-101-00',
            nomenclature: 'SOLDER SLEEVE - SHIELD TERMINATOR',
            category: 'Electrical',
            description: 'Heat shrinkable transparent PVDF sleeve containing pre-fluxed solder preform and thermoplastic sealing rings.',
            specs: 'Diameter: 0.170 in | Length: 0.65 in | Temp Rating: 150°C',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="10" y="25" width="44" height="14" rx="2" fill="rgba(255,255,255,0.05)" stroke="#F5E050" />
                    <rect x="24" y="26" width="16" height="12" fill="rgba(245, 224, 80, 0.4)" stroke="#F5E050" />
                    <circle cx="16" cy="32" r="3" fill="#ff3b30" />
                    <circle cx="48" cy="32" r="3" fill="#ff3b30" />
                </svg>
            )
        },
        {
            partNumber: 'DZUS-AJ5-45',
            nomenclature: 'FASTENER, COWL - STUD PANEL',
            category: 'Cabin',
            description: 'Dzus wing-head quick-release quarter-turn cowl fastener. Ideal for inspection panels and access cowling.',
            specs: 'Head Type: Wing | Shaft Diameter: 5/16 in | Length: 0.45 in',
            icon: (
                <svg className="w-16 h-16 text-minion-400" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="32" cy="24" r="14" fill="rgba(245, 224, 80, 0.15)" stroke="#F5E050" strokeWidth="2" />
                    <path d="M18,24 L46,24 M32,24 L32,48" stroke="#F5E050" strokeWidth="3" />
                    <path d="M22,48 C22,48 26,52 32,52 C38,52 42,48 42,48" stroke="#F5E050" strokeWidth="2" />
                </svg>
            )
        }
    ]

    const filteredParts = partsData.filter(part => {
        const matchesCategory = activeCategory === 'All' || part.category === activeCategory
        const matchesSearch = !searchQuery ||
            part.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            part.nomenclature.toLowerCase().includes(searchQuery.toLowerCase()) ||
            part.description.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
    })

    return (
        <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden font-sans">
            {/* Header */}
            <header className="h-14 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/launchpad')}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                        title="Back to Launchpad"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="h-4 w-px bg-gray-800" />
                    <h1 className="text-md font-bold text-minion-500 flex items-center gap-2">
                        MinionMP Parts Discovery
                    </h1>
                </div>

                <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="relative flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg text-xs font-bold text-gray-205 transition-colors cursor-pointer"
                >
                    <ShoppingCart size={14} className="text-minion-500" />
                    <span>View Draft Request</span>
                    {draftCount > 0 && (
                        <span className="bg-minion-500 text-black text-[9px] font-extrabold px-1.5 py-0.2 rounded-full leading-none">
                            {draftCount}
                        </span>
                    )}
                </button>
            </header>

            {/* Main Content Area (shifts when drawer is pinned & open) */}
            <div className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ${isDrawerOpen && isDrawerPinned ? 'mr-[360px]' : ''}`}>
                {/* Sub-header Navigation */}
                <div className="bg-gray-900/60 border-b border-gray-850 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
                {/* Category buttons */}
                <div className="flex gap-2 flex-wrap">
                    {categories.map(c => (
                        <button
                            key={c}
                            onClick={() => setActiveCategory(c)}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeCategory === c
                                ? 'bg-minion-500 text-black shadow-md font-bold'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-white'
                                }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-2.5 text-gray-500" size={16} />
                    <input
                        className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg text-xs outline-none focus:ring-1 focus:ring-minion-500 transition-colors"
                        placeholder="Search common parts..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Discovery Grid View */}
            <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-gray-900/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
                    {filteredParts.map(part => (
                        <div
                            key={part.partNumber}
                            onClick={() => { setSelectedPart(part); setRequestQty(1) }}
                            className="group bg-gray-850 hover:bg-gray-800 border border-gray-800 hover:border-minion-500/80 rounded-xl p-5 flex flex-col items-center gap-4 transition-all duration-300 hover:-translate-y-1 shadow-md hover:shadow-lg backdrop-blur-xs cursor-pointer"
                        >
                            <div className="bg-gray-900/70 p-4 rounded-xl group-hover:bg-minion-500/10 transition-colors duration-300">
                                {part.icon}
                            </div>
                            <div className="text-center w-full min-w-0">
                                <h3 className="text-xs font-mono font-bold text-minion-400 group-hover:text-minion-300 truncate mb-1">
                                    {part.partNumber}
                                </h3>
                                <h4 className="text-[11px] font-bold text-gray-200 truncate uppercase">
                                    {part.nomenclature}
                                </h4>
                                <span className="inline-block mt-2 px-2 py-0.5 text-[9px] font-medium bg-gray-900 text-gray-500 rounded">
                                    {part.category}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filteredParts.length === 0 && (
                        <div className="col-span-full py-16 text-center text-gray-600 text-sm">
                            No common hardware parts match your search.
                        </div>
                    )}
                </div>
            </div>

        {/* Quick Draft Checker Navigation Banner */}
            <div className="h-12 bg-gray-900 border-t border-gray-800 px-6 flex items-center justify-between text-xs text-gray-400 select-none">
                <span>Adding items here populates your draft request. Click the shopping cart button to manage or submit!</span>
                <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-minion-500/15 border border-minion-500/30 text-minion-400 hover:bg-minion-500/25 rounded-lg transition-colors font-bold cursor-pointer"
                >
                    <ShoppingCart size={13} />
                    <span>Open Draft Request Drawer</span>
                </button>
            </div>
            </div>

            {/* Part Detail Pop-up Modal */}
            {selectedPart && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <div className="flex justify-between items-start gap-4 mb-4">
                            <div className="bg-gray-900 p-3 rounded-xl">
                                {selectedPart.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="text-[10px] uppercase font-bold text-minion-500">{selectedPart.category}</span>
                                <h3 className="text-lg font-mono font-bold text-white uppercase truncate">{selectedPart.partNumber}</h3>
                                <h4 className="text-xs font-bold text-gray-300 leading-snug uppercase">{selectedPart.nomenclature}</h4>
                            </div>
                        </div>

                        <div className="bg-gray-900/60 rounded-xl p-3.5 border border-gray-750 mb-5 space-y-2 text-xs">
                            <p className="text-gray-300 leading-relaxed">{selectedPart.description}</p>
                            <p className="text-[10px] text-gray-550 font-mono border-t border-gray-800 pt-2">{selectedPart.specs}</p>
                        </div>

                        {/* Interactive Qty Picker */}
                        <div className="flex items-center justify-between gap-4 mb-6">
                            <span className="text-xs font-bold text-gray-450 uppercase">Order Quantity:</span>
                            <div className="flex items-center gap-2 bg-gray-900 border border-gray-750 rounded-lg p-1">
                                <button
                                    onClick={() => setRequestQty(prev => Math.max(1, prev - 1))}
                                    className="p-1 hover:bg-gray-800 text-gray-450 hover:text-white rounded transition-colors cursor-pointer"
                                >
                                    <Minus size={14} />
                                </button>
                                <input
                                    type="number"
                                    min={1}
                                    value={requestQty}
                                    onChange={e => setRequestQty(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-12 bg-transparent text-center font-mono font-bold text-sm outline-none text-minion-400"
                                />
                                <button
                                    onClick={() => setRequestQty(prev => prev + 1)}
                                    className="p-1 hover:bg-gray-800 text-gray-450 hover:text-white rounded transition-colors cursor-pointer"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => handleAddPartToDraft(selectedPart, requestQty)}
                                className="flex-1 bg-minion-500 hover:bg-minion-400 text-black font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Plus size={16} />
                                Add to Request Draft
                            </button>
                            <button
                                onClick={() => setSelectedPart(null)}
                                className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reusable Draft Drawer */}
            <DraftRequestDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

            {/* Quick success toast banner */}
            {toastMessage && (
                <div className="fixed bottom-16 right-6 bg-green-600/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 z-50 animate-fade-in">
                    <Check size={16} />
                    <span className="text-xs font-semibold">{toastMessage}</span>
                </div>
            )}
        </div>
    )
}
