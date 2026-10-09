/**
 * Ratchet Privacy Shield — NER Backend Interface
 *
 * Provides an abstract interface for Named Entity Recognition backends
 * (e.g. GazetteerRuleNerBackend or future local ONNX/WASM model backends).
 */

import type { DetectedEntity, Sensitivity } from '../shared/types';

export interface NerBackendOptions {
  sensitivity?: Sensitivity;
  enabledTypes?: {
    person?: boolean;
    org?: boolean;
    location?: boolean;
  };
}

export interface NerBackend {
  readonly name: string;
  detect(text: string, options?: NerBackendOptions): Promise<DetectedEntity[]>;
}
