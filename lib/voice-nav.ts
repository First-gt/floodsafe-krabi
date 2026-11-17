/**
 * เสียงพูดนำทางภาษาไทยผ่าน Web Speech API (ทำงานในเบราว์เซอร์ ไม่ต้องใช้ API key)
 */

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopVoice(): void {
  if (!isVoiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function speakThai(text: string): void {
  if (!isVoiceSupported() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'th-TH';
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
