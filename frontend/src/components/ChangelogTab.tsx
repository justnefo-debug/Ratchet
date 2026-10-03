import React from 'react';
import { Sparkles, Shield, CheckCircle2 } from 'lucide-react';

interface ReleaseNote {
  version: string;
  date: string;
  tag: 'Latest' | 'Stable' | 'Beta';
  highlights: string[];
  features: string[];
  security: string[];
}

const RELEASES: ReleaseNote[] = [
  {
    version: 'v1.0.0',
    date: 'October 2026',
    tag: 'Latest',
    highlights: [
      'Official Production Launch of Ratchet Privacy Shield',
      'Pixel-perfect dark & light modes matching reference design mockups',
      'In-browser 100% on-device detection engine + Python API sync',
    ],
    features: [
      'Side-by-side Dual Panels: "Paste your text" and "Safe version to send"',
      'Real-time inline colored pill badges for detected entities',
      'Pakistani CNIC recognition (NADRA format: 42201-1234567-1)',
      'API Key shield (OpenAI sk-*, AWS AKIA*, GitHub ghp_*, generic tokens)',
      'Interactive Entity Summary Table with per-item whitelist/unhide checkboxes',
      'Dual-Direction Restoration: Instant decryption of AI responses using session vaults',
      'Telemetry & Privacy Shield Metrics dashboard with zero-telemetry enforcement',
      'Custom Rules Manager with live testing preview',
    ],
    security: [
      'AES-256 encrypted in-memory session mappings',
      'Zero remote telemetry: no prompts or sensitive data transmitted outside your browser',
      'Pre-compiled regex safety against ReDoS attacks',
    ],
  },
  {
    version: 'v0.9.5',
    date: 'September 2026',
    tag: 'Stable',
    highlights: [
      'Chrome Extension bridge architecture finalized',
      'Added Pakistani phone numbers and credit card Luhn validation',
    ],
    features: [
      'Prompt interception pipeline for ChatGPT, Claude, and Gemini',
      'Custom prefix placeholder generator ([PERSON_1], [EMAIL_1])',
      'Local storage caching of recent encryption sessions',
    ],
    security: [
      'Strict input sanitization for restored AI responses to prevent XSS',
    ],
  },
  {
    version: 'v0.9.0',
    date: 'August 2026',
    tag: 'Beta',
    highlights: [
      'Core NER + regex proof of concept',
      'Samurai identity branding & "Privacy that only tightens" philosophy',
    ],
    features: [
      'Initial prototype with baseline regex detectors',
      'Basic copy-to-clipboard functionality',
    ],
    security: [
      'Local-first privacy architecture validation',
    ],
  },
];

export const ChangelogTab: React.FC = () => {
  return (
    <div className="changelog-tab-container">
      <div className="changelog-header-card">
        <h2 className="changelog-title">Product Changelog & Updates</h2>
        <p className="changelog-subtitle">
          Track the evolution of the Ratchet privacy shield, new detector rules, and security enhancements.
        </p>
      </div>

      <div className="timeline-container">
        {RELEASES.map((rel, index) => (
          <div key={rel.version} className="timeline-item">
            <div className="timeline-marker">
              <div className={`timeline-dot ${index === 0 ? 'current' : ''}`} />
              {index < RELEASES.length - 1 && <div className="timeline-line" />}
            </div>

            <div className="timeline-content-card">
              <div className="release-header">
                <div className="release-title-row">
                  <h3 className="release-version font-mono">{rel.version}</h3>
                  <span className={`release-tag ${rel.tag.toLowerCase()}`}>{rel.tag}</span>
                </div>
                <span className="release-date">{rel.date}</span>
              </div>

              <div className="release-section">
                <h4 className="section-label">
                  <Sparkles size={14} className="accent-icon" /> Highlights
                </h4>
                <ul className="bullet-list">
                  {rel.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>

              <div className="release-section">
                <h4 className="section-label">
                  <CheckCircle2 size={14} className="accent-icon" /> Features & Improvements
                </h4>
                <ul className="bullet-list">
                  {rel.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div className="release-section">
                <h4 className="section-label">
                  <Shield size={14} className="accent-icon" /> Security & Hardening
                </h4>
                <ul className="bullet-list">
                  {rel.security.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
