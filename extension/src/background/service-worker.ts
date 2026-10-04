// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ Ratchet Privacy Shield installed');
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'redact') {
    fetch('http://127.0.0.1:5000/api/redact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: request.text })
    })
    .then(res => res.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.toString() }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'restore') {
    fetch('http://127.0.0.1:5000/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: request.text, session_id: request.session_id })
    })
    .then(res => res.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
});
