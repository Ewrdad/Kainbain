/***
 * MARK: copyToClipboard
 * @description Robust clipboard strategy that attempts navigator.clipboard.writeText
 * and falls back to document.execCommand('copy') via a temporary hidden textarea.
 * @param {string} text - Plain text to copy to the clipboard.
 * @returns {Promise<boolean>} True if copying succeeded, false otherwise.
 * @example await copyToClipboard('[INFO] Log line')
 ***/
export async function copyToClipboard(text) {
  const textToCopy = typeof text === 'string' ? text : String(text ?? '');

  // Attempt modern async Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      return true;
    } catch {
      // Fallback below
    }
  }

  // Fallback to legacy execCommand('copy') via hidden textarea
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return Boolean(successful);
    } catch {
      return false;
    }
  }

  return false;
}

export default copyToClipboard;
