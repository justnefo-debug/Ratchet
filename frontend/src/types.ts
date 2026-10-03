export type EntityType =
  | 'Name'
  | 'Email'
  | 'CNIC'
  | 'API key'
  | 'Phone'
  | 'Credit Card'
  | 'Address'
  | 'IP Address'
  | 'Custom';

export interface DetectedEntity {
  id: string;
  type: EntityType;
  originalValue: string;
  placeholder: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  enabled: boolean;
  category?: string;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  originalText: string;
  safeText: string;
  entities: DetectedEntity[];
  name: string;
}

export interface CustomRule {
  id: string;
  name: string;
  pattern: string;
  type: EntityType;
  isRegex: boolean;
  placeholderPrefix: string;
  enabled: boolean;
}

export interface SystemMetrics {
  totalDetected: number;
  totalRedacted: number;
  sessionsCount: number;
  accuracyRate: number;
  entityTypeCounts: Record<string, number>;
  history: Array<{
    id: string;
    timestamp: number;
    entityCount: number;
    types: string[];
    safeSnippet: string;
  }>;
}

export type ActiveTab = 'redact' | 'restore' | 'metrics' | 'changelog';
export type ThemeMode = 'dark' | 'light';
