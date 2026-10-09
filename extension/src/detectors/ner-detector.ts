/**
 * Ratchet Privacy Shield — Named Entity Recognition Detector
 *
 * Dispatches to an active NerBackend (defaulting to GazetteerRuleNerBackend).
 * Pluggable architecture allows seamless upgrade to future model-based backends
 * without changing callers or service-worker interfaces.
 */

import type { DetectedEntity } from '../shared/types';
import type { NerBackend, NerBackendOptions } from './ner-backend';
import { GazetteerRuleNerBackend } from './gazetteer-ner-backend';

let activeBackend: NerBackend = new GazetteerRuleNerBackend();

export function setNerBackend(backend: NerBackend): void {
  activeBackend = backend;
}

export function getNerBackend(): NerBackend {
  return activeBackend;
}

export async function detectWithNer(
  text: string,
  options?: NerBackendOptions
): Promise<DetectedEntity[]> {
  return activeBackend.detect(text, options);
}
