# 📖 Ratchet — User Manual & Guide

Welcome to **Ratchet**! Ratchet is a local privacy shield that allows you to safely use AI tools (like ChatGPT, Claude, and Gemini) without leaking your sensitive personal data or company secrets. 

Ratchet acts as a middleman. Before you send text or documents to an AI, you pass them through Ratchet. Ratchet scrubs out the sensitive data (replacing it with safe placeholders). When the AI gives you an answer, Ratchet reads it and swaps your original sensitive data back in!

Everything happens **locally on your device**. Ratchet never connects to the internet to read your data.

---

## 🚀 Getting Started

### 1. Start the Application
To use Ratchet, both the Python backend API and the React frontend must be running.
1. **Backend**: Open a terminal in the `backend/` folder and run the following commands to activate the virtual environment and start the engine:
   - On Windows: `.\venv\Scripts\Activate.ps1` (or `.\venv\Scripts\activate.bat` in CMD) then `python app.py`
   - On Mac/Linux: `source venv/bin/activate` then `python app.py`
2. **Frontend**: Open a terminal in the `frontend/` folder and run `npm run dev`. 
3. Open your browser and go to `http://localhost:5173/`.

---

## 🛡️ How to Redact Text (The "Redact" Tab)

The **Redact Tab** is your main workspace for cleaning text before you paste it into an AI chat.

1. **Paste your text**: On the left side of the screen, paste the text you want to send to the AI.
2. **Watch the magic**: Ratchet will instantly scan your text as you type. It highlights sensitive information like Names, Emails, Phone Numbers, API Keys, and Credit Cards with colored badges.
3. **Verify the Safe Version**: On the right side of the screen, you will see the "Safe version to send". Your sensitive data has been replaced with placeholders (e.g., `[PERSON_1]`, `[EMAIL_1]`).
4. **Copy the Text**: Click the **"Copy safe text"** button in the bottom right.
5. **Send to AI**: Paste this safe text into ChatGPT or Claude!

> **Tip**: If you see an entity that Ratchet caught but you *don't* want to hide, simply scroll down to the Entity Summary Table and uncheck the box next to that item. The text will instantly un-hide it in the safe version.

---

## 📄 How to Redact Documents (PDF, Word, Excel)

Want to upload a resume or a financial spreadsheet to an AI without leaking the data? Ratchet can perform **true redaction** on files.

