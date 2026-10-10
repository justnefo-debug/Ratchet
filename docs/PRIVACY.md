# Privacy Policy

Ratchet Privacy Shield is a completely local, client-side browser extension designed to protect your privacy. 

## No Network Calls by Default
Ratchet makes **zero network calls of its own by default**. 
- It does not "phone home" for telemetry, analytics, or updates.
- By default, the named entity recognition (NER) and all structured data detection run 100% offline using a bundled, offline Radix-Trie and WebAssembly/JS regex engines.
- **Optional Power Mode**: If you explicitly enable "Power Mode" in the Options and provide a custom Backend URL, Ratchet will send your prompts to that specific URL for advanced processing. This is entirely opt-in.

## How It Works
Ratchet intercepts outgoing network requests (specifically, the messages you send to supported AI chatbots like ChatGPT and Claude) directly within your browser. It redacts sensitive information (like names, emails, and credit cards) and replaces them with placeholders (e.g., `«PERSON_1»`) *before* the request leaves your machine. 

## Storage
- **Session Storage**: Mappings between the original sensitive data and their placeholders are stored in your browser's ephemeral `chrome.storage.session` by default, meaning they are wiped entirely when you close the browser.
- **Persistence (Optional)**: If you enable cross-session persistence in Options, Ratchet encrypts these mappings using AES-GCM (256-bit) before storing them in local storage.

Your data is yours. Ratchet simply acts as a secure air-gap between your keyboard and the cloud.
