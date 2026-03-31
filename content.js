// Track the active editable element and selection
let activeElement = null;
let selectionStart = 0;
let selectionEnd = 0;

// Listen for focus on editable elements
document.addEventListener('focusin', (e) => {
  if (isEditable(e.target)) {
    activeElement = e.target;
  }
});

// Keyboard shortcut: Ctrl+Shift+R (Cmd+Shift+R on Mac)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    triggerRewrite();
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getSelectedText':
      sendResponse({ text: getSelectedText() });
      break;
    case 'replaceText':
      replaceSelectedText(message.text);
      hideOverlay();
      break;
    case 'showLoading':
      showOverlay('loading');
      break;
    case 'showError':
      showOverlay('error', message.error);
      break;
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

function getSelectedText() {
  if (!activeElement) return '';

  if (activeElement.isContentEditable) {
    const selection = window.getSelection();
    return selection?.toString() || '';
  }

  // textarea or input
  selectionStart = activeElement.selectionStart;
  selectionEnd = activeElement.selectionEnd;
  return activeElement.value.substring(selectionStart, selectionEnd);
}

function replaceSelectedText(newText) {
  if (!activeElement) return;

  if (activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
      // Collapse selection to end
      selection.collapseToEnd();
    }
    // Trigger input event for frameworks (React, Vue, etc.)
    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // textarea or input
  const before = activeElement.value.substring(0, selectionStart);
  const after = activeElement.value.substring(selectionEnd);
  activeElement.value = before + newText + after;

  // Set cursor to end of replaced text
  const newCursorPos = selectionStart + newText.length;
  activeElement.setSelectionRange(newCursorPos, newCursorPos);

  // Trigger input event for frameworks
  activeElement.dispatchEvent(new Event('input', { bubbles: true }));
}

async function triggerRewrite() {
  const text = getSelectedText();
  if (!text) {
    showOverlay('error', 'No text selected. Select text in a text field first.');
    return;
  }

  showOverlay('loading');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'rewrite', text });
    if (response.success) {
      replaceSelectedText(response.text);
      hideOverlay();
    } else {
      showOverlay('error', response.error);
    }
  } catch (err) {
    showOverlay('error', err.message);
  }
}

// --- Overlay UI ---

let overlay = null;

function showOverlay(type, message) {
  hideOverlay();

  overlay = document.createElement('div');
  overlay.id = 'benvoice-overlay';

  if (type === 'loading') {
    overlay.innerHTML = `
      <div class="benvoice-spinner"></div>
      <span>Rewriting...</span>
    `;
    overlay.classList.add('benvoice-loading');
  } else if (type === 'error') {
    overlay.innerHTML = `
      <span class="benvoice-error-icon">!</span>
      <span>${escapeHtml(message)}</span>
    `;
    overlay.classList.add('benvoice-error');
    setTimeout(hideOverlay, 4000);
  }

  document.body.appendChild(overlay);
}

function hideOverlay() {
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
