/**
 * Ratchet Privacy Shield — Local Mock Chat Server & Page
 *
 * Provides a local test server for automated E2E tests:
 * 1. Serves mock chat interface with both <textarea> and contenteditable inputs.
 * 2. Logs all raw incoming request bodies.
 * 3. Echoes responses via chunked streaming, deliberately splitting tokens/placeholders
 *    across chunks and text nodes to test real-world markdown rendering scenarios.
 * 4. Provides inspection and reset endpoints for test assertions.
 */

import http from 'http';

export interface LoggedRequest {
  url: string;
  method: string;
  body: string;
  headers: http.IncomingHttpHeaders;
  timestamp: number;
}

export class MockChatServer {
  private server: http.Server | null = null;
  public loggedRequests: LoggedRequest[] = [];
  public port: number;

  constructor(port = 3456) {
    this.port = port;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public clearLoggedRequests(): void {
    this.loggedRequests = [];
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Inspect endpoints
    if (url.pathname === '/api/test/requests' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.loggedRequests));
      return;
    }

    if (url.pathname === '/api/test/reset' && req.method === 'POST') {
      this.clearLoggedRequests();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Serve HTML Chat Interface
    if ((url.pathname === '/' || url.pathname.startsWith('/c/')) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderHtmlPage());
      return;
    }

    // Chat API endpoint
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk.toString();
      });

      req.on('end', async () => {
        // Record raw body for test verification
        this.loggedRequests.push({
          url: req.url || '',
          method: req.method || 'POST',
          body: bodyData,
          headers: req.headers,
          timestamp: Date.now(),
        });

        let prompt = '';
        try {
          const parsed = JSON.parse(bodyData);
          prompt = parsed.prompt || parsed.message || '';
        } catch {
          prompt = bodyData;
        }

        // Return streaming response splitting placeholders across chunks
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
        });

        // Split text deliberately in 3-character chunks so tokens/placeholders like «EMAIL_1»
        // are sliced into «EM and AIL_1»
        const intro = 'Assistant Response: Echoing your input: ';
        res.write(intro);

        // Stream the prompt in small chunks
        const chunkSize = 4;
        for (let i = 0; i < prompt.length; i += chunkSize) {
          const slice = prompt.slice(i, i + chunkSize);
          res.write(slice);
          // Small delay to simulate realistic streaming
          await new Promise((r) => setTimeout(r, 10));
        }

        // Stream a code block snippet echoing placeholders as well
        const codeBlockChunks = [
          '\n\n```python\n# Code snippet\n',
          'user_data = {\n',
          `  "raw": "${prompt.replace(/"/g, '\\"')}"\n`,
          '}\n```\n',
          'Response complete.\n',
        ];

        for (const chunk of codeBlockChunks) {
          res.write(chunk);
          await new Promise((r) => setTimeout(r, 10));
        }

        res.end();
      });
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private renderHtmlPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ratchet Mock AI Chat</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; max-width: 800px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
    textarea { width: 100%; height: 80px; box-sizing: border-box; padding: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }
    div[contenteditable="true"] { width: 100%; min-height: 80px; box-sizing: border-box; padding: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
    button { margin-top: 10px; padding: 8px 16px; background: #0066cc; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:hover { background: #0052a3; }
    .chat-response { margin-top: 15px; padding: 15px; background: #f7f9fa; border-left: 4px solid #0066cc; border-radius: 4px; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; }
    code { font-family: Consolas, Monaco, monospace; }
    #status { margin-bottom: 10px; font-weight: bold; color: #555; }
  </style>
</head>
<body>
  <h1>Ratchet Mock AI Chat</h1>
  <div id="status">Ready</div>

  <!-- Variant 1: Standard Textarea -->
  <div class="box">
    <h3>Variant 1: Textarea Input</h3>
    <textarea id="prompt-textarea" placeholder="Type prompt with PII here..."></textarea>
    <br/>
    <button id="send-textarea-btn">Send (Textarea)</button>
  </div>

  <!-- Variant 2: ContentEditable Input -->
  <div class="box">
    <h3>Variant 2: ContentEditable Input</h3>
    <div id="prompt-editable" contenteditable="true" role="textbox" placeholder="Type prompt with PII here..."></div>
    <br/>
    <button id="send-editable-btn">Send (Editable)</button>
  </div>

  <hr/>
  <h2>Messages</h2>
  <div id="messages-container"></div>

  <script>
    async function executePrompt(promptText) {
      const status = document.getElementById('status');
      status.textContent = 'Sending...';

      const container = document.getElementById('messages-container');
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-response assistant-message';
      msgDiv.setAttribute('data-role', 'assistant');
      container.appendChild(msgDiv);

      const params = new URLSearchParams(window.location.search);
      const convId = params.get('c') || window.location.pathname.replace(/^\\/c\\//, '') || '';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText, conversationId: convId })
        });

        if (!response.ok) {
          status.textContent = 'Request Failed: ' + response.status;
          return;
        }

        status.textContent = 'Streaming...';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let currentP = document.createElement('p');
        msgDiv.appendChild(currentP);
        let inCodeBlock = false;
        let currentCode = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const textChunk = decoder.decode(value, { stream: true });

          // Render streaming markdown chunk by chunk appending text nodes
          if (textChunk.includes('\`\`\`')) {
            const parts = textChunk.split('\`\`\`');
            for (let i = 0; i < parts.length; i++) {
              if (i > 0) {
                inCodeBlock = !inCodeBlock;
                if (inCodeBlock) {
                  const pre = document.createElement('pre');
                  currentCode = document.createElement('code');
                  pre.appendChild(currentCode);
                  msgDiv.appendChild(pre);
                } else {
                  currentP = document.createElement('p');
                  msgDiv.appendChild(currentP);
                }
              }
              if (parts[i]) {
                const target = inCodeBlock && currentCode ? currentCode : currentP;
                const node = document.createTextNode(parts[i]);
                target.appendChild(node);
              }
            }
          } else {
            const target = inCodeBlock && currentCode ? currentCode : currentP;
            // Append as separate text node, recreating real markdown renderer behavior
            const node = document.createTextNode(textChunk);
            target.appendChild(node);
          }
        }

        status.textContent = 'Completed';
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
      }
    }

    document.getElementById('send-textarea-btn').addEventListener('click', () => {
      const ta = document.getElementById('prompt-textarea');
      const val = ta.value;
      ta.value = '';
      executePrompt(val);
    });

    document.getElementById('send-editable-btn').addEventListener('click', () => {
      const ed = document.getElementById('prompt-editable');
      const val = ed.innerText || ed.textContent || '';
      ed.innerText = '';
      executePrompt(val);
    });
  </script>
</body>
</html>`;
  }
}
