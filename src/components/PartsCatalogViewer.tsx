import { useState, useEffect, useRef } from 'react'

import {
    ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
    Square, Circle, Edit3, Type, Grid, Trash2,
    RefreshCw, ArrowLeft, ShoppingCart, Settings, ListTree, Pin, BookOpen, Search, Lock, Unlock, Library
} from 'lucide-react'
import { db, PDFAnnotation, RequestLineItem } from '../utils/db'
import DraftRequestDrawer from './DraftRequestDrawer'
import { getPdfFromIndexedDb, fetchMergedCatalogLibrary, addCatalogToLibrary, CatalogMetadata, DEFAULT_CATALOG } from '../utils/pdfStore'
import { extractIPCIndexBlocks, ParsedIndexBlock, ParsedItem } from '../utils/parser'
import { adminStore } from '../utils/adminStore'
import AdminPasswordModal from './AdminPasswordModal'
import CatalogLibraryModal from './CatalogLibraryModal'

type StagedParsedItem = ParsedItem & { selected: boolean }

// Normalized-coord text chunk (relative to page w/h at scale=1)
interface TextChunk { str: string; x: number; y: number; w: number; h: number }
// A visual line aggregated from chunks
interface TextLine { y: number; text: string; chunks: TextChunk[]; rects: { x: number; y: number; w: number; h: number }[] }
// An index item with line rects for highlight overlay
interface IndexItem { label: string; lines: TextLine[]; rects: { x: number; y: number; w: number; h: number }[] }

// Helper to extract page footer codes (e.g. 1A18, 1A18B) consistently from raw textContent items
function extractPageCodeFromContent(textContent: any): string {
    const items = textContent.items || []
    // Try joining with space first (normal case)
    const spaceJoined = items.map((it: any) => it.str || '').join(' ')
    const spaceMatches = spaceJoined.match(/\b(\d+[A-Z]\d+[A-Z]?)\b/g)
    if (spaceMatches && spaceMatches.length > 0) {
        return spaceMatches[spaceMatches.length - 1].toUpperCase()
    }
    // Fallback: join without spaces (handles PDFs that split tokens like '1A' + '18')
    const noSpaceJoined = items.map((it: any) => it.str || '').join('')
    const noSpaceMatches = noSpaceJoined.match(/(\d+[A-Z]\d+[A-Z]?)/g)
    if (noSpaceMatches && noSpaceMatches.length > 0) {
        return noSpaceMatches[noSpaceMatches.length - 1].toUpperCase()
    }
    return ''
}

// Live thumbnail component for floating figure preview
interface FigureThumbnailProps {
    pdfDoc: any
    pageNumber: number
    onClick: () => void
    title: string
}

function FigureThumbnail({ pdfDoc, pageNumber, onClick, title }: FigureThumbnailProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let active = true
        const renderThumb = async () => {
            if (!pdfDoc || !canvasRef.current) return
            setLoading(true)
            try {
                const page = await pdfDoc.getPage(pageNumber)
                const viewport = page.getViewport({ scale: 0.6 })
                const canvas = canvasRef.current
                if (!canvas) return
                
                canvas.width = viewport.width
                canvas.height = viewport.height
                
                const context = canvas.getContext('2d')
                if (!context) return
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                }
                await page.render(renderContext).promise
            } catch (err) {
                console.error('Error rendering thumbnail:', err)
            } finally {
                if (active) setLoading(false)
            }
        }
        
        renderThumb()
        return () => { active = false }
    }, [pdfDoc, pageNumber])

    return (
        <div 
            onClick={onClick}
            className="flex flex-col select-none h-full w-full justify-between cursor-pointer group"
        >
            <div className="text-[8px] font-bold text-minion-450 uppercase tracking-wider text-center truncate pb-1">
                {title || `Figure Page ${pageNumber}`}
            </div>
            
            <div className="relative bg-white rounded border border-gray-800 overflow-hidden flex items-center justify-center min-h-[100px]">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 z-10">
                        <RefreshCw className="animate-spin text-minion-500" size={12} />
                    </div>
                )}
                <canvas ref={canvasRef} className="block w-full h-auto" />
            </div>
            
            <div className="text-[7.5px] font-bold text-gray-500 text-center pt-1 group-hover:text-minion-400 transition-colors flex items-center justify-center gap-0.5 font-mono">
                <span>page {pageNumber}</span>
                <span>↗</span>
            </div>
        </div>
    )
}

// Live canvas component for large centered hover preview
interface LargeFigureCanvasProps {
    pdfDoc: any
    pageNumber: number
}

function LargeFigureCanvas({ pdfDoc, pageNumber }: LargeFigureCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let active = true
        const renderLarge = async () => {
            if (!pdfDoc || !canvasRef.current) return
            setLoading(true)
            try {
                const page = await pdfDoc.getPage(pageNumber)
                const baseViewport = page.getViewport({ scale: 1.0 })
                const renderScale = 1.5
                const viewport = page.getViewport({ scale: renderScale })
                const canvas = canvasRef.current
                if (!canvas) return
                
                canvas.width = viewport.width
                canvas.height = viewport.height
                // Set CSS size to base viewport so it scales up the resolution without blowing up the layout
                canvas.style.width = `${baseViewport.width}px`
                canvas.style.height = `${baseViewport.height}px`
                
                const context = canvas.getContext('2d')
                if (!context) return
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                }
                await page.render(renderContext).promise
            } catch (err) {
                console.error('Error rendering large preview:', err)
            } finally {
                if (active) setLoading(false)
            }
        }
        
        renderLarge()
        return () => { active = false }
    }, [pdfDoc, pageNumber])

    return (
        <div className="relative flex items-center justify-center p-1 bg-white select-none">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/40 z-10">
                    <RefreshCw className="animate-spin text-minion-500" size={24} />
                </div>
            )}
            <canvas ref={canvasRef} className="max-h-[80vh] max-w-[75vw] object-contain block shadow-md" />
        </div>
    )
}

function PageCarouselThumbnail({ pdfDoc, pageNum, active, onClick }: { pdfDoc: any, pageNum: number, active: boolean, onClick: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isVisible, setIsVisible] = useState(false)
    const [loading, setLoading] = useState(false)
    const [rendered, setRendered] = useState(false)

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true)
                observer.disconnect()
            }
        }, { rootMargin: '300px' })
        
        if (containerRef.current) observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        let isSubscribed = true
        if (isVisible && !rendered && pdfDoc) {
            const renderPage = async () => {
                setLoading(true)
                try {
                    const page = await pdfDoc.getPage(pageNum)
                    const viewport = page.getViewport({ scale: 0.3 })
                    const canvas = canvasRef.current
                    if (!canvas) return
                    canvas.width = viewport.width
                    canvas.height = viewport.height
                    const ctx = canvas.getContext('2d')
                    if (!ctx) return
                    await page.render({ canvasContext: ctx, viewport }).promise
                    if (isSubscribed) setRendered(true)
                } catch (e) {
                    console.error(e)
                } finally {
                    if (isSubscribed) setLoading(false)
                }
            }
            renderPage()
        }
        return () => { isSubscribed = false }
    }, [isVisible, rendered, pdfDoc, pageNum])

    return (
        <div 
            ref={containerRef}
            data-page={pageNum}
            onClick={onClick}
            className={`w-[130px] shrink-0 bg-white shadow cursor-pointer transition-all border-[3px] flex items-center justify-center relative min-h-[160px] ${active ? 'border-minion-500 z-10' : 'border-transparent hover:border-gray-500'}`}
        >
            <div className="absolute top-0 right-0 bg-gray-900/80 text-white text-[9.5px] px-2 py-0.5 rounded-bl font-mono z-10">
                {pageNum}
            </div>
            {loading && !rendered && <RefreshCw size={12} className="animate-spin text-gray-400 absolute z-10" />}
            <canvas ref={canvasRef} className={`w-full h-auto block object-contain transition-opacity duration-300 ${rendered ? 'opacity-100' : 'opacity-0'}`} />
        </div>
    )
}

// Helper component for auto-marquee scrolling text of dynamic length
interface AutoMarqueeTextProps {
    text: string
    width: number
    className?: string
    speed?: number
    hoverOnly?: boolean
}

