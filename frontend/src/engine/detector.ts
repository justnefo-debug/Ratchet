import type { DetectedEntity, EntityType, CustomRule } from '../types';

interface RawMatch {
  type: EntityType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  category?: string;
  priority: number;
}

// Luhn algorithm check for credit cards
function isValidLuhn(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let isSecond = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (isSecond) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    isSecond = !isSecond;
  }
  return sum % 10 === 0;
}

export function detectEntitiesInText(
  text: string,
  customRules: CustomRule[] = [],
  enabledTypes: Record<EntityType, boolean> = {
    Name: true,
    Email: true,
    CNIC: true,
    'API key': true,
    Phone: true,
    'Credit Card': true,
    Address: true,
    'IP Address': true,
    Custom: true,
  }
): DetectedEntity[] {
  if (!text || text.trim() === '') {
    return [];
  }

  const rawMatches: RawMatch[] = [];

  // 1. Email detection
  if (enabledTypes['Email']) {
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    let match: RegExpExecArray | null;
    while ((match = emailRegex.exec(text)) !== null) {
      rawMatches.push({
        type: 'Email',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 99,
        priority: 10,
      });
    }
  }

  // 2. Pakistani CNIC detection: 42201-1234567-1 or 13 digits
  if (enabledTypes['CNIC']) {
    const cnicRegex = /\b\d{5}-\d{7}-\d{1}\b/g;
    let match: RegExpExecArray | null;
    while ((match = cnicRegex.exec(text)) !== null) {
      rawMatches.push({
        type: 'CNIC',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 97,
        priority: 9,
      });
    }
  }

  // 3. API Keys & Secrets
  if (enabledTypes['API key']) {
    // OpenAI / Stripe / modern API key patterns like sk-...
    const apiKeyRegexes = [
      /\bsk-[a-zA-Z0-9_-]{12,64}\b/g,
      /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS Access Key
      /\bgh[pousr]_[0-9a-zA-Z]{36}\b/g, // GitHub Token
      /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g, // Slack Token
      /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, // JWT Token
      /(?:api[_-]?key|secret|token|bearer)["']?\s*(?::|=|\s)\s*["']?([a-zA-Z0-9_\-\.]{16,48})["']?/gi,
    ];

    for (const regex of apiKeyRegexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const fullMatch = match[1] || match[0];
        const start = match.index + (match[1] ? match[0].indexOf(match[1]) : 0);
        rawMatches.push({
          type: 'API key',
          value: fullMatch,
          startIndex: start,
          endIndex: start + fullMatch.length,
          confidence: 96,
          priority: 8,
        });
      }
    }
  }

  // 4. Credit Card numbers
  if (enabledTypes['Credit Card']) {
    const ccRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{4}[-\s]?\d{6}[-\s]?\d{5}\b/g;
    let match: RegExpExecArray | null;
    while ((match = ccRegex.exec(text)) !== null) {
      const cleanVal = match[0].replace(/[-\s]/g, '');
      if (isValidLuhn(cleanVal)) {
        rawMatches.push({
          type: 'Credit Card',
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 98,
          priority: 9,
        });
      }
    }
  }

  // 5. Phone numbers
  if (enabledTypes['Phone']) {
    // International format (+92 300 1234567, +1-555-123-4567, 0300-1234567)
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}(?:[-.\s]?\d{3,4})?\b/g;
    let match: RegExpExecArray | null;
    while ((match = phoneRegex.exec(text)) !== null) {
      // Ignore if it's pure digits under 10 or looks like a CNIC
      const digitsOnly = match[0].replace(/\D/g, '');
      if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
        rawMatches.push({
          type: 'Phone',
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 94,
          priority: 5,
        });
      }
    }
  }

  // 6. IP Addresses
  if (enabledTypes['IP Address']) {
    const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
    let match: RegExpExecArray | null;
    while ((match = ipRegex.exec(text)) !== null) {
      rawMatches.push({
        type: 'IP Address',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 95,
        priority: 7,
      });
    }
  }

  // 7. Names detection (Contextual phrases & common patterns like M.Nafees)
  if (enabledTypes['Name']) {
    // Pattern A: "Hi, my name is X and", "I am X", "Name: X"
    const namePhraseRegex = /(?:my name is|i am|name is|reach out to|contact)\s+([A-Z][a-zA-Z\.]+(?:\s+[A-Z][a-zA-Z\.]+){0,3})\b/gi;
    let match: RegExpExecArray | null;
    while ((match = namePhraseRegex.exec(text)) !== null) {
      if (match[1]) {
        const val = match[1].trim();
        // Ignore single words that are common words
        if (!['Tech', 'Solutions', 'The', 'Here', 'Please', 'Ready'].includes(val)) {
          const start = match.index + match[0].indexOf(val);
          rawMatches.push({
            type: 'Name',
            value: val,
            startIndex: start,
            endIndex: start + val.length,
            confidence: 98,
            priority: 6,
          });
        }
      }
    }

    // Pattern B: Initials + surname (e.g. M.Nafees, J.Smith, A.K. Khan)
    const initialNameRegex = /\b[A-Z]\.[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b/g;
    while ((match = initialNameRegex.exec(text)) !== null) {
      rawMatches.push({
        type: 'Name',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 98,
        priority: 7,
      });
    }

    // Pattern C: Titles like Mr./Ms./Dr. + Name
    const titleNameRegex = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
    while ((match = titleNameRegex.exec(text)) !== null) {
      rawMatches.push({
        type: 'Name',
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 97,
        priority: 7,
      });
    }
  }

  // 8. Custom user rules
  if (enabledTypes['Custom'] && customRules) {
    for (const rule of customRules) {
      if (!rule.enabled || !rule.pattern) continue;
      try {
        const regex = rule.isRegex
          ? new RegExp(rule.pattern, 'gi')
          : new RegExp(`\\b${rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          rawMatches.push({
            type: rule.type || 'Custom',
            value: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: 99,
            category: rule.placeholderPrefix || 'CUSTOM',
            priority: 12, // User custom rules have highest priority
          });
        }
      } catch (err) {
        console.error('Invalid custom rule pattern:', rule.pattern, err);
      }
    }
  }

  // Sort matches by start position, then priority (descending), then length (descending)
  rawMatches.sort((a, b) => {
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
  });

  // Resolve overlaps
  const filteredMatches: RawMatch[] = [];
  let lastEnd = -1;

  for (const m of rawMatches) {
    // Check if overlap exists
    if (m.startIndex >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.endIndex;
    } else {
      // Overlap detected: If current has higher priority or identical start with longer span, replace
      const prev = filteredMatches[filteredMatches.length - 1];
      if (prev && m.priority > prev.priority) {
        filteredMatches.pop();
        filteredMatches.push(m);
        lastEnd = m.endIndex;
      }
    }
  }

  // Assign consistent placeholders
  const typeCounters: Record<string, number> = {};
  const valueToPlaceholder: Map<string, string> = new Map();

  const getPrefix = (type: EntityType, category?: string): string => {
    if (category) return category.toUpperCase();
    switch (type) {
      case 'Name': return 'PERSON';
      case 'Email': return 'EMAIL';
      case 'CNIC': return 'CNIC';
      case 'API key': return 'API_KEY';
      case 'Phone': return 'PHONE';
      case 'Credit Card': return 'CARD';
      case 'Address': return 'ADDRESS';
      case 'IP Address': return 'IP';
      default: return 'ENTITY';
    }
  };

  return filteredMatches.map((match, idx) => {
    let placeholder = valueToPlaceholder.get(match.value);
    if (!placeholder) {
      const prefix = getPrefix(match.type, match.category);
      typeCounters[prefix] = (typeCounters[prefix] || 0) + 1;
      placeholder = `${prefix}_${typeCounters[prefix]}`;
      valueToPlaceholder.set(match.value, placeholder);
    }

    return {
      id: `entity-${idx + 1}-${Date.now().toString(36)}`,
      type: match.type,
      originalValue: match.value,
      placeholder,
      confidence: match.confidence,
      startIndex: match.startIndex,
      endIndex: match.endIndex,
      enabled: true,
      category: match.category,
    };
  });
}

/**
 * Generate safe redacted text by replacing enabled entities with their placeholders
 */
export function buildRedactedText(
  originalText: string,
  entities: DetectedEntity[]
): string {
  if (!originalText) return '';
  // Only redact entities that are enabled
  const activeEntities = entities
    .filter((e) => e.enabled)
    .sort((a, b) => b.startIndex - a.startIndex); // Replace from end to beginning to preserve indices

  let result = originalText;
  for (const entity of activeEntities) {
    const before = result.slice(0, entity.startIndex);
    const after = result.slice(entity.endIndex);
    result = before + entity.placeholder + after;
  }
  return result;
}
