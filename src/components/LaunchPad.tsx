import { useNavigate } from 'react-router-dom'
import { BookOpen, Compass, LayoutDashboard, Database, Lock, Unlock, Library } from 'lucide-react'
import { version } from '../../package.json'
import { useState, useEffect } from 'react'
import { db } from '../utils/db'
import { adminStore } from '../utils/adminStore'
import AdminPasswordModal from './AdminPasswordModal'
import CatalogLibraryModal from './CatalogLibraryModal'

export default function LaunchPad() {
    const navigate = useNavigate()
    const [showConfig, setShowConfig] = useState(false)
    const [showAdminModal, setShowAdminModal] = useState(false)
    const [showLibraryModal, setShowLibraryModal] = useState(false)
    const [isAdmin, setIsAdmin] = useState(adminStore.getIsUnlocked())
    const [activeCatalogId, setActiveCatalogId] = useState(() => localStorage.getItem('minion_current_pdf_name') || 'sample-catalog.pdf')

    const [supabaseUrl, setSupabaseUrl] = useState('')
    const [supabaseKey, setSupabaseKey] = useState('')
    const [dbConfig, setDbConfig] = useState(db.getConfig())

    useEffect(() => {
        const unsubscribe = adminStore.subscribe(() => {
            setIsAdmin(adminStore.getIsUnlocked())
        })
        return unsubscribe
    }, [])

    useEffect(() => {
        setSupabaseUrl(dbConfig.url)
        setSupabaseKey(dbConfig.key)
    }, [dbConfig])

    const handleSaveConfig = () => {
        db.setConfig(supabaseUrl, supabaseKey)
        setDbConfig(db.getConfig())
        setShowConfig(false)
        alert('Database sync settings updated!')
    }

    const handleClearConfig = () => {
        db.setConfig('', '')
        setSupabaseUrl('')
        setSupabaseKey('')
        setDbConfig(db.getConfig())
        setShowConfig(false)
        alert('Switched back to Local Storage mode.')
    }

    const handleToggleAdmin = () => {
        if (isAdmin) {
            adminStore.lock()
        } else {
            setShowAdminModal(true)
        }
    }

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8 select-none relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-minion-500/5 blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-500/5 blur-[120px]" />

            {/* Top Right Admin Lock Button */}
            <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
                <button
                    onClick={() => setShowLibraryModal(true)}
                    className="flex items-center gap-2 text-xs font-bold text-gray-300 hover:text-white px-3.5 py-2 bg-gray-800/80 hover:bg-gray-800 border border-gray-700/80 rounded-xl transition-all shadow-lg cursor-pointer"
                >
                    <Library size={15} className="text-minion-400" />
                    <span>Catalog Library</span>
                </button>

                <button
                    onClick={handleToggleAdmin}
                    className={`flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all shadow-lg cursor-pointer ${
                        isAdmin
                            ? 'bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30'
                            : 'bg-gray-800/80 text-gray-400 border-gray-700/80 hover:text-white hover:bg-gray-800'
                    }`}
                >
                    {isAdmin ? <Unlock size={15} /> : <Lock size={15} />}
                    <span>{isAdmin ? 'Admin Mode Active' : 'Admin Login'}</span>
                </button>
            </div>

            <div className="mb-10 text-center z-10">
                <h1 className="text-5xl font-extrabold bg-gradient-to-r from-minion-400 via-minion-500 to-minion-600 bg-clip-text text-transparent mb-3 tracking-tight">
                    MinionMP
                </h1>
                <p className="text-gray-400 text-lg">Parts Catalog Viewer & Manager</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                    <span className="text-gray-600 text-xs px-2 py-0.5 bg-gray-800 rounded">v{version}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${dbConfig.isCloud ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {dbConfig.isCloud ? 'Cloud Sync Active' : 'Local Storage Mode'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6 w-full max-w-4xl z-10 mb-8">
                {/* 1. Catalog Viewer */}
                <button
                    onClick={() => navigate('/catalog')}
                    className="group bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 hover:border-minion-500 rounded-2xl p-8 flex flex-col items-center gap-5 transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-sm cursor-pointer"
                >
                    <div className="bg-gray-900 p-5 rounded-2xl group-hover:bg-minion-500/20 transition-all duration-300">
                        <BookOpen size={48} className="text-minion-500" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-1.5 text-gray-100 group-hover:text-white">Catalog Viewer</h2>
                        <p className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed">
                            View PDF catalogs, draw annotations, and request parts visually
                        </p>
                    </div>
                </button>

                {/* 2. Parts Discovery */}
                <button
                    onClick={() => navigate('/discovery')}
                    className="group bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 hover:border-minion-500 rounded-2xl p-8 flex flex-col items-center gap-5 transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-sm cursor-pointer"
                >
                    <div className="bg-gray-900 p-5 rounded-2xl group-hover:bg-minion-500/20 transition-all duration-300">
                        <Compass size={48} className="text-minion-500" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-1.5 text-gray-100 group-hover:text-white">Parts Discovery</h2>
                        <p className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed">
                            Browse common inventory visually by category cards and icons
                        </p>
                    </div>
                </button>

                {/* 3. Parts Dashboard */}
                <button
                    onClick={() => navigate('/dashboard')}
                    className="group bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 hover:border-minion-500 rounded-2xl p-8 flex flex-col items-center gap-5 transition-all hover:scale-105 active:scale-95 shadow-lg backdrop-blur-sm cursor-pointer"
                >
                    <div className="bg-gray-900 p-5 rounded-2xl group-hover:bg-minion-500/20 transition-all duration-300">
                        <LayoutDashboard size={48} className="text-minion-500" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-1.5 text-gray-100 group-hover:text-white">Parts Dashboard</h2>
                        <p className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed">
                            Manage requests, coordinate picking, and export Excel reports
                        </p>
                    </div>
                </button>
            </div>

            {/* Supabase Config Button (Visible ONLY to Admin) */}
            {isAdmin && (
                <button
                    onClick={() => setShowConfig(true)}
                    className="z-10 flex items-center gap-2 text-xs text-gray-400 hover:text-minion-400 transition-colors px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-750 cursor-pointer animate-fade-in"
                >
                    <Database size={14} />
                    <span>Configure Supabase Cloud Sync</span>
                </button>
            )}

            {/* Admin Password Modal */}
            <AdminPasswordModal
                isOpen={showAdminModal}
                onClose={() => setShowAdminModal(false)}
            />

            {/* E-book Reader Style Catalog Library Modal */}
            <CatalogLibraryModal
                isOpen={showLibraryModal}
                activeCatalogId={activeCatalogId}
                onClose={() => setShowLibraryModal(false)}
                onSelectCatalog={(catalog) => {
                    localStorage.setItem('minion_current_pdf_name', catalog.id)
                    setActiveCatalogId(catalog.id)
                    navigate('/catalog')
                }}
                onRequestAdminUnlock={() => setShowAdminModal(true)}
            />

            {/* Cloud Config Modal */}
            {showConfig && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
                        <h3 className="text-lg font-bold text-minion-400 mb-2 flex items-center gap-2">
                            <Database size={20} />
                            Supabase Cloud Sync Settings
                        </h3>
                        <p className="text-xs text-gray-400 mb-4">
                            Connect your MinionMP application to a free Supabase database to share parts orders and drawing annotations across multiple devices in real-time.
                        </p>
                        <div className="space-y-3 mb-6">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Supabase Project URL</label>
                                <input
                                    type="text"
                                    placeholder="https://your-project.supabase.co"
                                    value={supabaseUrl}
                                    onChange={e => setSupabaseUrl(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-minion-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Supabase Anon Public Key</label>
                                <input
                                    type="password"
                                    placeholder="eyJhbGciOi..."
                                    value={supabaseKey}
                                    onChange={e => setSupabaseKey(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 outline-none focus:ring-1 focus:ring-minion-500 font-mono"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSaveConfig}
                                className="flex-1 bg-minion-500 hover:bg-minion-400 text-black font-bold text-xs py-2 rounded transition-colors cursor-pointer"
                            >
                                Connect Cloud
                            </button>
                            {dbConfig.isCloud && (
                                <button
                                    onClick={handleClearConfig}
                                    className="px-3 bg-red-900/40 border border-red-500/50 hover:bg-red-900/60 text-red-300 font-bold text-xs py-2 rounded transition-colors cursor-pointer"
                                >
                                    Disconnect
                                </button>
                            )}
                            <button
                                onClick={() => setShowConfig(false)}
                                className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
