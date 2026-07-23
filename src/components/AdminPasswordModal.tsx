import { useState } from 'react'
import { Lock, X, KeyRound, AlertCircle } from 'lucide-react'
import { adminStore } from '../utils/adminStore'

interface AdminPasswordModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

export default function AdminPasswordModal({ isOpen, onClose, onSuccess }: AdminPasswordModalProps) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState(false)

    if (!isOpen) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (adminStore.verifyPassword(password)) {
            setError(false)
            setPassword('')
            if (onSuccess) onSuccess()
            onClose()
        } else {
            setError(true)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in select-none">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                    <X size={18} />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-minion-500/10 border border-minion-500/20 flex items-center justify-center text-minion-400 shrink-0">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-100">Unlock Admin Mode</h3>
                        <p className="text-xs text-gray-400">Enter password to access admin controls</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <div className="relative">
                            <input
                                type="password"
                                placeholder="Enter Admin Password"
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(false) }}
                                autoFocus
                                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 pl-10 text-sm text-gray-200 focus:ring-1 focus:ring-minion-500 focus:border-minion-500 outline-none font-mono placeholder-gray-600"
                            />
                            <KeyRound size={16} className="absolute left-3.5 top-3 text-gray-500" />
                        </div>
                        {error && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400 font-medium">
                                <AlertCircle size={14} />
                                <span>Incorrect password. Please try again.</span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-800 hover:bg-gray-750 text-gray-300 font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-minion-500 hover:bg-minion-400 text-black font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer shadow-lg shadow-yellow-950/20"
                        >
                            Unlock Admin
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
