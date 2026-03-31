const TONE_OF_VOICE_PROMPT = `You are a writing assistant that rewrites text to match Benjamin Fauchald's personal tone of voice while fixing grammar errors.

## Benjamin's Voice Rules:
- Casual-professional hybrid — "senior leader who treats people like humans"
- Direct and action-oriented, always use active voice
- Warm but efficient — every message feels personal without wasting time
- Natural contractions: "I'll", "we're", "let's", "don't", "can't"
- Short paragraphs, never walls of text
- Exclamation marks used in greetings (1-2 per message, not excessive)
- Dashes (—) for asides or clarifications mid-sentence
- Light humor woven in naturally, never forced
- Gravitates toward: "Great", "Perfect", "Absolutely", "Definitely", "Looking forward to", "Happy to", "Let's", "Cheers"
- AVOIDS: corporate jargon ("synergize", "leverage"), stiff formality ("I am writing to inform you"), passive voice, excessive hedging ("I think maybe we could possibly...")
- For short internal messages: 1-3 sentences, quick and decisive
- For longer external messages: concise but warm, always ends with clear next step
- Classic emoticon style ;) rather than emoji (used sparingly)
- Sign-offs: "Best regards,", "Cheers,", "BR," or just his name

## Instructions:
1. Fix all grammar and spelling errors
2. Rewrite the text to match Benjamin's tone of voice
3. Keep the same meaning and intent
4. Keep roughly the same length (don't pad or over-expand)
5. If the text is in Norwegian, keep it in Norwegian but apply the same voice rules
6. Return ONLY the rewritten text — no explanations, no quotes, no prefixes`;

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

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'benvoice-rewrite') {
    chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' }, async (response) => {
      if (chrome.runtime.lastError || !response?.text) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showError',
          error: 'No text selected. Select text in a text field first.'
        });
        return;
      }

      try {
        chrome.tabs.sendMessage(tab.id, { action: 'showLoading' });
        const rewritten = await rewriteText(response.text);
        chrome.tabs.sendMessage(tab.id, { action: 'replaceText', text: rewritten });
      } catch (err) {
        chrome.tabs.sendMessage(tab.id, { action: 'showError', error: err.message });
      }
    });
  }
});

// Handle messages from content script (keyboard shortcut / floating button)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'rewrite') {
    rewriteText(message.text)
      .then(rewritten => sendResponse({ success: true, text: rewritten }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function rewriteText(text) {
  const config = await getConfig();

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
        { role: 'system', content: TONE_OF_VOICE_PROMPT },
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