const AutoMarqueeText = ({ text, width, className = '', speed = 8, hoverOnly = false }: AutoMarqueeTextProps) => {
    const textRef = useRef<HTMLSpanElement>(null)
    const [shouldAnimate, setShouldAnimate] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const [offset, setOffset] = useState(0)

    useEffect(() => {
        if (textRef.current) {
            const textWidth = textRef.current.scrollWidth
            if (textWidth > width) {
                setShouldAnimate(true)
                setOffset(textWidth - width)
            } else {
                setShouldAnimate(false)
                setOffset(0)
            }
        }
    }, [text, width])

    const active = shouldAnimate && offset > 0 && (!hoverOnly || isHovered)

    return (
        <span 
            className="inline-block overflow-hidden relative align-middle h-3.5 select-none animate-fade-in" 
            style={{ width }}
            onMouseEnter={() => hoverOnly && setIsHovered(true)}
            onMouseLeave={() => hoverOnly && setIsHovered(false)}
        >
            <span
                ref={textRef}
                className={`absolute left-0 whitespace-nowrap ${className}`}
                style={{
                    transform: 'translateX(0)',
                    animation: active
                        ? `auto-marquee-anim-${offset} ${Math.max(4, offset / speed)}s linear infinite alternate`
                        : 'none'
                }}
            >
                {text}
            </span>
            {active && (
                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes auto-marquee-anim-${offset} {
                        0%, 15% { transform: translateX(0); }
                        85%, 100% { transform: translateX(-${offset}px); }
                    }
                `}} />
            )}
        </span>
    )
}

// Recursive OutlineNode component for Chapter Outline tree
const OutlineNode = ({ item, doc, onJump, depth = 0, initiallyExpanded = false }: { item: any; doc: any; onJump: (dest: any) => void; depth: number; initiallyExpanded?: boolean }) => {
    const [expanded, setExpanded] = useState(initiallyExpanded)
    const hasItems = item.items && item.items.length > 0

    return (
        <div className="space-y-0.5">
            <div 
                onClick={async () => {
                    if (item.dest) {
                        onJump(item.dest)
                    } else if (hasItems) {
                        setExpanded(!expanded)
                    }
                }}
                className={`group flex items-center gap-1 px-1.5 py-1 rounded text-[11px] text-gray-400 hover:text-white hover:bg-gray-800/60 cursor-pointer transition-colors ${depth > 0 ? 'ml-2.5 border-l border-gray-800 pl-1.5' : ''}`}
            >
                {hasItems ? (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation()
                            setExpanded(!expanded)
                        }}
                        className="p-0.5 hover:bg-gray-705 rounded text-gray-500 hover:text-gray-300 flex items-center justify-center cursor-pointer"
                    >
                        <ChevronRight size={10} className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>
                ) : (
                    <span className="w-3.5" />
                )}
                <span className="truncate flex-1" title={item.title}>{item.title}</span>
            </div>
            {hasItems && expanded && (
                <div className="space-y-0.5">
                    {item.items.map((sub: any, idx: number) => (
                        <OutlineNode key={idx} item={sub} doc={doc} onJump={onJump} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}

interface PageTextItem {
    id: string
    text: string
    left: number
    top: number
    fontSize: number
    width: number
}

interface CatalogSaveProfile {
    id: string
    bindKeyword: string
    originFile: string
    updatedAt: string
}

export default function PartsCatalogViewer() {
    // Database & Sync Config
    const [dbConfig] = useState(db.getConfig())

    // Admin Mode & Catalog Library State
    const [isAdmin, setIsAdmin] = useState(adminStore.getIsUnlocked())
    const [showAdminModal, setShowAdminModal] = useState(false)
    const [showLibraryModal, setShowLibraryModal] = useState(false)

    useEffect(() => {
        const unsubscribe = adminStore.subscribe(() => {
            setIsAdmin(adminStore.getIsUnlocked())
        })
        return unsubscribe
    }, [])

    // PDF State
    const [pdfUrl, setPdfUrl] = useState<string>('sample-catalog.pdf')
    const [pdfName, setPdfName] = useState<string>(() => localStorage.getItem('minion_current_pdf_name') || 'sample-catalog.pdf')
    const [pdfDoc, setPdfDoc] = useState<any>(null)
    const [pageNumber, setPageNumber] = useState<number>(() => Number(localStorage.getItem('minion_current_page_number')) || 1)
    const [numPages, setNumPages] = useState<number>(0)
    const [scale, setScale] = useState<number>(1.2)
    const [pdfLoading, setPdfLoading] = useState<boolean>(false)

    // Settings & Save Profiles State
    const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false)
    const [currentPdfIdOverride, setCurrentPdfIdOverride] = useState<string | null>(() => localStorage.getItem('minion_active_pdf_id_override'))

    // Save Profiles Metadata Registry
    const [saveProfiles, setSaveProfiles] = useState<CatalogSaveProfile[]>(() => {
        const local = localStorage.getItem('minion_save_profiles')
        if (local) {
            try {
                const parsed = JSON.parse(local) as CatalogSaveProfile[]
                let migrated = false
                const next = parsed.map(p => {
                    if (p.bindKeyword === p.id && (p.id === 'sample-catalog' || p.id === 'PA28161-IPC')) {
                        migrated = true
                        return { ...p, bindKeyword: '' }
                    }
                    return p
                })
                if (migrated) {
                    localStorage.setItem('minion_save_profiles', JSON.stringify(next))
                }
                return next
            } catch (e) {
                console.error(e)
            }
        }
        const defaults: CatalogSaveProfile[] = [
            {
                id: 'sample-catalog',
                bindKeyword: '',
                originFile: 'sample-catalog.pdf',
                updatedAt: new Date().toISOString()
            },
            {
                id: 'PA28161-IPC',
                bindKeyword: '',
                originFile: 'PA28161-IPC.pdf',
                updatedAt: new Date().toISOString()
            }
        ]
        localStorage.setItem('minion_save_profiles', JSON.stringify(defaults))
        return defaults
    })

    // Profile Editing Form State
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
    const [editProfileName, setEditProfileName] = useState('')
    const [editBindKeyword, setEditBindKeyword] = useState('')
    const [editOriginFile, setEditOriginFile] = useState('')

    const getPdfId = (name: string) => {
        if (currentPdfIdOverride) return currentPdfIdOverride
        const match = saveProfiles.find(p => p.bindKeyword.trim() && name.includes(p.bindKeyword.trim()))
        if (match) {
            return match.id
        }
        return name.replace(/\.pdf$/i, '')
    }

    const handleStartEdit = (profile: CatalogSaveProfile) => {
        setEditingProfileId(profile.id)
        setEditProfileName(profile.id)
        setEditBindKeyword(profile.bindKeyword)
        setEditOriginFile(profile.originFile)
    }

    const handleSaveProfileChanges = async () => {
        if (!editingProfileId || !editProfileName.trim()) return

        const oldId = editingProfileId
        const newId = editProfileName.trim()
        const isActiveBefore = getPdfId(pdfName) === oldId

        if (oldId !== newId) {
            // Rename local storage keys
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && key.startsWith(`minion_anno_${oldId}_`)) {
                    const pageNum = key.split('_').pop()
                    const data = localStorage.getItem(key)
                    if (data) {
                        localStorage.setItem(`minion_anno_${newId}_${pageNum}`, data)
                        localStorage.removeItem(key)
                    }
                }
            }
            // Rename Supabase table pdf_id field
            await db.renamePdfId(oldId, newId)

            // If it was the active override, or was active before editing, update override key to keep it active
            if (isActiveBefore || currentPdfIdOverride === oldId) {
                localStorage.setItem('minion_active_pdf_id_override', newId)
                setCurrentPdfIdOverride(newId)
            }
        }

        // Update the profile in registry
        setSaveProfiles(prev => {
            let next
            const exists = prev.some(p => p.id === oldId)
            if (exists) {
                next = prev.map(p => {
                    if (p.id === oldId) {
                        return {
                            ...p,
                            id: newId,
                            bindKeyword: editBindKeyword.trim(),
                            originFile: editOriginFile,
                            updatedAt: new Date().toISOString()
                        }
                    }
                    return p
                })
            } else {
                const newProfile: CatalogSaveProfile = {
                    id: newId,
                    bindKeyword: editBindKeyword.trim(),
                    originFile: editOriginFile,
                    updatedAt: new Date().toISOString()
                }
                next = [...prev, newProfile]
            }
            localStorage.setItem('minion_save_profiles', JSON.stringify(next))
            return next
        })

        // If this profile is currently active, fetch annotations again
        const currentActiveKey = getPdfId(pdfName)
        if (currentActiveKey === oldId || currentActiveKey === newId) {
            setTimeout(() => fetchAnnotations(), 200)
        }

        setEditingProfileId(null)
        showToast('Save profile updated')
    }

    const handleDeleteProfile = async (profileId: string) => {
        if (profileId === 'sample-catalog') {
            showToast('Cannot delete default sample profile', 'error')
            return
        }

        if (!confirm(`Are you sure you want to delete the save profile "${profileId}"? This will delete all drawing notes and shapes.`)) {
            return
        }

        // Delete local annotations keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(`minion_anno_${profileId}_`)) {
                localStorage.removeItem(key)
            }
        }

        // Delete Supabase annotations rows
        await db.deleteAnnotationsForPdf(profileId)

        // Remove from registry
        setSaveProfiles(prev => {
            const next = prev.filter(p => p.id !== profileId)
            localStorage.setItem('minion_save_profiles', JSON.stringify(next))
            return next
        })

        // Reset override if it was this profile
        if (currentPdfIdOverride === profileId) {
            localStorage.removeItem('minion_active_pdf_id_override')
            setCurrentPdfIdOverride(null)
        }

        showToast('Profile deleted')
        setTimeout(() => fetchAnnotations(), 100)
    }

    const handleLoadProfile = (profileId: string) => {
        localStorage.setItem('minion_active_pdf_id_override', profileId)
        setCurrentPdfIdOverride(profileId)
        showToast(`Loaded save profile: ${profileId}`)
        setTimeout(() => fetchAnnotations(), 100)
    }

    const ensureProfileRegistered = (resolvedId: string) => {
        setSaveProfiles(prev => {
            if (!prev.some(p => p.id === resolvedId)) {
                const newProfile: CatalogSaveProfile = {
                    id: resolvedId,
                    bindKeyword: '',
                    originFile: pdfName,
                    updatedAt: new Date().toISOString()
                }
                const next = [...prev, newProfile]
                localStorage.setItem('minion_save_profiles', JSON.stringify(next))
                return next
            }
            return prev
        })
    }

    // Canvas/Overlay Dimensions
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

    // Drawing State
    const [tool, setTool] = useState<'select' | 'rect' | 'circle' | 'pen' | 'text' | 'part_box' | 'eraser' | 'index'>('select')
    const [color, setColor] = useState<string>('#ffcc00') // Minion yellow default
    const [thickness, setThickness] = useState<number>(3)
    const [annotations, setAnnotations] = useState<PDFAnnotation[]>([])
    const [isDrawing, setIsDrawing] = useState<boolean>(false)
    const [drawStart, setDrawStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [tempShape, setTempShape] = useState<PDFAnnotation | null>(null)
    const [currentPenPoints, setCurrentPenPoints] = useState<{ x: number; y: number }[]>([])

    // PDF Text / IPC Index Preview State
    const [pageTextItems, setPageTextItems] = useState<PageTextItem[]>([])
    const [indexItems, setIndexItems] = useState<IndexItem[]>([])
    const [indexBlocks, setIndexBlocks] = useState<ParsedIndexBlock[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const [stagedItems, setStagedItems] = useState<StagedParsedItem[]>([])
    const [pageRef, setPageRef] = useState<string>('')
    const [currentPageFigure, setCurrentPageFigure] = useState<string>('')
    const [pdfMetadata, setPdfMetadata] = useState<Record<string, number>>({})
    const [scanTrigger, setScanTrigger] = useState(0)
    const [scanStatus, setScanStatus] = useState<string>('idle')
    const [pageTexts, setPageTexts] = useState<Record<number, string>>({})
    const [sidebarTab, setSidebarTab] = useState<'outline' | 'search'>('outline')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<{ pageNum: number; snippet: string }[]>([])
    const [searchLoading, setSearchLoading] = useState(false)
    const pdfMetadataRef = useRef<Record<string, number>>({})
    const numPagesRef = useRef<number>(0)
    const pageNumberRef = useRef<number>(0)
    const indexBlocksRef = useRef<ParsedIndexBlock[]>([])
    const pendingJumpIndexRef = useRef<string | null>(null)
    const [pinnedIndices, setPinnedIndices] = useState<Record<number, string[]>>({})
    const [indexSelections, setIndexSelections] = useState<Record<number, Record<string, Record<string, boolean>>>>({})
    const indexSelectionsRef = useRef<Record<number, Record<string, Record<string, boolean>>>>({})
    useEffect(() => { indexSelectionsRef.current = indexSelections }, [indexSelections])
    const [showOutlineSidebar, setShowOutlineSidebar] = useState<boolean>(false)
    const [outlineItems, setOutlineItems] = useState<any[]>([])
    const [outlineMarkers, setOutlineMarkers] = useState<any[]>([])
    const [isFigHovered, setIsFigHovered] = useState<boolean>(false)
    const carouselRef = useRef<HTMLDivElement>(null)
    const isProgrammaticScrollRef = useRef<boolean>(false)
    const scrollEndTimeoutRef = useRef<any>(null)
    const lastScrollSyncedPageRef = useRef<number>(1)

    // Resizable figure preview width (persisted in localStorage)
    const [figPreviewWidth, setFigPreviewWidth] = useState<number>(() => {
        return Number(localStorage.getItem('minion_fig_preview_width') || '110')
    })
    const isResizingRef = useRef(false)

    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        isResizingRef.current = true
        document.addEventListener('mousemove', handleResizeMouseMove)
        document.addEventListener('mouseup', handleResizeMouseUp)
    }

    const handleResizeMouseMove = (e: MouseEvent) => {
        if (!isResizingRef.current) return
        setFigPreviewWidth(prev => {
            const next = Math.min(300, Math.max(85, prev + e.movementX))
            localStorage.setItem('minion_fig_preview_width', next.toString())
            return next
        })
    }

    const handleResizeMouseUp = () => {
        isResizingRef.current = false
        document.removeEventListener('mousemove', handleResizeMouseMove)
        document.removeEventListener('mouseup', handleResizeMouseUp)
    }

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleResizeMouseMove)
            document.removeEventListener('mouseup', handleResizeMouseUp)
        }
    }, [])

    const [canvasCenter, setCanvasCenter] = useState<{ x: number; y: number } | null>(null)

    useEffect(() => {
        if (!isFigHovered || !canvasRef.current) {
            setCanvasCenter(null)
            return
        }

        const updateCenter = () => {
            if (!canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            setCanvasCenter({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            })
        }

        updateCenter()
        
        const container = containerRef.current
        if (container) {
            container.addEventListener('scroll', updateCenter, { passive: true })
        }
        window.addEventListener('resize', updateCenter)

        return () => {
            if (container) {
                container.removeEventListener('scroll', updateCenter)
            }
            window.removeEventListener('resize', updateCenter)
        }
    }, [isFigHovered, pageNumber, scale, outlineMarkers])

    // Eraser Hover State
    const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null)

    // Sticky Note text popup state
    const [showTextModal, setShowTextModal] = useState(false)
    const [textModalData, setTextModalData] = useState<{ x: number; y: number } | null>(null)
    const [noteText, setNoteText] = useState('')

    // Part Box Dialog State
    const [showPartDialog, setShowPartDialog] = useState(false)
    const [partDialogData, setPartDialogData] = useState<{
        x: number
        y: number
        width: number
        height: number
        partNumber: string
        nomenclature: string
        qty: number
    } | null>(null)

    // Parts Draft Form State
    const [draftItems, setDraftItems] = useState<Omit<RequestLineItem, 'status'>[]>(() => {
        const local = localStorage.getItem('minion_draft_items')
        if (local) {
            try {
                return JSON.parse(local)
            } catch (e) {
                console.error(e)
            }
        }
        return []
    })

    // Collapsible drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(() => localStorage.getItem('minion_drawer_pinned') === 'true')
    const [draftCount, setDraftCount] = useState(0)
    const [isDrawerPinned, setIsDrawerPinned] = useState(() => localStorage.getItem('minion_drawer_pinned') === 'true')

    // Feedback Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ message, type })
        toastTimer.current = setTimeout(() => setToast(null), 3000)
    }

    // --- DRAFT ITEMS LOCAL STORAGE SYNC ---
    const syncDraftFromStorage = () => {
        const currentLocal = localStorage.getItem('minion_draft_items')
        if (currentLocal) {
            try {
                const parsed = JSON.parse(currentLocal)
                setDraftItems(parsed)
                setDraftCount(parsed.length)
            } catch (e) {
                console.error(e)
            }
        } else {
            setDraftItems([])
            setDraftCount(0)
        }
    }

    useEffect(() => {
        syncDraftFromStorage()

        const handlePinToggle = (e: Event) => {
            const pinned = (e as CustomEvent).detail.isPinned
            setIsDrawerPinned(pinned)
            if (pinned) setIsDrawerOpen(true)
        }

        const handleDraftUpdate = (e: Event) => {
            if ((e as CustomEvent).detail?.sender !== 'catalog') {
                syncDraftFromStorage()
            }
        }

        window.addEventListener('minion_draft_update', handleDraftUpdate)
        window.addEventListener('focus', syncDraftFromStorage)
        window.addEventListener('minion_drawer_pin_toggle', handlePinToggle)
        return () => {
            window.removeEventListener('minion_draft_update', handleDraftUpdate)
            window.removeEventListener('focus', syncDraftFromStorage)
            window.removeEventListener('minion_drawer_pin_toggle', handlePinToggle)
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('minion_draft_items', JSON.stringify(draftItems))
        setDraftCount(draftItems.length)
        // Dispatch window event so drawer updates instantly
        window.dispatchEvent(new CustomEvent('minion_draft_update', { detail: { sender: 'catalog' } }))
    }, [draftItems])

    // Restore stored PDF from Cloud / IndexedDB on page load
    useEffect(() => {
        const loadStoredPdf = async () => {
            const storedName = localStorage.getItem('minion_current_pdf_name') || DEFAULT_CATALOG.id
            try {
                // Check if catalog exists in merged catalog library with a cloud pdf_url
                const library = await fetchMergedCatalogLibrary()
                const match = library.find((c: CatalogMetadata) => c.id === storedName)

                if (match?.pdf_url) {
                    setPdfUrl(`${match.pdf_url}?t=${Date.now()}`)
                    setPdfName(match.id)
                    return
                }

                const storedBlob = await getPdfFromIndexedDb(storedName)
                if (storedBlob) {
                    const url = URL.createObjectURL(storedBlob)
                    setPdfUrl(url)
                    setPdfName(storedName)
                } else {
                    setPdfUrl('sample-catalog.pdf')
                    setPdfName(DEFAULT_CATALOG.id)
                }
            } catch (err) {
                console.error('Failed to load PDF:', err)
            }
        }
        loadStoredPdf()
    }, [])

    useEffect(() => {
        localStorage.setItem('minion_current_page_number', String(pageNumber))
    }, [pageNumber])

    // --- PDF.js LOADING & RENDERING ---
    useEffect(() => {
        const loadPdf = async () => {
            const pdfjsLib = (window as any).pdfjsLib
            if (!pdfjsLib) {
                console.error('PDF.js not loaded from CDN')
                return
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

            setPdfLoading(true)
            try {
                let doc: any = null

                // 1. Try local IndexedDB ArrayBuffer first (Instant, 100% reliable for local updates)
                if (pdfName && pdfName !== DEFAULT_CATALOG.id) {
                    try {
                        const localBlob = await getPdfFromIndexedDb(pdfName)
                        if (localBlob) {
                            const buffer = await localBlob.arrayBuffer()
                            doc = await pdfjsLib.getDocument({ data: buffer }).promise
                        }
                    } catch (e) {
                        console.warn('IndexedDB blob read notice:', e)
                    }
                }

                // 2. Try fetching pdfUrl as ArrayBuffer from Cloud
                if (!doc && pdfUrl) {
                    if (pdfUrl.startsWith('data:') || pdfUrl.startsWith('blob:') || pdfUrl === 'sample-catalog.pdf') {
                        doc = await pdfjsLib.getDocument(pdfUrl).promise
                    } else {
                        // Strip any query strings before fetch if needed, use cache reload
                        const cleanUrl = pdfUrl.split('#')[0]
                        const response = await fetch(cleanUrl, { cache: 'reload' })
                        if (response.ok) {
                            const buffer = await response.arrayBuffer()
                            doc = await pdfjsLib.getDocument({ data: buffer }).promise
                        }
                    }
                }

                // 3. Fallback to default sample catalog
                if (!doc) {
                    doc = await pdfjsLib.getDocument('sample-catalog.pdf').promise
                }

                setPdfDoc(doc)
                setNumPages(doc.numPages)
                setPageNumber(prev => Math.min(doc.numPages, Math.max(1, prev)))
            } catch (err) {
                console.error('Failed to load PDF:', err)
                showToast('Failed to load parts catalog PDF', 'error')
            } finally {
                setPdfLoading(false)
            }
        }
        loadPdf()
    }, [pdfUrl, pdfName])

    // Background metadata scanner: maps figure outlines and page footers to physical page numbers
    useEffect(() => {
        if (!pdfDoc || !pdfName) return
        const pdfId = getPdfId(pdfName)

        // Only use cache if it has actual keys (skip empty {} from failed past scans)
        const cached = localStorage.getItem(`pdf_metadata_v3_${pdfId}`)
        if (cached && scanTrigger === 0) {
            try {
                const parsed = JSON.parse(cached)
                if (Object.keys(parsed).length > 0) {
                    setPdfMetadata(parsed)
                    setScanStatus(`cached: ${Object.keys(parsed).length} keys`)
                    return
                }
            } catch (e) {
                console.error(e)
            }
        }

        const scan = async () => {
            setScanStatus('scanning...')
            const codeMap: Record<string, number> = {}

            // Debug: log raw text from page 1 to understand PDF token format
            try {
                const pg1 = await pdfDoc.getPage(1)
                const pg1Text = await pg1.getTextContent()
                const sample = (pg1Text.items || []).map((it: any) => it.str || '').join(' ').slice(-200)
                console.log('[Scan] Page 1 last 200 chars of joined text:', sample)
                setScanStatus(`scanning... (pg1 sample: "${sample.slice(-60)}"`)
            } catch {}

            // 1. Scan outline figure bookmarks
            try {
                const outline = await pdfDoc.getOutline()
                const traverse = async (items: any[]) => {
                    for (const item of items) {
                        if (item.dest) {
                            try {
                                let destArray = item.dest
                                if (typeof destArray === 'string') {
                                    destArray = await pdfDoc.getDestination(destArray)
                                }
                                if (destArray && destArray[0]) {
                                    const pageRef = destArray[0]
                                    let pageNum = -1
                                    if (pageRef && typeof pageRef === 'object') {
                                        const pageIdx = await pdfDoc.getPageIndex(pageRef)
                                        pageNum = pageIdx + 1
                                    } else if (typeof pageRef === 'number') {
                                        pageNum = pageRef + 1
                                    }
                                    if (pageNum > 0) {
                                        const figM = item.title.match(/Figure\s+(\d+[-A-Za-z0-9]*)/i) || item.title.match(/Fig\.\s*(\d+[-A-Za-z0-9]*)/i)
                                        if (figM) {
                                            const figNumKey = figM[1].toLowerCase()
                                            codeMap[`fig-${figNumKey}`] = pageNum
                                            codeMap[`fig-title-${figNumKey}`] = item.title.trim()
                                        }
                                    }
                                }
                            } catch {}
                        }
                        if (item.items && item.items.length > 0) await traverse(item.items)
                    }
                }
                if (outline) await traverse(outline)
            } catch (e) {
                console.error('Outline fetch failed:', e)
            }

            // 2. Scan all pages for printed page codes
            const total = pdfDoc.numPages
            const batchSize = 15
            for (let i = 1; i <= total; i += batchSize) {
                const endPage = Math.min(total, i + batchSize - 1)
                const promises = []
                for (let p = i; p <= endPage; p++) {
                    promises.push((async (pageNum) => {
                        try {
                            const page = await pdfDoc.getPage(pageNum)
                            const textContent = await page.getTextContent()
                            const code = extractPageCodeFromContent(textContent)
                            if (code) codeMap[`pg-${code.toUpperCase()}`] = pageNum
                        } catch {}
                    })(p))
                }
                await Promise.all(promises)
            }

            localStorage.setItem(`pdf_metadata_v3_${pdfId}`, JSON.stringify(codeMap))
            const keyCount = Object.keys(codeMap).length
            console.log('[Scan] COMPLETED. Keys found:', keyCount, Object.keys(codeMap))
            setScanStatus(`done: ${keyCount} keys`)
            setPdfMetadata(codeMap)
        }

        scan()
    }, [pdfDoc, pdfName, scanTrigger])

    // Load outline tree for the sidebar outline panel
    useEffect(() => {
        if (!pdfDoc) {
            setOutlineItems([])
            return
        }
        const fetchOutline = async () => {
            try {
                const outline = await pdfDoc.getOutline()
                setOutlineItems(outline || [])
            } catch (e) {
                console.error('Failed to load outline:', e)
            }
        }
        fetchOutline()
    }, [pdfDoc])

    // Flatten outline bookmarks to map sections and figures to page numbers
    useEffect(() => {
        if (!pdfDoc || outlineItems.length === 0) {
            setOutlineMarkers([])
            return
        }

        const buildMarkers = async () => {
            const flattenOutline = async (items: any[], currentPath: string[] = [], depth = 0): Promise<any[]> => {
                let result: any[] = []
                for (const item of items) {
                    let pageNum = -1
                    if (item.dest) {
                        try {
                            let destArray = item.dest
                            if (typeof destArray === 'string') {
                                destArray = await pdfDoc.getDestination(destArray)
                            }
                            if (destArray && destArray[0]) {
                                const pageRef = destArray[0]
                                if (pageRef && typeof pageRef === 'object') {
                                    const pageIdx = await pdfDoc.getPageIndex(pageRef)
                                    pageNum = pageIdx + 1
                                } else if (typeof pageRef === 'number') {
                                    pageNum = pageRef + 1
                                }
                            }
                        } catch {}
                    }

                    const nextPath = [...currentPath, item.title]
                    if (pageNum > 0) {
                        result.push({
                            page: pageNum,
                            title: item.title,
                            depth,
                            path: currentPath
                        })
                    }
                    if (item.items && item.items.length > 0) {
                        const sub = await flattenOutline(item.items, nextPath, depth + 1)
                        result = [...result, ...sub]
                    }
                }
                return result
            }

            const list = await flattenOutline(outlineItems)
            setOutlineMarkers(list)
        }

        buildMarkers()
    }, [pdfDoc, outlineItems])

    const getPageLocation = (pageNum: number) => {
        let bestMarker: any = null
        for (const m of outlineMarkers) {
            if (m.page <= pageNum) {
                if (!bestMarker || m.page >= bestMarker.page) {
                    bestMarker = m
                }
            }
        }

        if (!bestMarker) return { section: '', figure: '' }

        const fullPath = [...bestMarker.path, bestMarker.title]
        let figure = ''
        let section = ''
        for (const segment of fullPath) {
            if (/^(Figure|Fig\.)\s*/i.test(segment)) {
                figure = segment.replace(/^(Figure|Fig\.)\s*/i, 'FIG ')
            } else {
                section = segment
            }
        }
        return { section, figure }
    }

    // Search query indexing & matching debounced useEffect
    useEffect(() => {
        if (!searchQuery.trim() || !pdfDoc) {
            setSearchResults([])
            return
        }

        const runSearch = async () => {
            setSearchLoading(true)
            const q = searchQuery.toLowerCase()
            const results: { pageNum: number; snippet: string }[] = []

            // Lazily parse pages text content if not already indexed in memory
            let currentTexts = pageTexts
            if (Object.keys(currentTexts).length === 0) {
                const total = pdfDoc.numPages
                const textsMap: Record<number, string> = {}
                const batchSize = 15
                for (let i = 1; i <= total; i += batchSize) {
                    const endPage = Math.min(total, i + batchSize - 1)
                    const promises = []
                    for (let p = i; p <= endPage; p++) {
                        promises.push((async (pageNum) => {
                            try {
                                const page = await pdfDoc.getPage(pageNum)
                                const textContent = await page.getTextContent()
                                textsMap[pageNum] = textContent.items.map((it: any) => it.str || '').join(' ')
                            } catch {}
                        })(p))
                    }
                    await Promise.all(promises)
                }
                setPageTexts(textsMap)
                currentTexts = textsMap
            }

            // Loop matches and extract padding preview snippet
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                const text = currentTexts[pageNum] || ''
                const idx = text.toLowerCase().indexOf(q)
                if (idx >= 0) {
                    const start = Math.max(0, idx - 35)
                    const end = Math.min(text.length, idx + q.length + 35)
                    let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
                    if (start > 0) snippet = '...' + snippet
                    if (end < text.length) snippet = snippet + '...'
                    results.push({ pageNum, snippet })
                }
            }

            setSearchResults(results)
            setSearchLoading(false)
        }

        const timer = setTimeout(runSearch, 300)
        return () => clearTimeout(timer)
    }, [searchQuery, pageTexts, pdfDoc])

    // Keep refs always in sync with latest state so the jump handler never has stale closures
    useEffect(() => { pdfMetadataRef.current = pdfMetadata }, [pdfMetadata])
    useEffect(() => { numPagesRef.current = numPages }, [numPages])
    useEffect(() => { pageNumberRef.current = pageNumber }, [pageNumber])
    useEffect(() => { indexBlocksRef.current = indexBlocks }, [indexBlocks])

    const prevPageRef = useRef(pageNumber)
    useEffect(() => {
        const oldPage = prevPageRef.current
        if (oldPage !== pageNumber) {
            setIndexSelections(prev => {
                const pageMap = prev[oldPage]
                if (!pageMap) return prev
                const pins = pinnedIndices[oldPage] || []
                const newPageMap: Record<string, Record<string, boolean>> = {}
                let changed = false
                Object.keys(pageMap).forEach(label => {
                    if (pins.includes(label)) {
                        newPageMap[label] = pageMap[label]
                    } else {
                        changed = true
                    }
                })
                if (!changed) return prev
                return { ...prev, [oldPage]: newPageMap }
            })
            prevPageRef.current = pageNumber
        }
    }, [pageNumber, pinnedIndices])

    // Event listener for drawer chip click jump commands (registered once per pdfDoc load)
    useEffect(() => {
        const handleJump = async (e: Event) => {
            const { type, value, group } = (e as CustomEvent).detail
            if (!pdfDoc) return

            const curPage = pageNumberRef.current
            const totalPages = numPagesRef.current
            const blocks = indexBlocksRef.current

            // Read metadata directly from localStorage - this is always up to date
            // regardless of React state/ref timing. Try all pdf_metadata_v3_ keys.
            let meta: Record<string, number> = {}
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i)
                if (k && k.startsWith('pdf_metadata_v3_')) {
                    try {
                        const parsed = JSON.parse(localStorage.getItem(k) || '{}')
                        meta = { ...meta, ...parsed }
                    } catch {}
                }
            }
            // Merge in any in-memory ref data too
            meta = { ...meta, ...pdfMetadataRef.current }

            console.log('[Jump] type:', type, 'value:', value, 'group:', group)
            console.log('[Jump] all localStorage pdf_metadata keys:', Object.keys(localStorage).filter(k => k.startsWith('pdf_metadata')))
            console.log('[Jump] merged meta keys (', Object.keys(meta).length, '):', Object.keys(meta).slice(0, 20))

            let targetPage = -1

            if (type === 'fig') {
                const page = meta[`fig-${value.toLowerCase()}`]
                if (page) targetPage = page
            } else if (type === 'pg') {
                const page = meta[`pg-${value.toUpperCase()}`]
                if (page) targetPage = page
            } else if (type === 'idx') {
                // Extract the page code from the group string: e.g. "fig. 1 | -14a pg. 1A17"
                const match = group.match(/pg\.\s*([^\s|]+)/i)
                if (match) {
                    const pageCode = match[1].toUpperCase()
                    const page = meta[`pg-${pageCode}`]
                    console.log('[Jump] idx page code:', pageCode, '-> page:', page)
                    if (page) targetPage = page
                }
            }

            if (targetPage > 0 && targetPage <= totalPages) {
                if (targetPage === curPage) {
                    if (type === 'idx') {
                        setTool('index')
                        const foundIdx = blocks.findIndex(b => b.label.toLowerCase() === value.toLowerCase())
                        if (foundIdx >= 0) {
                            setActiveIndex(foundIdx)
                            setStagedItems(blocks[foundIdx]?.items.map((item: ParsedItem) => ({ ...item, selected: true })) || [])
                        }
                    }
                } else {
                    setPageNumber(targetPage)
                    showToast(`Jumped to Page ${targetPage}`)
                    if (type === 'idx') {
                        setTool('index')
                        pendingJumpIndexRef.current = value
                    }
                }
            } else {
                console.warn('[Jump] FAILED. type:', type, 'value:', value, '| merged meta keys:', Object.keys(meta))
                showToast(`Could not locate target for ${type}: ${value}`, 'error')
            }
        }

        window.addEventListener('minion_jump_to_target', handleJump)
        return () => window.removeEventListener('minion_jump_to_target', handleJump)
    }, [pdfDoc])

    // Fetch annotations from DB/Sync
    const fetchAnnotations = async () => {
        if (!pdfName) return
        const pdfId = getPdfId(pdfName)
        const list = await db.getAnnotations(pdfId, pageNumber)
        setAnnotations(list)
    }

    useEffect(() => {
        fetchAnnotations()

        // Real-time subscription to annotations
        const unsubscribe = db.subscribeToAnnotations(() => {
            fetchAnnotations()
        })
        return () => unsubscribe()
    }, [pdfName, currentPdfIdOverride, saveProfiles, pageNumber])

    // Render Page
    useEffect(() => {
        const renderPage = async () => {
            if (!pdfDoc || !canvasRef.current) return

            try {
                const page = await pdfDoc.getPage(pageNumber)
                const viewport = page.getViewport({ scale })

                const canvas = canvasRef.current
                const context = canvas.getContext('2d')
                if (!context) return

                canvas.width = viewport.width
                canvas.height = viewport.height
                setDimensions({ width: viewport.width, height: viewport.height })

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                }
                await page.render(renderContext).promise

                const textContent = await page.getTextContent()
                // Display-scale text layer for selectable overlay
                const pdfjsLib = (window as any).pdfjsLib
                const textItems = textContent.items.map((item: any, index: number) => {
                    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
                    const fontH = Math.abs(tx[3]) || 8
                    return {
                        id: `text-${pageNumber}-${index}`,
                        text: item.str,
                        left: tx[4],
                        top: tx[5] - fontH,
                        fontSize: Math.max(8, fontH),
                        width: Math.max((item.width || 0) * scale, item.str.length * Math.max(5, fontH * 0.45))
                    }
                })
                setPageTextItems(textItems)

                // Scale-1 viewport for normalized highlight coords
                const baseVp = page.getViewport({ scale: 1 })
                const chunks: TextChunk[] = textContent.items
                    .filter((it: any) => (it.str || '').trim())
                    .map((it: any) => {
                        const tr = it.transform || [1, 0, 0, 1, 0, 0]
                        const h = Math.max(0.008, (Math.abs(tr[3]) || 8) / baseVp.height)
                        return {
                            str: it.str,
                            x: tr[4] / baseVp.width,
                            y: 1 - tr[5] / baseVp.height,
                            w: Math.max(0.002, (it.width || 0) / baseVp.width),
                            h
                        }
                    })

                // Group chunks into visual lines by Y proximity
                const lineMap: TextLine[] = []
                for (const c of chunks.slice().sort((a: TextChunk, b: TextChunk) => a.y - b.y || a.x - b.x)) {
                    let line = lineMap.find(l => Math.abs(l.y - c.y) < 0.006)
                    if (!line) { line = { y: c.y, text: '', chunks: [], rects: [] }; lineMap.push(line) }
                    line.chunks.push(c)
                }
                for (const l of lineMap) {
                    l.chunks.sort((a, b) => a.x - b.x)
                    l.text = l.chunks.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim()
                    const minX = Math.min(...l.chunks.map(c => c.x))
                    const maxX = Math.max(...l.chunks.map(c => c.x + c.w))
                    const minY = Math.min(...l.chunks.map(c => c.y - c.h * 0.85))
                    const maxY = Math.max(...l.chunks.map(c => c.y + c.h * 0.3))
                    l.rects = [{ x: Math.max(0, minX - 0.002), y: Math.max(0, minY), w: Math.min(0.98, maxX - minX + 0.004), h: Math.max(0.006, maxY - minY) }]
                }

                // Detect -### headers and build index items for highlight overlay
                // Matches true indexes only: -14a, -35A-1, or 2-14a figure-prefixed labels.
                // Does NOT match part numbers like 35641-006 or 400-441.
                const INDEX_HEADER_RE_LOCAL = /^(?:-(\d{1,4}[A-Za-z]?(?:-\d+)?)\b|\d{1,2}-(\d{1,4}[A-Za-z]?(?:-\d+)?)\b)/
                const FOOTER_RE_LOCAL = /^(When\s|Revised:|Figure\s|PIPER|PA-|AIRPLANE|Index\s|and\s+Part|Note:|NOTE:|\*\s*NOTE|\d+[A-Z]\d+[A-Z]?$)/i
                const hits: { label: string; lineIdx: number }[] = []
                lineMap.forEach((l, idx) => {
                    const m = l.text.match(INDEX_HEADER_RE_LOCAL)
                    if (m) hits.push({ label: `-${m[1] || m[2]}`, lineIdx: idx })
                })
                const newIndexItems: IndexItem[] = hits.map((h, i) => {
                    const next = hits[i + 1]
                    const end = next ? Math.max(h.lineIdx + 1, next.lineIdx) : lineMap.length
                    const itemLines = lineMap.slice(h.lineIdx, end).filter(l => !FOOTER_RE_LOCAL.test(l.text))
                    return { label: h.label, lines: itemLines, rects: itemLines.flatMap(l => l.rects) }
                })
                setIndexItems(newIndexItems)

                // Capture page reference/footer code (e.g. 1A18B, 1A22) for draft traceability.
                const pageRefCode = extractPageCodeFromContent(textContent)
                setPageRef(pageRefCode)

                // Find page figure number prefix
                let figNum = ''
                const FIG_PREFIX_RE = /^(\d{1,2})-(?:[A-Za-z\d]|\s|$)/
                for (const l of lineMap) {
                    const m = l.text.trim().match(FIG_PREFIX_RE)
                    if (m) {
                        figNum = m[1]
                        break
                    }
                }
                setCurrentPageFigure(figNum)

                // Build per-line plain text for the parser (preserving actual row boundaries)
                const plainText = lineMap.map(l => l.text).join('\n')
                const blocks = extractIPCIndexBlocks(plainText)
                setIndexBlocks(blocks)

                let activeIdx = 0
                if (pendingJumpIndexRef.current) {
                    const foundIdx = blocks.findIndex(b => b.label.toLowerCase() === pendingJumpIndexRef.current?.toLowerCase())
                    if (foundIdx >= 0) {
                        activeIdx = foundIdx
                    }
                    pendingJumpIndexRef.current = null
                }
                setActiveIndex(activeIdx)
                const initialBlock = blocks[activeIdx]
                if (initialBlock) {
                    const pageSelections = indexSelectionsRef.current[pageNumber]?.[initialBlock.label] || {}
                    setStagedItems(initialBlock.items.map((item: ParsedItem) => {
                        const savedSelected = pageSelections[item.partNumber]
                        const selected = savedSelected !== undefined ? savedSelected : true
                        return { ...item, selected }
                    }))
                } else {
                    setStagedItems([])
                }
            } catch (err) {
                console.error('Error rendering PDF page:', err)
            }
        }
        renderPage()
    }, [pdfDoc, pageNumber, scale])

    // --- MOUSE DRAWING HANDLERS ---
    const getRelativeCoords = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x_px = e.clientX - rect.left
        const y_px = e.clientY - rect.top
        return {
            x: Math.max(0, Math.min(1, x_px / dimensions.width)),
            y: Math.max(0, Math.min(1, y_px / dimensions.height))
        }
    }

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (tool === 'select' || tool === 'eraser' || tool === 'index') return
        e.preventDefault()

        const coords = getRelativeCoords(e)
        setIsDrawing(true)
        setDrawStart(coords)

        if (tool === 'pen') {
            setCurrentPenPoints([coords])
        }
    }

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isDrawing) return
        e.preventDefault()

        const coords = getRelativeCoords(e)

        if (tool === 'pen') {
            setCurrentPenPoints(prev => [...prev, coords])
            return
        }

        // Bounding Box calculations
        const x = Math.min(drawStart.x, coords.x)
        const y = Math.min(drawStart.y, coords.y)
        const width = Math.abs(drawStart.x - coords.x)
        const height = Math.abs(drawStart.y - coords.y)

        const temp: PDFAnnotation = {
            id: 'temp-shape',
            type: tool as any,
            pageNumber,
            color,
            thickness,
            x,
            y,
            width,
            height
        }

        setTempShape(temp)
    }

    const handleMouseUp = async (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isDrawing) return
        e.preventDefault()
        setIsDrawing(false)

        const coords = getRelativeCoords(e)
        const id = `anno-${Date.now()}-${Math.floor(Math.random() * 1000)}`

        let finalAnno: PDFAnnotation | null = null

        if (tool === 'pen') {
            if (currentPenPoints.length > 1) {
                finalAnno = {
                    id,
                    type: 'pen',
                    pageNumber,
                    color,
                    thickness,
                    points: currentPenPoints
                }
            }
            setCurrentPenPoints([])
        } else {
            const x = Math.min(drawStart.x, coords.x)
            const y = Math.min(drawStart.y, coords.y)
            const width = Math.abs(drawStart.x - coords.x)
            const height = Math.abs(drawStart.y - coords.y)

            // Minimum drag threshold
            if (width > 0.005 || height > 0.005) {
                if (tool === 'rect' || tool === 'circle') {
                    finalAnno = {
                        id,
                        type: tool,
                        pageNumber,
                        color,
                        thickness,
                        x,
                        y,
                        width,
                        height
                    }
                } else if (tool === 'text') {
                    setTextModalData({ x, y })
                    setShowTextModal(true)
                } else if (tool === 'part_box') {
                    setPartDialogData({
                        x,
                        y,
                        width,
                        height,
                        partNumber: '',
                        nomenclature: '',
                        qty: 1
                    })
                    setShowPartDialog(true)
                }
            }
        }

        setTempShape(null)

        if (finalAnno) {
            const updated = [...annotations, finalAnno]
            setAnnotations(updated)
            ensureProfileRegistered(getPdfId(pdfName))
            await db.saveAnnotations(getPdfId(pdfName), pageNumber, updated)
        }
    }

    const handleCarouselScroll = () => {
        if (isProgrammaticScrollRef.current) {
            if (scrollEndTimeoutRef.current) clearTimeout(scrollEndTimeoutRef.current)
            scrollEndTimeoutRef.current = setTimeout(() => {
                isProgrammaticScrollRef.current = false
            }, 100)
            return
        }

        if (!carouselRef.current) return
        const container = carouselRef.current
        const containerCenter = container.getBoundingClientRect().top + container.clientHeight / 2
        
        let closestPage = pageNumber
        let minDistance = Infinity
        
        const children = Array.from(container.children) as HTMLElement[]
        children.forEach(child => {
            const pageNumAttr = child.getAttribute('data-page')
            if (!pageNumAttr) return
            const childRect = child.getBoundingClientRect()
            const childCenter = childRect.top + childRect.height / 2
            const dist = Math.abs(childCenter - containerCenter)
            if (dist < minDistance) {
                minDistance = dist
                closestPage = Number(pageNumAttr)
            }
        })
        
        if (closestPage !== pageNumber) {
            lastScrollSyncedPageRef.current = closestPage
            setPageNumber(closestPage)
        }
    }

    const handleThumbnailClick = (clickedPage: number) => {
        setPageNumber(clickedPage)
        // Auto-scroll will be handled by the useEffect below
    }

    // Scroll carousel to active page when changed externally (e.g. typing or prev/next)
    useEffect(() => {
        if (pageNumber === lastScrollSyncedPageRef.current) return // Scroll was initiated by the carousel itself

        if (!carouselRef.current) return
        const container = carouselRef.current
        const activeChild = container.querySelector(`[data-page="${pageNumber}"]`) as HTMLElement
        if (activeChild) {
            // Lock out scroll listener for the duration of the scroll
            isProgrammaticScrollRef.current = true
            if (scrollEndTimeoutRef.current) clearTimeout(scrollEndTimeoutRef.current)
            scrollEndTimeoutRef.current = setTimeout(() => {
                isProgrammaticScrollRef.current = false
            }, 200)

            const targetScrollTop = activeChild.offsetTop - container.offsetTop - container.clientHeight / 2 + activeChild.clientHeight / 2
            const distance = Math.abs(container.scrollTop - targetScrollTop)

            container.scrollTo({
                top: targetScrollTop,
                behavior: distance > 1000 ? 'auto' : 'smooth'
            })
        }
    }, [pageNumber])

    const toggleStagedItemSelection = (itemId: string, partNumber: string, checked: boolean) => {
        setStagedItems(prev => prev.map(row => row.id === itemId ? { ...row, selected: checked } : row))
        const activeLabel = indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label
        if (activeLabel) {
            setIndexSelections(prev => {
                const pageMap = prev[pageNumber] || {}
                const indexMap = pageMap[activeLabel] || {}
                return {
                    ...prev,
                    [pageNumber]: {
                        ...pageMap,
                        [activeLabel]: {
                            ...indexMap,
                            [partNumber]: checked
                        }
                    }
                }
            })
        }
    }

    const selectIndexBlock = (nextIndex: number) => {
        const source = indexBlocks.length > 0 ? indexBlocks : []
        if (source.length === 0 && indexItems.length === 0) return
        const count = Math.max(source.length, indexItems.length)
        const bounded = Math.max(0, Math.min(count - 1, nextIndex))

        // Clean up selection of the current active index block if it's not pinned
        const currentLabel = indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label
        if (currentLabel && !(pinnedIndices[pageNumber] || []).includes(currentLabel)) {
            setIndexSelections(prev => {
                const pageMap = prev[pageNumber] || {}
                const { [currentLabel]: _, ...rest } = pageMap
                return { ...prev, [pageNumber]: rest }
            })
        }

        setActiveIndex(bounded)
        if (source.length > bounded) {
            const block = source[bounded]
            const pageSelections = indexSelections[pageNumber]?.[block.label] || {}
            setStagedItems(block.items.map(item => {
                const savedSelected = pageSelections[item.partNumber]
                const selected = savedSelected !== undefined ? savedSelected : true
                return { ...item, selected }
            }))
        }
    }

    const updateStagedQty = (id: string, value: string) => {
        setStagedItems(prev => prev.map(item => {
            if (item.id !== id) return item
            const qty = value.trim() === '' ? '' : (/^\d+$/.test(value) ? Number(value) : value)
            return { ...item, qty }
        }))
    }

    const togglePinIndex = (label: string) => {
        setPinnedIndices(prev => {
            const currentPins = prev[pageNumber] || []
            const nextPins = currentPins.includes(label)
                ? currentPins.filter(l => l !== label)
                : [...currentPins, label]
            return {
                ...prev,
                [pageNumber]: nextPins
            }
        })
    }

    const handleOutlineJump = async (dest: any) => {
        if (!pdfDoc) return
        try {
            let destArray = dest
            if (typeof destArray === 'string') {
                destArray = await pdfDoc.getDestination(destArray)
            }
            if (destArray && destArray[0]) {
                const pageRef = destArray[0]
                let pageNum = -1
                if (pageRef && typeof pageRef === 'object') {
                    const pageIdx = await pdfDoc.getPageIndex(pageRef)
                    pageNum = pageIdx + 1
                } else if (typeof pageRef === 'number') {
                    pageNum = pageRef + 1
                }
                
                if (pageNum > 0 && pageNum <= numPages) {
                    setPageNumber(pageNum)
                    showToast(`Jumped to Page ${pageNum}`)
                }
            }
        } catch (e) {
            console.error('Failed jumping from outline node:', e)
            showToast('Failed to resolve bookmark destination', 'error')
        }
    }

    const importStagedItemsToDraft = () => {
        const selected = stagedItems.filter(item => item.selected)
        if (selected.length === 0) {
            showToast('No index rows selected', 'error')
            return
        }
        const mapped = selected.map(item => {
            const sourceIndex = item.group || indexBlocks[activeIndex]?.label || `P.${pageNumber}`
            let sourceLocation = pageRef ? `${sourceIndex} pg. ${pageRef}` : sourceIndex
            if (currentPageFigure) {
                sourceLocation = `fig. ${currentPageFigure} | ${sourceLocation}`
            }
            return {
                id: `index-${Date.now()}-${Math.floor(Math.random() * 10000)}-${item.id}`,
                raw: item.raw,
                part_number: item.partNumber,
                nomenclature: item.nomenclature,
                qty: item.qty,
                original_qty: item.originalQty,
                qtyUnit: item.qtyUnit,
                group: sourceLocation
            }
        })
        setDraftItems(prev => [...prev, ...mapped])
        setIsDrawerOpen(true)
        showToast(`Added ${mapped.length} index parts to draft`)
    }

    // Save sticky note text
    const handleSaveNote = async () => {
        if (!textModalData || !noteText.trim()) {
            setShowTextModal(false)
            return
        }

        const id = `note-${Date.now()}`
        const note: PDFAnnotation = {
            id,
            type: 'text',
            pageNumber,
            color: '#ffcc00', // Yellow sticky note
            x: textModalData.x,
            y: textModalData.y,
            text: noteText.trim()
        }

        const updated = [...annotations, note]
        setAnnotations(updated)
        ensureProfileRegistered(getPdfId(pdfName))
        await db.saveAnnotations(getPdfId(pdfName), pageNumber, updated)

        setNoteText('')
        setTextModalData(null)
        setShowTextModal(false)
        setTool('select') // revert to pointer
    }

    // Save part box selection
    const handleSavePartBox = async () => {
        if (!partDialogData || !partDialogData.partNumber.trim()) {
            setShowPartDialog(false)
            return
        }

        const id = `part-box-${Date.now()}`
        const box: PDFAnnotation = {
            id,
            type: 'part_box',
            pageNumber,
            color: '#34c759', // Green for active requested parts
            x: partDialogData.x,
            y: partDialogData.y,
            width: partDialogData.width,
            height: partDialogData.height,
            text: partDialogData.partNumber.toUpperCase(),
            nomenclature: partDialogData.nomenclature || 'Direct catalog request',
            qty: partDialogData.qty
        }

        // Add to annotations
        const updated = [...annotations, box]
        setAnnotations(updated)
        ensureProfileRegistered(getPdfId(pdfName))
        await db.saveAnnotations(getPdfId(pdfName), pageNumber, updated)

        // Add item to draft items
        const newItem = {
            id: `line-${Date.now()}`,
            raw: `Catalog visual request page ${pageNumber}`,
            part_number: partDialogData.partNumber.toUpperCase(),
            nomenclature: partDialogData.nomenclature || 'Direct catalog request',
            qty: partDialogData.qty,
            original_qty: partDialogData.qty,
            group: `P.${pageNumber}`
        }

        setDraftItems(prev => [...prev, newItem])
        showToast(`Added Part ${newItem.part_number} to request draft`)

        setPartDialogData(null)
        setShowPartDialog(false)
        setTool('select') // revert to pointer
    }

    // Erase annotations
    const handleEraserClick = async (annoId: string) => {
        if (tool !== 'eraser') return

        const target = annotations.find(a => a.id === annoId)
        const updated = annotations.filter(a => a.id !== annoId)
        setAnnotations(updated)
        ensureProfileRegistered(getPdfId(pdfName))
        await db.saveAnnotations(getPdfId(pdfName), pageNumber, updated)

        // If it was a part box, remove it from draft requests too
        if (target && target.type === 'part_box') {
            setDraftItems(prev => prev.filter(i => i.part_number !== target.text))
        }

        showToast('Annotation removed')
    }



    // File Drag and Drop for PDF Catalog upload
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && file.type === 'application/pdf') {
            setPdfLoading(true)
            setPdfDoc(null)
            setPdfLoading(true)
            try {
                const meta = await addCatalogToLibrary(file)
                localStorage.setItem('minion_current_pdf_name', meta.id)
                localStorage.removeItem('minion_active_pdf_id_override')
                setCurrentPdfIdOverride(null)

                // Clear cached scan metadata for this catalog id
                localStorage.removeItem(`pdf_metadata_v3_${meta.id}`)

                const url = meta.pdf_url ? `${meta.pdf_url}?t=${Date.now()}` : URL.createObjectURL(file)
                setPdfUrl(`${url}#t=${Date.now()}`)
                setPdfName(meta.id)
                setPageNumber(1)
                showToast(`Uploaded & Loaded catalog: ${file.name}`)
            } catch (err) {
                console.error('Failed to save PDF:', err)
                showToast('Failed to upload PDF catalog', 'error')
            } finally {
                setPdfLoading(false)
                e.target.value = ''
            }
        }
    }

    // Resolve figure preview page
    let figPageNum = 0
    let figTitleText = ''
    
    // Find closest marker from current page number to left
    let bestMarkerForPage: any = null
    for (const m of outlineMarkers) {
        if (m.page <= pageNumber) {
            if (!bestMarkerForPage || m.page >= bestMarkerForPage.page) {
                bestMarkerForPage = m
            }
        }
    }
    
    if (bestMarkerForPage) {
        const fullPath = [...bestMarkerForPage.path, bestMarkerForPage.title]
        // Check if any segment is a figure outline bookmark
        for (const segment of fullPath) {
            if (/^(Figure|Fig\.)\s*/i.test(segment)) {
                figPageNum = bestMarkerForPage.page
                figTitleText = segment.replace(/^(Figure|Fig\.)\s*/i, 'FIG ')
                break
            }
        }
    }
    
    const showFigPreview = figPageNum > 0 && figPageNum !== pageNumber

    // Pinned index highlights + current active index highlight
    const overlaysToRender: { label: string; rects: { x: number; y: number; w: number; h: number }[] }[] = []
    const pagePins = pinnedIndices[pageNumber] || []
    const getFilteredRects = (item: IndexItem) => {
        const pageSelections = indexSelections[pageNumber]?.[item.label]
        if (!pageSelections) {
            return item.rects
        }
        
        const filteredRects: { x: number; y: number; w: number; h: number }[] = []
        let currentPartChecked = true
        item.lines.forEach(l => {
            const matchingPart = Object.keys(pageSelections).find(partNo => 
                l.text.includes(partNo)
            )
            if (matchingPart !== undefined) {
                currentPartChecked = pageSelections[matchingPart]
            }
            if (currentPartChecked) {
                filteredRects.push(...l.rects)
            }
        })
        return filteredRects
    }

    pagePins.forEach(pinLabel => {
        const item = indexItems.find(it => it.label === pinLabel)
        // Render it if it exists and is not currently the active highlight in index tool mode
        if (item && (tool !== 'index' || item.label !== indexItems[activeIndex]?.label)) {
            overlaysToRender.push({ label: item.label, rects: getFilteredRects(item) })
        }
    })
    if (tool === 'index' && indexItems[activeIndex]) {
        overlaysToRender.push({ label: indexItems[activeIndex].label, rects: getFilteredRects(indexItems[activeIndex]) })
    }

    return (
        <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden font-sans">
            {/* Header */}
            <header className={`h-14 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between z-10 transition-all duration-300 ${isDrawerOpen && isDrawerPinned ? 'mr-[360px]' : ''}`}>
                <div className="flex items-center gap-3">
                    <a
                        href="#/launchpad"
                        onClick={() => console.log('Back button clicked! Hash:', window.location.hash)}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center z-30 relative"
                        title="Back to Launchpad"
                    >
                        <ArrowLeft size={18} />
                    </a>
                    <div className="h-4 w-px bg-gray-800" />
                    <h1 className="text-md font-bold text-minion-500 flex items-center gap-2">
                        MinionMP Parts Catalog Viewer
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-xs text-gray-550 flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${dbConfig.isCloud ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                        {dbConfig.isCloud ? 'Cloud Sync Active' : 'Local Storage Mode'}
                    </div>

                    <button
                        onClick={() => setShowLibraryModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-750 border border-gray-750 hover:border-gray-650 rounded-lg text-xs font-bold text-gray-200 transition-colors cursor-pointer"
                        title="Browse Catalog Library"
                    >
                        <Library size={14} className="text-minion-400" />
                        <span>Catalog Library</span>
                    </button>

                    <button
                        onClick={() => setIsDrawerOpen(true)}
                        className="relative flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-750 border border-gray-750 hover:border-gray-650 rounded-lg text-xs font-bold text-gray-200 transition-colors cursor-pointer"
                    >
                        <ShoppingCart size={14} className="text-minion-500" />
                        <span>View Draft</span>
                        {draftCount > 0 && (
                            <span className="bg-minion-500 text-black text-[9px] font-extrabold px-1.5 py-0.2 rounded-full leading-none">
                                {draftCount}
                            </span>
                        )}
                    </button>

                    {isAdmin && (
                        <label className="text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg cursor-pointer transition-colors animate-fade-in">
                            Upload Catalog PDF
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                    )}

                    <button
                        onClick={() => {
                            if (isAdmin) adminStore.lock()
                            else setShowAdminModal(true)
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            isAdmin
                                ? 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30'
                                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white hover:bg-gray-750'
                        }`}
                        title={isAdmin ? "Lock Admin Mode" : "Unlock Admin Mode"}
                    >
                        {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
                        <span>{isAdmin ? 'Admin' : 'Admin'}</span>
                    </button>

                    <button
                        onClick={() => setShowSettingsModal(true)}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-450 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                        title="Catalog Save Settings"
                    >
                        <Settings size={15} />
                    </button>
                </div>
            </header>

            {/* Main Area */}
            <div className={`flex-1 flex min-h-0 overflow-hidden transition-all duration-300 ${isDrawerOpen && isDrawerPinned ? 'mr-[360px]' : ''}`}>
                {/* Outline Sidebar */}
                <div 
                    className={`bg-gray-900 flex flex-col min-h-0 select-none shrink-0 transition-[width,border,opacity] duration-300 ease-in-out overflow-hidden ${showOutlineSidebar ? 'w-64 border-r border-gray-800 opacity-100' : 'w-0 border-r-0 border-transparent opacity-0'}`}
                >
                    <div className="w-64 flex flex-col h-full min-h-0">
                        {/* Tab Selector */}
                        <div className="flex border-b border-gray-800 shrink-0">
                            <button
                                onClick={() => setSidebarTab('outline')}
                                className={`flex-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                                    sidebarTab === 'outline'
                                        ? 'border-minion-500 text-minion-400 bg-gray-850/30 font-black'
                                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-850/10'
                                }`}
                            >
                                <BookOpen size={12} /> Outline
                            </button>
                            <button
                                onClick={() => setSidebarTab('search')}
                                className={`flex-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                                    sidebarTab === 'search'
                                        ? 'border-minion-500 text-minion-400 bg-gray-850/30 font-black'
                                        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-850/10'
                                }`}
                            >
                                <Search size={12} /> Search
                            </button>
                        </div>

                        {/* Outline Tab Content */}
                        <div className={`flex-1 overflow-auto p-2 custom-scrollbar space-y-1 ${sidebarTab !== 'outline' ? 'hidden' : ''}`}>
                            {outlineItems.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-550 font-sans">No outline/chapters found.</div>
                            ) : (
                                <div className="space-y-0.5 font-sans">
                                    {outlineItems.map((item, idx) => (
                                        <OutlineNode 
                                            key={idx} 
                                            item={item} 
                                            doc={pdfDoc} 
                                            onJump={handleOutlineJump} 
                                            depth={0} 
                                            initiallyExpanded={idx === 0} 
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Search Tab Content */}
                        <div className={`flex-1 flex flex-col min-h-0 p-2 space-y-2 ${sidebarTab !== 'search' ? 'hidden' : ''}`}>
                            <div className="relative shrink-0">
                                <input
                                    type="text"
                                    placeholder="Search catalog text..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 pl-7 text-[11px] text-gray-200 focus:ring-1 focus:ring-minion-500 focus:border-minion-500 outline-none placeholder-gray-600 font-sans"
                                />
                                <Search size={12} className="absolute left-2.5 top-2.5 text-gray-600" />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-2 p-0.5 text-gray-500 hover:text-white text-[10px] font-bold cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-auto custom-scrollbar space-y-1">
                                {searchLoading ? (
                                    <div className="py-8 text-center text-xs text-gray-555 flex flex-col items-center gap-2">
                                        <RefreshCw className="animate-spin text-minion-500" size={14} />
                                        <span>Searching catalog pages...</span>
                                    </div>
                                ) : searchQuery.trim() === '' ? (
                                    <div className="py-8 text-center text-xs text-gray-500 font-sans leading-relaxed px-4">
                                        Type a term above to search through the entire catalog.
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-red-400 font-sans">
                                        No matches found for "{searchQuery}"
                                    </div>
                                ) : (
                                    <div className="space-y-1 pr-1">
                                        <div className="text-[9px] font-bold text-gray-500 uppercase px-1 pb-1 font-mono">
                                            Found {searchResults.length} matches
                                        </div>
                                        {searchResults.map((res, idx) => {
                                            const pageKey = Object.keys(pdfMetadata).find(k => k.startsWith('pg-') && pdfMetadata[k] === res.pageNum)
                                            const pageCode = pageKey ? pageKey.replace(/^pg-/i, '') : ''
                                            const loc = getPageLocation(res.pageNum)

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        setPageNumber(res.pageNum)
                                                        showToast(`Jumped to Page ${res.pageNum}`)
                                                    }}
                                                    className={`p-2 rounded text-[11px] text-gray-400 hover:text-white hover:bg-gray-800/60 cursor-pointer transition-all border border-transparent hover:border-gray-850 space-y-1 ${
                                                        pageNumber === res.pageNum ? 'bg-gray-850 border-gray-800 text-minion-300' : ''
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1 font-mono text-[9px] font-bold text-gray-500 justify-between w-full select-none">
                                                        <span className="shrink-0">PAGE {res.pageNum}</span>
                                                        <span className="text-gray-800 shrink-0">|</span>
                                                        <AutoMarqueeText text={loc.section || 'General'} width={100} className="text-gray-400 font-bold" speed={6} />
                                                        <span className="text-gray-800 shrink-0">|</span>
                                                        <span className="text-minion-500/60 font-black shrink-0">
                                                            {pageCode ? `PG ${pageCode}` : `PG ${res.pageNum}`}
                                                        </span>
                                                    </div>

                                                    {loc.figure && (
                                                        <div className="pt-0.5 select-none">
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-minion-500/10 border border-minion-500/20 text-minion-450 text-[8.5px] font-bold">
                                                                <AutoMarqueeText text={loc.figure} width={200} className="text-minion-450 font-bold" hoverOnly={true} speed={10} />
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="leading-relaxed break-words font-sans text-gray-300 pt-0.5">
                                                        {res.snippet}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* PDF Viewer Pane */}
                <div className="flex-1 flex flex-col min-w-0 bg-gray-900 border-r border-gray-800 relative">
                    {/* Tool Bar */}
                    <div className="h-12 bg-gray-900/60 border-b border-gray-850 px-4 flex items-center justify-between select-none">
                        <div className="flex items-center gap-1 flex-1 justify-start">
                            {/* Navigation */}
                            <button
                                onClick={() => setShowOutlineSidebar(!showOutlineSidebar)}
                                className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center mr-1 ${
                                    showOutlineSidebar
                                        ? 'bg-minion-500 text-black font-bold'
                                        : 'hover:bg-gray-800 text-gray-400 hover:text-white'
                                }`}
                                title="Toggle Chapters / Figures Sidebar"
                            >
                                <BookOpen size={15} />
                            </button>
                            <button
                                onClick={() => setPageNumber(prev => Math.max(1, prev - 1))}
                                disabled={pageNumber <= 1}
                                className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div className="flex items-center gap-1 text-xs text-gray-400 font-mono px-1">
                                <span>Page</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={numPages || 1}
                                    value={pageNumber}
                                    onChange={e => {
                                        const p = parseInt(e.target.value)
                                        if (p >= 1 && p <= numPages) {
                                            setPageNumber(p)
                                        }
                                    }}
                                    className="w-10 bg-gray-800 border border-gray-700 text-center text-minion-450 font-bold rounded py-0.5 outline-none focus:ring-1 focus:ring-minion-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span>/ {numPages}</span>
                            </div>
                            <button
                                onClick={() => setPageNumber(prev => Math.min(numPages, prev + 1))}
                                disabled={pageNumber >= numPages}
                                className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                                <ChevronRight size={16} />
                            </button>

                            <div className="h-4 w-px bg-gray-800 mx-2" />

                            {/* Scan status badge */}
                            <button
                                onClick={() => {
                                    for (let i = localStorage.length - 1; i >= 0; i--) {
                                        const k = localStorage.key(i)
                                        if (k && k.startsWith('pdf_metadata_v3_')) localStorage.removeItem(k)
                                    }
                                    setPdfMetadata({})
                                    pdfMetadataRef.current = {}
                                    setScanStatus('pending...')
                                    setScanTrigger(t => t + 1)
                                    showToast('Rescanning PDF metadata...')
                                }}
                                title={`Scan status: ${scanStatus}. Click to force rescan.`}
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                                    Object.keys(pdfMetadata).length > 0
                                        ? 'border-green-700 bg-green-900/20 text-green-500 hover:bg-green-900/40'
                                        : 'border-yellow-700 bg-yellow-900/20 text-yellow-500 hover:bg-yellow-900/40 animate-pulse'
                                }`}
                            >
                                {Object.keys(pdfMetadata).length > 0
                                    ? `✓ ${Object.keys(pdfMetadata).length} keys`
                                    : `⟳ ${scanStatus}`}
                            </button>

                            <div className="h-4 w-px bg-gray-800 mx-2" />

                            {/* Zoom */}
                            <button
                                onClick={() => setScale(prev => Math.max(0.6, prev - 0.15))}
                                className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white cursor-pointer"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <span className="text-xs text-gray-400 px-1 font-mono">{Math.round(scale * 100)}%</span>
                            <button
                                onClick={() => setScale(prev => Math.min(3, prev + 0.15))}
                                className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white cursor-pointer"
                            >
                                <ZoomIn size={16} />
                            </button>
                        </div>

                        {/* Drawing Tools */}
                        <div className="flex items-center gap-1 bg-gray-950/40 p-0.5 rounded-lg border border-gray-800">
                            <button
                                onClick={() => setTool('select')}
                                className={`px-2 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${tool === 'select' ? 'bg-minion-500 text-black font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Pointer (Select/Read)"
                            >
                                Pointer
                            </button>
                            <button
                                onClick={() => setTool('rect')}
                                className={`p-1.5 rounded cursor-pointer transition-colors ${tool === 'rect' ? 'bg-minion-500 text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Rectangle Tool"
                            >
                                <Square size={14} />
                            </button>
                            <button
                                onClick={() => setTool('circle')}
                                className={`p-1.5 rounded cursor-pointer transition-colors ${tool === 'circle' ? 'bg-minion-500 text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Circle Tool"
                            >
                                <Circle size={14} />
                            </button>
                            <button
                                onClick={() => setTool('pen')}
                                className={`p-1.5 rounded cursor-pointer transition-colors ${tool === 'pen' ? 'bg-minion-500 text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Pen Tool (Freehand)"
                            >
                                <Edit3 size={14} />
                            </button>
                            <button
                                onClick={() => setTool('text')}
                                className={`p-1.5 rounded cursor-pointer transition-colors ${tool === 'text' ? 'bg-minion-500 text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Sticky Note"
                            >
                                <Type size={14} />
                            </button>
                            <button
                                onClick={() => setTool('part_box')}
                                className={`px-2 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${tool === 'part_box' ? 'bg-minion-500 text-black font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Define Requested Part Bounding Box"
                            >
                                + Part Box
                            </button>
                            <button
                                onClick={() => { setTool('index'); selectIndexBlock(0) }}
                                className={`px-2 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${tool === 'index' ? 'bg-cyan-400 text-black font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                title="Index wheel selector"
                            >
                                <span className="inline-flex items-center gap-1"><ListTree size={13} /> Index</span>
                            </button>
                            <button
                                onClick={() => setTool('eraser')}
                                className={`p-1.5 rounded cursor-pointer transition-colors ${tool === 'eraser' ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-850 hover:text-red-400'}`}
                                title="Eraser (Delete shapes/notes)"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {/* Styles */}
                        <div className="flex items-center gap-3 flex-1 justify-end">
                            {/* Color Selector */}
                            <div className="flex items-center gap-1.5">
                                {['#ffcc00', '#ff3b30', '#007aff', '#34c759', '#af52de'].map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setColor(c)}
                                        className={`w-4 h-4 rounded-full border border-gray-600 transition-transform ${color === c ? 'scale-125 border-white ring-1 ring-minion-500' : 'hover:scale-110'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                            {/* Thickness */}
                            <select
                                value={thickness}
                                onChange={e => setThickness(Number(e.target.value))}
                                className="bg-gray-800 border border-gray-700 text-xs rounded px-1.5 py-0.5 outline-none text-gray-300"
                            >
                                <option value={1}>1px</option>
                                <option value={3}>3px</option>
                                <option value={5}>5px</option>
                                <option value={8}>8px</option>
                            </select>
                        </div>
                    </div>

                    {/* Viewport container */}
                    <div
                        ref={containerRef}
                        onWheel={tool === 'index' ? (e => { e.preventDefault(); selectIndexBlock(activeIndex + (e.deltaY > 0 ? 1 : -1)) }) : undefined}
                        className="flex-1 overflow-auto flex items-start justify-center p-4 relative custom-scrollbar bg-gray-900"
                    >
                        {pdfLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center flex-col gap-3">
                                <RefreshCw className="animate-spin text-minion-500" size={32} />
                                <span className="text-gray-400 text-xs">Loading PDF catalog...</span>
                            </div>
                        ) : (
                            <div className={`relative border border-gray-800 shadow-2xl bg-white ${tool === 'select' ? 'select-text' : 'select-none'}`}>
                                                          {/* Page Carousel floating to the left */}
                                <div 
                                    ref={carouselRef}
                                    onScroll={handleCarouselScroll}
                                    className="absolute right-full mr-4 top-0 bottom-0 w-[140px] overflow-y-auto custom-scrollbar flex flex-col items-center gap-3 z-10 pointer-events-auto"
                                >
                                    {pdfDoc && Array.from({ length: numPages }, (_, i) => (
                                        <PageCarouselThumbnail 
                                            key={i + 1} 
                                            pageNum={i + 1} 
                                            pdfDoc={pdfDoc} 
                                            active={pageNumber === i + 1}
                                            onClick={() => handleThumbnailClick(i + 1)}
                                        />
                                    ))}
                                </div>

                                                          {/* Figure Preview Thumbnail floating to the right */}
                                {showFigPreview && (
                                    <div 
                                        className="absolute left-full ml-4 top-0 hidden md:flex flex-col bg-gray-950/95 border border-gray-800/90 p-1.5 rounded-lg shadow-2xl cursor-pointer hover:border-minion-500/30 transition-colors pointer-events-auto" 
                                        style={{ zIndex: 10, width: `${figPreviewWidth}px`, height: `${figPreviewWidth * 1.35}px` }}
                                        onMouseEnter={() => setIsFigHovered(true)}
                                        onMouseLeave={() => setIsFigHovered(false)}
                                    >
                                        <FigureThumbnail
                                            pdfDoc={pdfDoc}
                                            pageNumber={figPageNum}
                                            onClick={() => {
                                                setPageNumber(figPageNum)
                                                showToast(`Jumped to Figure Illustration Page ${figPageNum}`)
                                            }}
                                            title={figTitleText}
                                        />

                                        {/* Drag Resize Handle on right edge */}
                                        <div 
                                            onMouseDown={handleResizeMouseDown}
                                            className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-minion-500/50 transition-colors z-20"
                                            title="Drag to resize preview thumbnail"
                                        />
                                    </div>
                                )}

                                <canvas ref={canvasRef} className="block" />

                                {/* Index highlight overlays — absolutely-positioned divs over line rects */}
                                {dimensions.width > 0 && overlaysToRender.map((overlay, oIdx) => (
                                    <div key={oIdx} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
                                        {overlay.rects.map((r, i) => (
                                            <div
                                                key={i}
                                                className="absolute"
                                                style={{
                                                    left: r.x * dimensions.width,
                                                    top: r.y * dimensions.height,
                                                    width: r.w * dimensions.width,
                                                    height: Math.max(r.h * dimensions.height, 3),
                                                    background: 'rgba(255, 210, 10, 0.35)',
                                                    borderRadius: 2,
                                                    mixBlendMode: 'multiply'
                                                }}
                                            />
                                        ))}
                                    </div>
                                ))}

                                {/* Search query highlight overlays */}
                                {searchQuery.trim().length > 1 && pageTextItems.length > 0 && dimensions.width > 0 && (
                                    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2.5 }}>
                                        {pageTextItems
                                            .filter(item => item.text.toLowerCase().includes(searchQuery.toLowerCase()))
                                            .map((item, idx) => (
                                                <div
                                                    key={`search-hl-${idx}`}
                                                    className="absolute"
                                                    style={{
                                                        left: item.left,
                                                        top: item.top - 1,
                                                        width: item.width + 2,
                                                        height: item.fontSize * 1.25,
                                                        background: 'rgba(245, 224, 80, 0.45)', // minion yellow
                                                        borderRadius: 2,
                                                        mixBlendMode: 'multiply',
                                                        border: '1px solid rgba(245, 224, 80, 0.55)'
                                                    }}
                                                />
                                            ))}
                                    </div>
                                )}

                                {/* Selectable text layer (pointer mode only) */}
                                {tool === 'select' && pageTextItems.length > 0 && (
                                    <div className="absolute inset-0 text-transparent select-text pointer-events-auto overflow-hidden" style={{ zIndex: 2 }} aria-label="Selectable PDF text layer">
                                        {pageTextItems.map(item => (
                                            <span
                                                key={item.id}
                                                className="absolute whitespace-pre select-text"
                                                style={{ left: item.left, top: item.top, fontSize: item.fontSize, width: item.width, lineHeight: 1, fontFamily: 'sans-serif' }}
                                            >
                                                {item.text}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Drawing SVG overlay */}
                                {dimensions.width > 0 && (
                                    <svg
                                        width={dimensions.width}
                                        height={dimensions.height}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        className={`absolute top-0 left-0 ${tool === 'select' ? 'pointer-events-none' : 'pointer-events-auto'}`}
                                        style={{ cursor: tool === 'select' ? 'text' : tool === 'index' ? 'ns-resize' : 'crosshair' }}
                                    >
                                        {/* Render Saved Annotations */}
                                        {annotations.map(anno => {
                                            const isHovered = tool === 'eraser' && hoveredAnnotationId === anno.id
                                            const strokeColor = isHovered ? '#ff453a' : anno.color
                                            const strokeWidth = isHovered ? (anno.thickness || 3) + 2 : (anno.thickness || 3)

                                            const handleClick = (e: React.MouseEvent) => {
                                                e.stopPropagation()
                                                if (tool === 'eraser') handleEraserClick(anno.id)
                                            }

                                            // Draw Rectangle
                                            if (anno.type === 'rect' && anno.x !== undefined) {
                                                return (
                                                    <rect
                                                        key={anno.id}
                                                        x={anno.x * dimensions.width}
                                                        y={anno.y! * dimensions.height}
                                                        width={anno.width! * dimensions.width}
                                                        height={anno.height! * dimensions.height}
                                                        stroke={strokeColor}
                                                        strokeWidth={strokeWidth}
                                                        fill="none"
                                                        onClick={handleClick}
                                                        onMouseEnter={() => tool === 'eraser' && setHoveredAnnotationId(anno.id)}
                                                        onMouseLeave={() => tool === 'eraser' && setHoveredAnnotationId(null)}
                                                        className={tool === 'eraser' ? 'hover:stroke-red-500 cursor-pointer pointer-events-auto' : 'pointer-events-none'}
                                                    />
                                                )
                                            }

                                            // Draw Circle
                                            if (anno.type === 'circle' && anno.x !== undefined) {
                                                const rx = (anno.width! * dimensions.width) / 2
                                                const ry = (anno.height! * dimensions.height) / 2
                                                const cx = (anno.x * dimensions.width) + rx
                                                const cy = (anno.y! * dimensions.height) + ry
                                                return (
                                                    <ellipse
                                                        key={anno.id}
                                                        cx={cx}
                                                        cy={cy}
                                                        rx={rx}
                                                        ry={ry}
                                                        stroke={strokeColor}
                                                        strokeWidth={strokeWidth}
                                                        fill="none"
                                                        onClick={handleClick}
                                                        onMouseEnter={() => tool === 'eraser' && setHoveredAnnotationId(anno.id)}
                                                        onMouseLeave={() => tool === 'eraser' && setHoveredAnnotationId(null)}
                                                        className={tool === 'eraser' ? 'hover:stroke-red-500 cursor-pointer pointer-events-auto' : 'pointer-events-none'}
                                                    />
                                                )
                                            }

                                            // Draw Pen line
                                            if (anno.type === 'pen' && anno.points) {
                                                const pts = anno.points
                                                    .map(p => `${p.x * dimensions.width},${p.y * dimensions.height}`)
                                                    .join(' ')
                                                return (
                                                    <polyline
                                                        key={anno.id}
                                                        points={pts}
                                                        stroke={strokeColor}
                                                        strokeWidth={strokeWidth}
                                                        fill="none"
                                                        onClick={handleClick}
                                                        onMouseEnter={() => tool === 'eraser' && setHoveredAnnotationId(anno.id)}
                                                        onMouseLeave={() => tool === 'eraser' && setHoveredAnnotationId(null)}
                                                        className={tool === 'eraser' ? 'hover:stroke-red-500 cursor-pointer pointer-events-auto' : 'pointer-events-none'}
                                                    />
                                                )
                                            }

                                            // Draw Sticky Note Text
                                            if (anno.type === 'text' && anno.x !== undefined) {
                                                const tx = anno.x * dimensions.width
                                                const ty = anno.y! * dimensions.height
                                                return (
                                                    <g
                                                        key={anno.id}
                                                        onClick={handleClick}
                                                        onMouseEnter={() => tool === 'eraser' && setHoveredAnnotationId(anno.id)}
                                                        onMouseLeave={() => tool === 'eraser' && setHoveredAnnotationId(null)}
                                                        className="pointer-events-auto cursor-pointer"
                                                    >
                                                        {/* Sticky Note Box */}
                                                        <rect
                                                            x={tx}
                                                            y={ty}
                                                            width={120}
                                                            height={50}
                                                            fill={isHovered ? '#ff453a' : '#ffe066'}
                                                            stroke="#cca300"
                                                            strokeWidth={1}
                                                            rx={3}
                                                            filter="drop-shadow(2px 2px 3px rgba(0,0,0,0.15))"
                                                        />
                                                        {/* Text snippet */}
                                                        <foreignObject x={tx + 4} y={ty + 4} width={112} height={42}>
                                                            <div className="text-[10px] text-gray-800 leading-tight font-sans overflow-hidden select-text">
                                                                {anno.text}
                                                            </div>
                                                        </foreignObject>
                                                    </g>
                                                )
                                            }

                                            // Draw Catalog Part Bounding Box
                                            if (anno.type === 'part_box' && anno.x !== undefined) {
                                                const px = anno.x * dimensions.width
                                                const py = anno.y! * dimensions.height
                                                const pw = anno.width! * dimensions.width
                                                const ph = anno.height! * dimensions.height
                                                const badgeW = Math.min(100, Math.max(50, anno.text!.length * 6.5 + 10))

                                                return (
                                                    <g
                                                        key={anno.id}
                                                        onClick={handleClick}
                                                        onMouseEnter={() => tool === 'eraser' && setHoveredAnnotationId(anno.id)}
                                                        onMouseLeave={() => tool === 'eraser' && setHoveredAnnotationId(null)}
                                                        className="pointer-events-auto cursor-pointer"
                                                    >
                                                        {/* Bounding outline */}
                                                        <rect
                                                            x={px}
                                                            y={py}
                                                            width={pw}
                                                            height={ph}
                                                            stroke={isHovered ? '#ff453a' : '#34c759'}
                                                            strokeWidth={1.5}
                                                            strokeDasharray="4,3"
                                                            fill="rgba(52, 199, 89, 0.05)"
                                                        />
                                                        {/* Part Tag Header */}
                                                        <rect
                                                            x={px}
                                                            y={py - 15}
                                                            width={badgeW}
                                                            height={15}
                                                            fill={isHovered ? '#ff453a' : '#34c759'}
                                                            rx={2}
                                                        />
                                                        <text
                                                            x={px + 4}
                                                            y={py - 4}
                                                            fill="white"
                                                            fontSize={9}
                                                            fontWeight="bold"
                                                            fontFamily="monospace"
                                                        >
                                                            {anno.text}
                                                        </text>
                                                    </g>
                                                )
                                            }

                                            return null
                                        })}

                                        {/* Render Temporary Drawing Path */}
                                        {isDrawing && tempShape && (
                                            <>
                                                {tempShape.type === 'rect' && (
                                                    <rect
                                                        x={tempShape.x! * dimensions.width}
                                                        y={tempShape.y! * dimensions.height}
                                                        width={tempShape.width! * dimensions.width}
                                                        height={tempShape.height! * dimensions.height}
                                                        stroke={color}
                                                        strokeWidth={thickness}
                                                        fill="none"
                                                    />
                                                )}
                                                {tempShape.type === 'circle' && (
                                                    <ellipse
                                                        cx={(tempShape.x! * dimensions.width) + ((tempShape.width! * dimensions.width) / 2)}
                                                        cy={(tempShape.y! * dimensions.height) + ((tempShape.height! * dimensions.height) / 2)}
                                                        rx={(tempShape.width! * dimensions.width) / 2}
                                                        ry={(tempShape.height! * dimensions.height) / 2}
                                                        stroke={color}
                                                        strokeWidth={thickness}
                                                        fill="none"
                                                    />
                                                )}
                                                {tempShape.type === 'part_box' && (
                                                    <rect
                                                        x={tempShape.x! * dimensions.width}
                                                        y={tempShape.y! * dimensions.height}
                                                        width={tempShape.width! * dimensions.width}
                                                        height={tempShape.height! * dimensions.height}
                                                        stroke="#34c759"
                                                        strokeWidth={1.5}
                                                        strokeDasharray="4,3"
                                                        fill="rgba(52, 199, 89, 0.05)"
                                                    />
                                                )}
                                            </>
                                        )}

                                        {/* Render Temporary Freehand Pen */}
                                        {isDrawing && tool === 'pen' && currentPenPoints.length > 0 && (
                                            <polyline
                                                points={currentPenPoints
                                                    .map(p => `${p.x * dimensions.width},${p.y * dimensions.height}`)
                                                    .join(' ')}
                                                stroke={color}
                                                strokeWidth={thickness}
                                                fill="none"
                                            />
                                        )}
                                    </svg>
                                )}
                            </div>
                        )}
                    </div>

                    {/* PDF Sticky Note Input Modal */}
                    {showTextModal && textModalData && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-45">
                            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-xl max-w-xs w-full">
                                <h4 className="text-xs font-bold text-gray-300 mb-2 uppercase tracking-wide">Add Sticky Note</h4>
                                <textarea
                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-minion-500 mb-3 h-20"
                                    placeholder="Type note message here..."
                                    value={noteText}
                                    onChange={e => setNoteText(e.target.value)}
                                    autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={handleSaveNote}
                                        className="bg-minion-500 hover:bg-minion-400 text-black text-xs font-bold px-3 py-1.5 rounded cursor-pointer"
                                    >
                                        Add
                                    </button>
                                    <button
                                        onClick={() => { setShowTextModal(false); setTextModalData(null); setNoteText('') }}
                                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PDF Bounding Box Part Identifier Modal */}
                    {showPartDialog && partDialogData && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-45 animate-fade-in">
                            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 shadow-2xl max-w-sm w-full">
                                <h4 className="text-sm font-bold text-minion-400 mb-3 flex items-center gap-1.5">
                                    <Grid size={18} />
                                    Identify Catalog Part Box
                                </h4>
                                <div className="space-y-3 mb-5">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Part Number (Required)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-minion-500 font-mono uppercase"
                                            placeholder="e.g. NAS6604-4"
                                            value={partDialogData.partNumber}
                                            onChange={e => setPartDialogData(prev => prev ? { ...prev, partNumber: e.target.value } : null)}
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Nomenclature / Description</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-minion-500"
                                            placeholder="e.g. BOLT, HEX"
                                            value={partDialogData.nomenclature}
                                            onChange={e => setPartDialogData(prev => prev ? { ...prev, nomenclature: e.target.value } : null)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24">
                                            <label className="block text-xs text-gray-400 mb-1">Qty</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-center text-gray-100 outline-none focus:ring-1 focus:ring-minion-500 font-mono"
                                                value={partDialogData.qty}
                                                onChange={e => setPartDialogData(prev => prev ? { ...prev, qty: Math.max(1, parseInt(e.target.value) || 1) } : null)}
                                            />
                                        </div>
                                        <div className="flex-1 pt-4 text-[10px] text-gray-500 leading-tight">
                                            This links the highlighted region on Page {pageNumber} to a request line.
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSavePartBox}
                                        disabled={!partDialogData.partNumber.trim()}
                                        className="flex-1 bg-minion-500 hover:bg-minion-400 disabled:opacity-50 text-black text-xs font-bold py-2 rounded transition-colors cursor-pointer"
                                    >
                                        Add to Request
                                    </button>
                                    <button
                                        onClick={() => { setShowPartDialog(false); setPartDialogData(null) }}
                                        className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                    {tool === 'index' && (
                        <div className={`fixed left-4 bottom-4 z-30 rounded-xl border border-gray-800 bg-gray-900 shadow-xl overflow-hidden animate-fade-in transition-all duration-300 ${isDrawerOpen && isDrawerPinned ? 'right-[376px]' : 'right-4'}`}>
                            {/* Header */}
                            <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-3 py-2">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-minion-400 flex items-center gap-1.5">
                                        <ListTree size={11} /> Index Preview
                                    </div>
                                    <div className="text-[9px] text-gray-500 mt-0.5">Scroll over PDF to cycle indexes ? edit qty &amp; uncheck before adding</div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="rounded border border-gray-700 bg-gray-850 px-2 py-1 text-[10px] font-bold text-gray-200 font-mono">
                                        {indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label || '—'} <span className="text-gray-500">{Math.max(indexItems.length, indexBlocks.length) ? `${activeIndex + 1}/${Math.max(indexItems.length, indexBlocks.length)}` : ''}</span>
                                    </span>
                                    {(indexItems[activeIndex] || indexBlocks[activeIndex]) && (
                                        <button
                                            onClick={() => togglePinIndex(indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label)}
                                            className={`p-1.5 rounded border transition-colors cursor-pointer flex items-center justify-center ${
                                                (pinnedIndices[pageNumber] || []).includes(indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label)
                                                    ? 'bg-minion-500 border-minion-600 text-black font-bold'
                                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-750'
                                            }`}
                                            title={(pinnedIndices[pageNumber] || []).includes(indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label) ? "Unpin highlight overlay" : "Pin highlight overlay"}
                                        >
                                            <Pin size={11} className={(pinnedIndices[pageNumber] || []).includes(indexItems[activeIndex]?.label || indexBlocks[activeIndex]?.label) ? "fill-black text-black" : ""} />
                                        </button>
                                    )}
                                    <button
                                        onClick={importStagedItemsToDraft}
                                        disabled={stagedItems.filter(i => i.selected).length === 0}
                                        className="rounded-md bg-minion-500 px-2.5 py-1.5 text-[10px] font-black text-black hover:bg-minion-400 disabled:opacity-40 transition-colors cursor-pointer"
                                    >
                                        Add to Draft
                                    </button>
                                </div>
                            </div>
                            {/* Part rows ? own scroll, don't intercept PDF wheel */}
                            <div className="max-h-32 overflow-auto custom-scrollbar p-2">
                                {stagedItems.length === 0 ? (
                                    <div className="rounded border border-dashed border-gray-700 p-3 text-center text-[10px] text-gray-400">No index parts parsed on this page.</div>
                                ) : (
                                    <table className="w-full text-[10px]" style={{ borderCollapse: 'separate', borderSpacing: '0 2px' }}>
                                        <thead>
                                            <tr className="text-gray-500">
                                                <th className="w-5 pb-1"></th>
                                                <th className="text-left pb-1 font-bold">Part #</th>
                                                <th className="text-left pb-1 font-bold pl-2">Description</th>
                                                <th className="text-right pb-1 font-bold pr-1 w-12">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stagedItems.map(item => (
                                                <tr key={item.id} className={item.selected ? 'opacity-100' : 'opacity-40'}>
                                                    <td className="pr-1">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.selected} 
                                                            onChange={e => toggleStagedItemSelection(item.id, item.partNumber, e.target.checked)} 
                                                            className="h-3 w-3 accent-minion-500" 
                                                        />
                                                    </td>
                                                    <td className="font-mono font-bold text-gray-100 pr-2 whitespace-nowrap">{item.partNumber}</td>
                                                    <td className="text-gray-300 truncate max-w-0 w-full" title={item.nomenclature}>{item.nomenclature}</td>
                                                    <td className="pl-2">
                                                        <input value={String(item.qty)} onChange={e => updateStagedQty(item.id, e.target.value)} className="w-11 rounded border border-gray-700 bg-gray-950 px-1 py-0.5 text-center font-mono text-[10px] text-minion-300 outline-none focus:border-minion-500" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}


            </div>

            {/* Catalog Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-left flex flex-col max-h-[90vh]">
                        
                        <div className="flex justify-between items-center border-b border-gray-750 pb-3 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-minion-450 uppercase tracking-wider flex items-center gap-2">
                                    <Settings size={16} /> Catalog Save Files Manager
                                </h3>
                                <p className="text-[10px] text-gray-405 mt-0.5">
                                    Manage your drawings, shapes, and sticky note profiles.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingProfileId(null)
                                    setShowSettingsModal(false)
                                }}
                                className="text-xs text-gray-400 hover:text-white cursor-pointer px-2 py-1 bg-gray-900 border border-gray-750 rounded transition-colors"
                            >
                                Close
                            </button>
                        </div>

                        {/* Current Active Banner */}
                        <div className="bg-gray-900 border border-gray-750 p-3 rounded-xl mb-4 flex justify-between items-center">
                            <div>
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">
                                    Currently Loaded Profile
                                </span>
                                <span className="text-xs font-mono font-bold text-minion-400 mt-0.5 block">
                                    {getPdfId(pdfName)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        const activeId = getPdfId(pdfName)
                                        const existing = saveProfiles.find(p => p.id === activeId)
                                        if (existing) {
                                            handleStartEdit(existing)
                                        } else {
                                            handleStartEdit({
                                                id: activeId,
                                                bindKeyword: '',
                                                originFile: pdfName,
                                                updatedAt: new Date().toISOString()
                                            })
                                        }
                                    }}
                                    className="px-2 py-1 bg-gray-800 hover:bg-gray-750 border border-gray-700 text-[10px] font-bold text-gray-250 rounded cursor-pointer transition-colors"
                                    title="Edit settings for this active save file"
                                >
                                    Edit Settings
                                </button>
                                {currentPdfIdOverride && (
                                    <button
                                        onClick={() => {
                                            localStorage.removeItem('minion_active_pdf_id_override')
                                            setCurrentPdfIdOverride(null)
                                            showToast('Reset to default file auto-detection')
                                            setTimeout(() => fetchAnnotations(), 100)
                                        }}
                                        className="text-[10px] text-amber-400 hover:underline cursor-pointer font-bold px-1 py-1"
                                    >
                                        Reset to Auto-Detect
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Editing Section */}
                        {editingProfileId ? (
                            <div className="bg-gray-855 p-4 border border-gray-700 rounded-xl space-y-3 mb-4 animate-fade-in">
                                <h4 className="text-[11px] font-bold text-minion-400 uppercase tracking-wide">
                                    Editing Profile: {editingProfileId}
                                </h4>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[9.5px] font-bold text-gray-405 uppercase block">Profile Name (Save Key)</label>
                                        <input
                                            type="text"
                                            value={editProfileName}
                                            onChange={e => setEditProfileName(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-200 font-mono outline-none focus:ring-1 focus:ring-minion-500"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9.5px] font-bold text-gray-405 uppercase block">Bind Keyword (Auto-load triggers)</label>
                                        <input
                                            type="text"
                                            value={editBindKeyword}
                                            onChange={e => setEditBindKeyword(e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-250 font-mono outline-none focus:ring-1 focus:ring-minion-500"
                                        />
                                        <span className="text-[8.5px] text-gray-500 block leading-tight">
                                            If uploaded filename contains this word, this profile will load automatically.
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[9.5px] font-bold text-gray-405 uppercase block">Original PDF Source (Origin)</label>
                                        <input
                                            type="text"
                                            value={editOriginFile}
                                            disabled
                                            className="w-full bg-gray-900/50 border border-gray-800 rounded px-2.5 py-1.5 text-xs text-gray-500 font-mono select-all cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleSaveProfileChanges}
                                        className="flex-1 bg-minion-500 hover:bg-minion-400 text-black font-bold text-xs py-1.5 rounded-lg cursor-pointer transition-colors"
                                    >
                                        Save Changes
                                    </button>
                                    <button
                                        onClick={() => setEditingProfileId(null)}
                                        className="px-3 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-1.5 rounded-lg cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto custom-scrollbar space-y-2 mb-2 pr-1">
                                <span className="text-[10px] font-bold text-gray-450 uppercase block tracking-wider mb-1">
                                    All Save Profiles ({saveProfiles.length})
                                </span>

                                {saveProfiles.map(profile => {
                                    const isActive = getPdfId(pdfName) === profile.id
                                    return (
                                        <div
                                            key={profile.id}
                                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${isActive ? 'bg-minion-500/5 border-minion-500/20' : 'bg-gray-850 border-gray-800 hover:border-gray-700'}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-bold text-gray-100 truncate">
                                                        {profile.id}
                                                    </span>
                                                    {isActive && (
                                                        <span className="bg-minion-500/10 text-minion-400 text-[8px] font-bold px-1.5 py-0.2 rounded border border-minion-500/20">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[9.5px] text-gray-450 truncate mt-1">
                                                    <span className="text-gray-500">Origin Attachment:</span> {profile.originFile}
                                                </div>
                                                <div className="text-[9.5px] text-gray-450 truncate mt-0.5">
                                                    <span className="text-gray-500">Bind Keyword:</span> <code className="bg-gray-900 px-1 py-0.2 rounded text-minion-400 font-mono text-[9px]">{profile.bindKeyword}</code>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {/* Load */}
                                                {!isActive && (
                                                    <button
                                                        onClick={() => handleLoadProfile(profile.id)}
                                                        className="px-2 py-1 bg-gray-905 hover:bg-gray-750 border border-gray-700 hover:border-gray-650 text-[10px] font-bold text-gray-300 rounded cursor-pointer transition-colors"
                                                        title="Load this profile"
                                                    >
                                                        Load
                                                    </button>
                                                )}
                                                {/* Edit */}
                                                <button
                                                    onClick={() => handleStartEdit(profile)}
                                                    className="p-1.5 bg-gray-905 hover:bg-gray-750 border border-gray-700 hover:border-gray-650 text-gray-400 hover:text-white rounded cursor-pointer transition-colors flex items-center justify-center"
                                                    title="Rename or edit details"
                                                >
                                                    <Edit3 size={11} />
                                                </button>
                                                {/* Delete */}
                                                {profile.id !== 'sample-catalog' && (
                                                    <button
                                                        onClick={() => handleDeleteProfile(profile.id)}
                                                        className="p-1.5 bg-gray-905 hover:bg-red-950 border border-gray-700 hover:border-red-900 text-gray-400 hover:text-red-400 rounded cursor-pointer transition-colors flex items-center justify-center"
                                                        title="Delete profile & drawings"
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        
                        <div className="pt-3 border-t border-gray-750 flex items-center justify-between text-[9px] text-gray-500 font-mono mt-2">
                            <span>* Sample profile cannot be deleted</span>
                            <span>MinionMP Save Manager</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Reusable Draft Drawer */}
            <DraftRequestDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

            {/* Figure Zoom Card — fixed overlay centered over the PDF canvas */}
            {isFigHovered && showFigPreview && canvasCenter && (
                <div
                    className="fixed z-[999] pointer-events-none flex flex-col bg-gray-950/98 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
                    style={{
                        left: `${canvasCenter.x}px`,
                        top: `${canvasCenter.y}px`,
                        transform: 'translate(-50%, -50%)',
                        width: 'fit-content',
                        height: 'fit-content',
                        maxWidth: '80vw',
                        maxHeight: '85vh',
                    }}
                >
                    <div className="text-[10px] font-mono font-bold text-minion-450 px-3 py-1.5 uppercase tracking-wider text-center border-b border-gray-800 select-none flex items-center justify-center gap-1.5 shrink-0 bg-gray-950">
                        <span>🔍</span>
                        <span>{figTitleText}</span>
                        <span className="text-gray-500 font-normal normal-case">(Illustration Page {figPageNum})</span>
                    </div>
                    <div className="flex-1 bg-white flex items-center justify-center min-h-0">
                        <LargeFigureCanvas pdfDoc={pdfDoc} pageNumber={figPageNum} />
                    </div>
                </div>
            )}

            {/* Admin Password Modal */}
            <AdminPasswordModal
                isOpen={showAdminModal}
                onClose={() => setShowAdminModal(false)}
            />

            {/* E-book Style Catalog Library Grid Modal */}
            <CatalogLibraryModal
                isOpen={showLibraryModal}
                activeCatalogId={pdfName}
                onClose={() => setShowLibraryModal(false)}
                onSelectCatalog={async (cat) => {
                    localStorage.setItem('minion_current_pdf_name', cat.id)
                    setPageNumber(1)
                    setPdfDoc(null) // Flush old PDF document from memory
                    localStorage.removeItem(`pdf_metadata_v3_${cat.id}`)

                    if (cat.pdf_url) {
                        setPdfUrl(`${cat.pdf_url}?t=${Date.now()}`)
                        setPdfName(cat.id)
                    } else {
                        const blob = await getPdfFromIndexedDb(cat.id)
                        if (blob) {
                            const url = URL.createObjectURL(blob)
                            setPdfUrl(`${url}#t=${Date.now()}`)
                            setPdfName(cat.id)
                        } else {
                            setPdfUrl('sample-catalog.pdf')
                            setPdfName(DEFAULT_CATALOG.id)
                        }
                    }
                    showToast(`Switched catalog to ${cat.name}`)
                }}
                onRequestAdminUnlock={() => setShowAdminModal(true)}
            />

            {/* Quick Feedback Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-2.5 z-50 animate-fade-in ${toast.type === 'success' ? 'bg-green-600/20 border-green-500/30 text-green-400' : 'bg-red-600/20 border-red-500/30 text-red-400'}`}>
                    <span className="text-xs font-semibold">{toast.message}</span>
                </div>
            )}
        </div>
    )
}


