// Speech playback helper: fetch TTS audio for `text` and play it, resolving
// when playback finishes. A module-level audio handle lets us stop any
// in-progress speech (e.g. when starting a new command).
import { api } from '../api'

let currentAudio = null

export function stopSpeaking() {
  if (currentAudio) {
    try { currentAudio.pause() } catch {}
    if (currentAudio.src) URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
  }
}

// onReady fires the moment the TTS audio blob is ready and playback is about
// to start — use this to trigger a UI action so the user hears the voice *as*
// the screen changes, rather than 3 s after it.
export async function speak(text, onReady) {
  if (!text) return
  stopSpeaking()
  const blob = await api.speak(text)   // TTS fetch (~2-3 s)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio
  await new Promise((resolve) => {
    audio.onended = resolve
    audio.onerror = resolve
    audio.play().catch(resolve)
    setTimeout(() => onReady?.(), 3000)  // action fires 2 s into playback
  })
  URL.revokeObjectURL(url)
  if (currentAudio === audio) currentAudio = null
}
