const DEFAULT_API_URL = 'https://chinhde-fake-news-detection-backend.hf.space';

async function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl'], (result) => {
      if (result && result.apiUrl) {
        resolve(result.apiUrl);
      } else {
        resolve(DEFAULT_API_URL);
      }
    });
  });
}

async function postJson(path, payload) {
  const apiUrl = await getApiUrl();
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  const { action, payload } = message;

  if (action !== 'predict' && action !== 'analyze') return;

  (async () => {
    try {
      const path = action === 'predict' ? '/api/predict' : '/api/analyze';
      const data = await postJson(path, payload);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});