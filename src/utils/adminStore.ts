// Admin Mode Session & Password Manager

const ADMIN_PASSWORD_DEFAULT = 'Admin123'
const SESSION_KEY = 'minion_admin_unlocked'

class AdminStore {
    private isUnlocked = false
    private listeners: (() => void)[] = []

    constructor() {
        this.isUnlocked = sessionStorage.getItem(SESSION_KEY) === 'true'
    }

    public getIsUnlocked(): boolean {
        return this.isUnlocked
    }

    public verifyPassword(password: string): boolean {
        if (password.trim() === ADMIN_PASSWORD_DEFAULT) {
            this.isUnlocked = true
            sessionStorage.setItem(SESSION_KEY, 'true')
            this.notify()
            return true
        }
        return false
    }

    public lock(): void {
        this.isUnlocked = false
        sessionStorage.removeItem(SESSION_KEY)
        this.notify()
    }

    public subscribe(callback: () => void): () => void {
        this.listeners.push(callback)
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback)
        }
    }

    private notify() {
        this.listeners.forEach(l => l())
    }
}

export const adminStore = new AdminStore()
