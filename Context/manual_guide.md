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

## 🧪 End-to-End Stress Test

If you want to quickly test the full power of Ratchet, follow these steps using the complex text below:

### Step 1: Redact
Copy and paste this block into the **Redact tab** on the left:

```text
Confidential Memo - INTERNAL USE ONLY

On October 4th, 2026, I, Dr. A.Smith, met with the engineering lead (contact: J.Doe or reach him at +1 (415) 555-9821 / j.doe_secret@alpha-corp.io). We discussed the migration of the database server located at 192.168.100.45.

Please note the following credentials must be rotated immediately:
AWS Access Key: AKIAIOSFODNN7EXAMPLE
GitHub Token: ghp_9876543210abcdef9876543210abcdef9876
Stripe Prod Key: sk-live-51HxyzABCDEF1234567890mnopqrstuv

Also, finance requested we verify the transaction made with the corporate Visa card ending in 4111. The full number on file is 4111-1111-1111-1111 (Luhn valid). 

Lastly, Syed Bilal's Pakistani ID (CNIC: 42101-1122334-9) needs to be updated in the HR portal along with his alternate contact number 0300-1234567. He is based out of Karachi.
```

### Step 2: Send to Vault
Click the **"Send to Restore"** button at the bottom of the Redact tab. This securely saves your original data in the local vault and switches you to the Restore tab.

### Step 3: Restore
Now, copy and paste this simulated AI response into the **Restore tab** on the left to watch Ratchet automatically unpack the vault and swap your originals back in:

```text
Thank you for the update. I have logged the migration of the database server at [IP_1]. 

I strongly recommend that you notify [PERSON_1] and [PERSON_2] immediately. A security alert will be dispatched to [EMAIL_1] and an SMS to [PHONE_1]. 

The credentials [API_KEY_1], [API_KEY_2], and [API_KEY_3] must be rotated via your cloud provider's secure console. 

We have also verified the charges on the card [CARD_1]. Finally, the HR record for [PERSON_3] (ID: [CNIC_1]) and their contact number [PHONE_2] have been successfully updated in the system.
```

---

## 📁 Document Upload Test Data

To test the **Document Upload** feature (true redaction for files), you will need to create a test file. Here is sample data you can use to create your own test `.docx` (Word), `.xlsx` (Excel), or `.pdf` file.

### For a Word (.docx) or PDF File:
1. Open Microsoft Word or Google Docs.
2. Copy and paste the following text into the document:

```text
EMPLOYEE HR RECORD
Name: Johnathan Davis
Personal Email: j.davis_personal@gmail.com
Emergency Contact: +1 (555) 123-9876

Banking Details
Bank Name: Chase Bank
Card on File: 4532-1111-1111-1111
Routing Code: 123456789

System Access Credentials:
AWS Production Key: AKIAIOSFODNN7EXAMPLE
GitHub Admin Token: ghp_9876543210abcdef9876543210abcdef9876
```
3. Save the file as `HR_Test_Record.docx` (or Export it as a PDF).
4. Go to Ratchet's Redact tab, click **Upload Document**, and select the file you just saved. 
5. Open the downloaded `safe_HR_Test_Record` file and verify that the names, emails, cards, and keys are permanently overwritten!

### For an Excel (.xlsx) File:
1. Open Microsoft Excel or Google Sheets.
2. Create a small table by typing the following data into the cells:
   - **Cell A1**: `Customer Name` | **Cell B1**: `Alex Morgan`
   - **Cell A2**: `Email Address` | **Cell B2**: `alex.morgan@startup.io`
   - **Cell A3**: `Billing Card`  | **Cell B3**: `4111-1111-1111-1111`
   - **Cell A4**: `Account ID`    | **Cell B4**: `CNIC: 42101-9998887-1`
3. Save the file as `Finance_Test_Sheet.xlsx`.
4. Upload it to Ratchet, and watch how it securely redacts the specific cells without corrupting the spreadsheet format!

### Step 3: Test Document Restoration
Just like regular text, whenever you upload a document, Ratchet securely saves those placeholders to your local vault. You can test decoding an AI's response to your document by pasting the following into the **Restore Tab**:

**If you uploaded the HR Record (Word/PDF), paste this:**
```text
I have reviewed the HR record for [PERSON_1]. 

I will send the onboarding packet to their personal email at [EMAIL_1] and verify their emergency contact number [PHONE_1]. 

The banking details for the card ending in [CARD_1] have been added to payroll. Please ensure their AWS Key [API_KEY_1] and GitHub Token [API_KEY_2] are rotated every 90 days.
```

**If you uploaded the Finance Sheet (Excel), paste this:**
```text
The spreadsheet has been analyzed. 

The primary customer is [PERSON_1] and they can be contacted at [EMAIL_1]. The recurring billing is set up on the card [CARD_1] linked to the Pakistani Identity Account [CNIC_1].
```
