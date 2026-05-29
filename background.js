const API_URL = 'http://localhost:8000';

async function postJson(path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
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