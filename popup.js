const DEFAULT_CONFIG = {
  endpoint: 'https://digital-products-openai.cognitiveservices.azure.com/',
  apiKey: '',
  deployment: 'gpt-4.1',
  apiVersion: '2024-12-01-preview'
};

// Load saved settings on popup open
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
    document.getElementById('endpoint').value = items.endpoint;
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('deployment').value = items.deployment;
    document.getElementById('apiVersion').value = items.apiVersion;
  });
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const config = {
    endpoint: document.getElementById('endpoint').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    deployment: document.getElementById('deployment').value.trim(),
    apiVersion: document.getElementById('apiVersion').value.trim()
  };

  if (!config.endpoint || !config.apiKey || !config.deployment) {
    showStatus('Please fill in all required fields.', true);
    return;
  }

  chrome.storage.sync.set(config, () => {
    showStatus('Settings saved!');
  });
});

// Toggle API key visibility
document.getElementById('toggleKey').addEventListener('click', () => {
  const input = document.getElementById('apiKey');
  const btn = document.getElementById('toggleKey');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
  } else {
    input.type = 'password';
    btn.textContent = 'eye';
  }
});

function showStatus(message, isError = false) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.style.color = isError ? '#ff4444' : '#4caf50';
  setTimeout(() => { el.textContent = ''; }, 2500);
}
