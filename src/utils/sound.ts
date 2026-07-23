export const playDing = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) return

        const ctx = new AudioContext()

        // Helper to play a tone
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()

            osc.connect(gain)
            gain.connect(ctx.destination)

            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, startTime)

            gain.gain.setValueAtTime(0, startTime)
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05)
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

            osc.start(startTime)
            osc.stop(startTime + duration)
        }

        // Play a nice major 3rd interval "Ding-Dong" (but fast, like a "Ding!")
        // Or just a rich single tone. Let's try a "Success" chime: C6 (1046.5) -> E6 (1318.5)
        const now = ctx.currentTime
        playTone(1046.5, now, 0.8)       // High C
        playTone(1318.5, now + 0.1, 0.8) // High E (slightly delayed for harmony/chime effect)

        // Clean up
        setTimeout(() => {
            if (ctx.state !== 'closed') ctx.close()
        }, 1500)

    } catch (e) {
        console.error('Audio play failed', e)
    }
}
