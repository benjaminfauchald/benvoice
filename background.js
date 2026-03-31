const PROMPT_PREFIX = `You are a writing assistant that rewrites text to match a specific person's tone of voice while fixing grammar errors.

Below is the tone of voice guide to follow:

---
`;

const PROMPT_SUFFIX = `
---

## Instructions:
1. Fix all grammar and spelling errors
2. Rewrite the text to match the tone of voice described above
3. Keep the same meaning and intent
4. Keep roughly the same length (don't pad or over-expand)
5. If the text is in Norwegian, keep it in Norwegian but apply the same voice rules
6. Return ONLY the rewritten text — no explanations, no quotes, no prefixes`;

const DEFAULT_TONE = `## Voice Rules:
- Casual-professional hybrid
- Direct and action-oriented, always use active voice
- Warm but efficient — every message feels personal without wasting time
- Natural contractions: "I'll", "we're", "let's", "don't", "can't"
- Short paragraphs, never walls of text
- No corporate jargon, no passive voice, no excessive hedging
- Clear next steps in every message`;

async function getTonePrompt() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ toneOfVoice: '' }, (items) => {
      const tone = items.toneOfVoice || DEFAULT_TONE;
      resolve(PROMPT_PREFIX + tone + PROMPT_SUFFIX);
    });
  });
}

// Default Azure config (API key must be set via the extension popup)
const DEFAULT_CONFIG = {
  endpoint: 'https://digital-products-openai.cognitiveservices.azure.com/',
  apiKey: '',
  deployment: 'gpt-4.1',
  apiVersion: '2024-12-01-preview'
};

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'benvoice-rewrite',
    title: 'Rewrite in my voice',
    contexts: ['editable']
  });
});

// Text cached by content scripts on right-click (avoids cross-frame query issues)
let pendingText = '';
let pendingTabId = null;

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('[BenVoice BG] Context menu clicked', { menuItemId: info.menuItemId, tabId: tab?.id, hasPendingText: !!pendingText });
  if (info.menuItemId === 'benvoice-rewrite') {
    handleContextMenuRewrite(info, tab);
  }
});

async function handleContextMenuRewrite(info, tab) {
  // Use the text that the content script proactively sent on right-click mousedown
  const selectedText = (pendingTabId === tab.id) ? pendingText : '';
  console.log('[BenVoice BG] Using cached text, length:', selectedText.length);

  // Clear cache
  pendingText = '';
  pendingTabId = null;

  if (!selectedText) {
    console.warn('[BenVoice BG] No text selected');
    chrome.tabs.sendMessage(tab.id, {
      action: 'showError',
      error: 'No text selected. Select text in a text field, then right-click.'
    }).catch((e) => console.error('[BenVoice BG] showError failed:', e.message));
    return;
  }

  try {
    console.log('[BenVoice BG] Showing loading overlay');
    chrome.tabs.sendMessage(tab.id, { action: 'showLoading' }).catch(() => {});
    console.log('[BenVoice BG] Calling Azure API...');
    const rewritten = await rewriteText(selectedText);
    console.log('[BenVoice BG] API returned:', JSON.stringify(rewritten).substring(0, 100));
    chrome.tabs.sendMessage(tab.id, { action: 'replaceText', text: rewritten }).catch(() => {});
  } catch (err) {
    console.error('[BenVoice BG] Rewrite failed:', err.message);
    chrome.tabs.sendMessage(tab.id, { action: 'showError', error: err.message }).catch(() => {});
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BenVoice BG] Message received:', message.action, 'from tab:', sender.tab?.id);

  if (message.action === 'cacheText') {
    // Content script sends selected text on right-click, before context menu fires
    pendingText = message.text;
    pendingTabId = sender.tab?.id;
    console.log('[BenVoice BG] Cached text from tab', pendingTabId, ':', JSON.stringify(pendingText).substring(0, 80));
    return false;
  }

  if (message.action === 'rewrite') {
    rewriteText(message.text)
      .then(rewritten => sendResponse({ success: true, text: rewritten }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function rewriteText(text) {
  const config = await getConfig();
  console.log('[BenVoice BG] Config loaded:', { endpoint: config.endpoint, deployment: config.deployment, hasKey: !!config.apiKey, apiVersion: config.apiVersion });

  if (!config.apiKey) {
    throw new Error('API key not set. Click the BenVoice icon and enter your Azure OpenAI API key.');
  }

  const url = `${config.endpoint.replace(/\/$/, '')}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: await getTonePrompt() },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      resolve(items);
    });
  });
}
