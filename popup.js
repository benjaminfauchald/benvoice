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

  // Load saved tone of voice
  chrome.storage.local.get({ toneOfVoice: '', toneFileName: '' }, (items) => {
    if (items.toneOfVoice) {
      showTonePreview(items.toneFileName || 'Uploaded file', items.toneOfVoice);
    }
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

// --- Tone of Voice file upload ---

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('toneFile');

// Click to browse
dropZone.addEventListener('click', () => fileInput.click());

// File selected via browse
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

function handleFile(file) {
  if (!file.name.match(/\.(md|txt|markdown)$/i)) {
    showToneStatus('Please upload a .md or .txt file.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    chrome.storage.local.set({ toneOfVoice: content, toneFileName: file.name }, () => {
      showToneStatus('Tone of voice saved!');
      showTonePreview(file.name, content);
    });
  };
  reader.onerror = () => {
    showToneStatus('Failed to read file.', true);
  };
  reader.readAsText(file);
}

// Remove tone of voice
document.getElementById('removeTone').addEventListener('click', () => {
  chrome.storage.local.remove(['toneOfVoice', 'toneFileName'], () => {
    document.getElementById('tonePreview').style.display = 'none';
    showToneStatus('Tone of voice removed. Using default.');
  });
});

function showTonePreview(fileName, content) {
  document.getElementById('toneFileName').textContent = fileName;
  // Show first ~500 chars as preview
  const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
  document.getElementById('tonePreviewText').textContent = preview;
  document.getElementById('tonePreview').style.display = 'block';
}

function showStatus(message, isError = false) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.style.color = isError ? '#ff4444' : '#4caf50';
  setTimeout(() => { el.textContent = ''; }, 2500);
}

function showToneStatus(message, isError = false) {
  const el = document.getElementById('toneStatus');
  el.textContent = message;
  el.style.color = isError ? '#ff4444' : '#4caf50';
  setTimeout(() => { el.textContent = ''; }, 2500);
}
