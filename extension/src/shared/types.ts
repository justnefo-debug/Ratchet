export interface DetectedEntity {
  id: string;
  type: string;
  originalValue: string;
  placeholder: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  enabled: boolean;
  category?: string;
}
