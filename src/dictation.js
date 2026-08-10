import { Capacitor } from '@capacitor/core'

// Voice-to-text for visit notes. On the installed app this uses the
// phone's native speech engine (same one as keyboard dictation) via the
// Capacitor plugin; in browsers it falls back to the Web Speech API.
// Tap to start listening, tap again to stop and apply the transcript.

const isNative = Capacitor.isNativePlatform()

let stopCurrent = null

export async function toggleDictation(applyText, setListening) {
  if (stopCurrent) {
    const stop = stopCurrent
    stopCurrent = null
    await stop()
    return
  }

  if (isNative) {
    const { SpeechRecognition } = await import(
      '@capacitor-community/speech-recognition'
    )
    const perm = await SpeechRecognition.requestPermissions()
    if (perm.speechRecognition === 'denied') {
      alert(
        'Voice notes need microphone and speech recognition access. Enable both for Breadcrumbs in iPhone Settings.'
      )
      return
    }
    let transcript = ''
    const listener = await SpeechRecognition.addListener(
      'partialResults',
      (data) => {
        if (data.matches?.length) transcript = data.matches[0]
      }
    )
    setListening(true)
    SpeechRecognition.start({
      language: 'en-US',
      maxResults: 1,
      partialResults: true,
      popup: false,
    }).catch(() => {})
    stopCurrent = async () => {
      try {
        await SpeechRecognition.stop()
      } catch {
        /* already stopped */
      }
      listener.remove()
      setListening(false)
      if (transcript.trim()) applyText(transcript.trim())
    }
    return
  }

  const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!SR) {
    alert(
      'Voice input is not supported in this browser — use the installed app or your keyboard mic.'
    )
    return
  }
  const rec = new SR()
  rec.lang = 'en-US'
  rec.interimResults = false
  rec.onresult = (e) => {
    const text = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(' ')
      .trim()
    if (text) applyText(text)
  }
  rec.onend = () => {
    setListening(false)
    stopCurrent = null
  }
  rec.onerror = () => {
    setListening(false)
    stopCurrent = null
  }
  setListening(true)
  rec.start()
  stopCurrent = async () => rec.stop()
}
