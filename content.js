// Track the active editable element and selection
let activeElement = null;
let selectionStart = 0;
let selectionEnd = 0;
let cachedSelectedText = '';
const isTopFrame = (window === window.top);

console.log('[BenVoice CS] Content script loaded, isTopFrame:', isTopFrame, 'URL:', location.href.substring(0, 80));

// Listen for focus on editable elements
document.addEventListener('focusin', (e) => {
  if (isEditable(e.target)) {
    activeElement = e.target;
    console.log('[BenVoice CS] Active element set:', e.target.tagName, e.target.isContentEditable ? 'contentEditable' : '');
  }
});

// Capture selection state BEFORE right-click opens context menu
// AND proactively send it to background so it's ready when context menu fires
document.addEventListener('mousedown', (e) => {
  if (e.button === 2) { // right-click
    cacheSelection();
    if (cachedSelectedText) {
      console.log('[BenVoice CS] Right-click, sending cached text to BG:', JSON.stringify(cachedSelectedText).substring(0, 80));
      chrome.runtime.sendMessage({ action: 'cacheText', text: cachedSelectedText }).catch(() => {});
    }
  }
});

// Also cache on any selection change inside editable fields
document.addEventListener('selectionchange', () => {
  if (activeElement && isEditable(activeElement)) {
    cacheSelection();
  }
});

function cacheSelection() {
  if (!activeElement) return;

  if (activeElement.isContentEditable) {
    const sel = window.getSelection();
    cachedSelectedText = sel?.toString() || '';
  } else {
    selectionStart = activeElement.selectionStart;
    selectionEnd = activeElement.selectionEnd;
    cachedSelectedText = activeElement.value.substring(selectionStart, selectionEnd);
  }
}

// Keyboard shortcut: Ctrl+Shift+R (Cmd+Shift+R on Mac)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    cacheSelection();
    triggerRewrite();
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BenVoice CS] Message received:', message.action, 'isTopFrame:', isTopFrame);

  switch (message.action) {
    case 'getSelectedText':
      // Only the frame with text should respond
      if (cachedSelectedText) {
        console.log('[BenVoice CS] Responding with text:', JSON.stringify(cachedSelectedText).substring(0, 80));
        sendResponse({ text: cachedSelectedText });
      } else {
        sendResponse({ text: '' });
      }
      return false;

    case 'replaceText':
      // Only the frame that has the active element should replace
      if (activeElement) {
        console.log('[BenVoice CS] Replacing text, length:', message.text?.length);
        replaceSelectedText(message.text);
      }
      // Overlay always in top frame
      if (isTopFrame) {
        hideOverlay();
        showOverlay('success', 'Text rewritten!');
      }
      return false;

    case 'showLoading':
      if (isTopFrame) {
        console.log('[BenVoice CS] Showing loading overlay');
        showOverlay('loading');
      }
      return false;

    case 'showError':
      if (isTopFrame) {
        console.log('[BenVoice CS] Showing error:', message.error);
        showOverlay('error', message.error);
      }
      return false;
  }
});

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input' && ['text', 'email', 'search', 'url'].includes(el.type)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function replaceSelectedText(newText) {
  if (!activeElement) return;

  if (activeElement.isContentEditable) {
    activeElement.focus();
    // Restore selection if lost
    const sel = window.getSelection();
    if (sel.toString()) {
      document.execCommand('insertText', false, newText);
    } else {
      // Selection was lost (e.g. context menu closed it) — replace full content as fallback
      // This shouldn't happen since we cache, but just in case
      activeElement.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, newText);
    }
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // textarea or input
  activeElement.focus();
  const before = activeElement.value.substring(0, selectionStart);
  const after = activeElement.value.substring(selectionEnd);
  activeElement.value = before + newText + after;

  const newCursorPos = selectionStart + newText.length;
  activeElement.setSelectionRange(newCursorPos, newCursorPos);

  activeElement.dispatchEvent(new Event('input', { bubbles: true }));
}

async function triggerRewrite() {
  if (!cachedSelectedText) {
    showOverlay('error', 'No text selected. Select text in a text field first.');
    return;
  }

  showOverlay('loading');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'rewrite', text: cachedSelectedText });
    if (response.success) {
      replaceSelectedText(response.text);
      hideOverlay();
      showOverlay('success', 'Text rewritten!');
    } else {
      showOverlay('error', response.error);
    }
  } catch (err) {
    showOverlay('error', err.message);
  }
}

// --- Overlay UI (only rendered in top frame) ---

let overlay = null;
let overlayTimeout = null;

function showOverlay(type, message) {
  if (!isTopFrame) return; // overlays only in top frame

  console.log('[BenVoice CS] showOverlay:', type, message);
  hideOverlay();

  overlay = document.createElement('div');
  overlay.id = 'benvoice-overlay';
  overlay.className = `benvoice-${type}`;

  if (type === 'loading') {
    overlay.innerHTML = `
      <div class="benvoice-spinner"></div>
      <span class="benvoice-text">Rewriting in your voice...</span>
    `;
  } else if (type === 'error') {
    overlay.innerHTML = `
      <span class="benvoice-error-icon">!</span>
      <span class="benvoice-text">${escapeHtml(message)}</span>
    `;
    overlayTimeout = setTimeout(hideOverlay, 5000);
  } else if (type === 'success') {
    overlay.innerHTML = `
      <span class="benvoice-success-icon">&#10003;</span>
      <span class="benvoice-text">${escapeHtml(message)}</span>
    `;
    overlayTimeout = setTimeout(hideOverlay, 2500);
  }

  document.body.appendChild(overlay);
}

function hideOverlay() {
  if (overlayTimeout) {
    clearTimeout(overlayTimeout);
    overlayTimeout = null;
  }
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
