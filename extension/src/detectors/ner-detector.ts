/**
 * Ratchet Privacy Shield — Named Entity Recognition Detector (Tier 2 Stub)
 *
 * Interface for model-based NER. In future phases, this will be powered
 * by a lightweight quantized ONNX model running in an offscreen document.
 */

import type { DetectedEntity } from '../shared/types';

export async function detectWithNer(_text: string): Promise<DetectedEntity[]> {
  // Stub interface for Tier 2 NER
  return [];
}