1. In the **Redact Tab**, look for the **"Upload Document"** button (with the cloud icon) above the text area.
2. Click it and select a `.pdf`, `.docx` (Word), or `.xlsx` (Excel) file.
3. Ratchet will instantly process the file locally. It extracts the text, wipes all document metadata (like the author's name), and permanently overwrites sensitive data in the file with placeholders.
4. The safe version of the document will automatically download to your computer as `safe_[filename]`.
5. You can now safely upload this `safe_` document directly to the AI!

---

## 🔄 How to Restore AI Answers (The "Restore" Tab)

When ChatGPT or Claude gives you an answer, it will use the placeholders (e.g., "I sent an email to [EMAIL_1]"). You need your original data back!

1. In Ratchet, click the **"Send to Restore"** button on the Redact tab to save your current session to the vault.
2. Navigate to the **Restore Tab**.
3. Ensure your active session is selected in the dropdown at the top.
4. Paste the AI's response into the input box on the left.
5. Ratchet will instantly match the placeholders and swap your original sensitive data back into the text!
6. Click **"Copy restored text"** to use your final, private answer.

---

## 📈 Metrics & Changelog Tabs

- **Metrics Tab**: Ratchet keeps a local, private running tally of every piece of sensitive data it has protected for you over time. You can visit this tab to see a breakdown of exactly how many Names, API Keys, Emails, and Credit Cards you've stopped from leaking to remote servers. All telemetry is stored 100% locally on your machine.
- **Changelog Tab**: This tab tracks version updates, bug fixes, and new features added to Ratchet. For example, our brand new Document Upload (PDF/Word/Excel) true redaction feature is documented here!

---

## ⚙️ Custom Rules & Presets

- **Quick Presets**: Above the text area in the Redact tab, you can click preset buttons to instantly load sample text (like Developer Secrets or Pakistani Identity Data) to see how Ratchet handles different types of data.
- **Custom Rules**: You can add your own custom keywords (like secret project codenames) to the rules engine, and Ratchet will automatically catch and redact them just like it does with emails and names!

Enjoy total privacy that only tightens!

---

## 🧪 Comprehensive Manual Test Guide

This section provides step-by-step instructions and test data to verify **every feature** of Ratchet.

### Test 1: Real-Time Text Redaction (Regex & NER)
**Feature:** Instant scanning of sensitive data (Emails, Phones, Names, API Keys, Credit Cards, IPs, etc.).
**Action:** 
1. Open the Ratchet **Redact Tab**.
2. Paste the following data into the left input box:
```text
Hey John Doe,
Please review the server at 192.168.1.1. The AWS Key is AKIAIOSFODNN7EXAMPLE.
Also, charge the Visa card 4111-1111-1111-1111. Contact me at 555-0198 or test@example.com.
My CNIC is 42101-1234567-1 and my DOB is 12/05/1990.
```
**Expected Output:**
- On the right side, the text should read: `Hey [PERSON_1], Please review the server at [IPV4_1]. The AWS Key is [API_KEY_1]. Also, charge the Visa card [CREDIT_CARD_1]. Contact me at [PHONE_1] or [EMAIL_1]. My CNIC is [CNIC_1] and my DOB is [DATE_OF_BIRTH_1].`
- Below the text boxes, the Entity Table should list all detected items with their confidence scores and colored badges.

### Test 2: Custom Rules Engine
**Feature:** Detecting user-defined keywords, regex patterns, or globs.
**Action:**
1. Open the **Settings Modal** (gear icon) or the Extension Options page.
2. Under "Custom Rules", you should see pre-loaded rules like "Project Phoenix".
3. Add a new rule: Type = `keyword`, Values = `SuperSecretProject`, Category = `PROJECT_CODENAME`.
4. Go back to the Redact Tab and type: `We are launching SuperSecretProject tomorrow.`
**Expected Output:**
- `SuperSecretProject` is instantly highlighted and replaced with `[PROJECT_CODENAME_1]`.

### Test 3: Document Redaction (PDF, DOCX, XLSX, TXT, CSV)
**Feature:** Safe removal of sensitive data from physical files.
**Action:**
1. Create a plain text file (`test.txt`) containing: `John Smith's email is john@company.com.`
2. Go to the Redact Tab, click **Upload Document**, and select `test.txt`.
**Expected Output:**
- A file named `safe_test.txt` is automatically downloaded.
- Opening `safe_test.txt` reveals the text: `[PERSON_1]'s email is [EMAIL_1].`
*(You can repeat this process with a `.docx`, `.pdf`, `.csv`, or `.xlsx` file containing the same text. The output file will maintain its format but with redacted data).*

### Test 4: Entity Toggle (Selective Un-redaction)
**Feature:** Allowing specific safe entities to pass through un-redacted.
**Action:**
1. Paste `My name is Alice and my email is alice@test.com` into the Redact Tab.
2. In the Entity Table below, uncheck the box next to the `[PERSON_1]` (Alice).
**Expected Output:**
- The safe text immediately updates to: `My name is Alice and my email is [EMAIL_1]`.

### Test 5: Vault Restoration (Exact & Fuzzy Match)
**Feature:** Swapping placeholders back to their original values, even if the AI slightly modifies them.
**Action:**
1. After completing Test 1, click **Send to Restore**.
2. Switch to the **Restore Tab**. Ensure the latest session is selected.
3. Paste the following simulated AI response:
```text
I have checked the server [IPV4_1]. I emailed [EMAIL_1] and called PHONE_1 (notice the missing brackets). 
I also rotated the key API_KEY_1 and verified the card [CREDIT_CARD_1].
```
**Expected Output:**
- The right panel instantly decodes the text to:
`I have checked the server 192.168.1.1. I emailed test@example.com and called 555-0198. I also rotated the key AKIAIOSFODNN7EXAMPLE and verified the card 4111-1111-1111-1111.`
*(Note how `PHONE_1` and `API_KEY_1` were successfully restored even though the brackets were removed by the AI, proving the fuzzy-matcher works!).*

### Test 6: Metrics & Telemetry
**Feature:** Tracking total protected items locally.
**Action:**
1. Click on the **Metrics Tab**.
**Expected Output:**
- The total items protected counter should have increased based on the previous tests.
- The bar charts and donut charts should accurately reflect the breakdown of entity types (e.g., Emails, API Keys) you just processed.

### Test 7: Chrome Extension Interceptor
**Feature:** Intercepting inputs natively on ChatGPT/Claude websites.
**Action:**
1. Load the `extension/dist` folder into Chrome (`chrome://extensions` -> Load Unpacked).
2. Go to `https://chatgpt.com`.
3. Type `My secret email is hidden@domain.com` into the chat input box.
4. Click the floating `🛡️ Redact Input` button injected by Ratchet.
**Expected Output:**
- The text inside the ChatGPT input box is instantly replaced with `My secret email is [EMAIL_1]`.
- (To restore the AI's answer, you can open the Ratchet Extension popup and use the Restore tab).
