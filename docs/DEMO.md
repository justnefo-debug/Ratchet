# Ratchet Demo Script

This script walks you through testing the Ratchet Privacy Shield locally using the interactive mock chat server.

## 1. Setup

1. Build the test extension by running: `npm run build:test` inside the `extension/` folder.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the `extension/dist-test` directory.
5. Start the demo server by running `npm run demo` in the `extension/` folder.
6. Open your browser to the local URL (typically `http://localhost:5173`).

## 2. Interactive Testing

1. **Send a clean message:** Type "Hello, what is the capital of France?" and press Enter. You should see the message pass through instantly without intervention.
2. **Send sensitive data:** Type "My name is John Doe and my phone number is 555-123-4567." and press Enter.
3. **Review Before Send:** The Ratchet Review panel will automatically intercept the request. You will see:
   - `John Doe` flagged as a `PERSON`.
   - `555-123-4567` flagged as a `PHONE`.
4. **Action:** Click "Send Redacted".
5. **Verify:** Look at the chat interface. You'll see the AI received your message with placeholders like `«PERSON_1»` and `«PHONE_1»`, but in your UI, the original text is fully restored!

## 3. Custom Rules

1. Open the Ratchet extension options (right-click the extension icon and select "Options").
2. Scroll to **Custom Rules**.
3. Add a new rule: `Project Apollo` and check the "Block" option.
4. Go back to the demo chat and type "We are launching Project Apollo tomorrow."
5. Ratchet will intercept this based on your custom rule, ensuring your proprietary terms never leak.
