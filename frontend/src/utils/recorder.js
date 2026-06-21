// Microphone recorder that produces a 16 kHz mono 16-bit WAV Blob.
// We encode WAV in the browser (rather than MediaRecorder's webm/opus) because
// Gemini's transcription accepts WAV directly — no server-side transcoding.

const TARGET_RATE = 16000

export function createRecorder() {
  let ctx, source, processor, stream
  let chunks = []
  let inputRate = 44100

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    inputRate = ctx.sampleRate
    source = ctx.createMediaStreamSource(stream)
    processor = ctx.createScriptProcessor(4096, 1, 1)
    chunks = []
    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    source.connect(processor)
    processor.connect(ctx.destination) // required for the callback to fire in Chrome
  }

  async function stop() {
    try { processor && processor.disconnect() } catch {}
    try { source && source.disconnect() } catch {}
    if (stream) stream.getTracks().forEach(t => t.stop())
    const merged = flatten(chunks)
    const down = downsample(merged, inputRate, TARGET_RATE)
    const wav = encodeWav(down, TARGET_RATE)
    if (ctx) { try { await ctx.close() } catch {} }
    return wav // Blob (audio/wav)
  }

  return { start, stop }
}

function flatten(buffers) {
  let len = 0
  for (const b of buffers) len += b.length
  const out = new Float32Array(len)
  let off = 0
  for (const b of buffers) { out.set(b, off); off += b.length }
  return out
}

function downsample(buffer, fromRate, toRate) {
  if (toRate >= fromRate) return buffer
  const ratio = fromRate / toRate
  const newLen = Math.round(buffer.length / ratio)
  const out = new Float32Array(newLen)
  let pos = 0
  for (let i = 0; i < newLen; i++) {
    const next = Math.round((i + 1) * ratio)
    let sum = 0, count = 0
    for (let j = Math.round(i * ratio); j < next && j < buffer.length; j++) { sum += buffer[j]; count++ }
    out[i] = count ? sum / count : 0
    pos = next
  }
  return out
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]) // strip data: prefix
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
