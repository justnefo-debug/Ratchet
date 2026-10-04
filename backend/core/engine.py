from typing import List, Tuple, Dict
from detectors.regex_detector import RegexDetector
from detectors.ner_detector import NERDetector
from detectors.custom_rules import CustomRulesDetector
from core.redactor import Redactor
from core.restorer import Restorer
from core.mapping_store import MappingStore
from core.models import Entity

class PipelineEngine:
    def __init__(self):
        self.regex_detector = RegexDetector()
        self.ner_detector = NERDetector()
        self.custom_rules_detector = CustomRulesDetector()
        self.redactor = Redactor()
        self.restorer = Restorer()
        self.store = MappingStore()
        
    def detect_all(self, text: str) -> List[Entity]:
        entities = []
        entities.extend(self.regex_detector.detect(text))
        entities.extend(self.ner_detector.detect(text))
        entities.extend(self.custom_rules_detector.detect(text))

        
        # Simple deduplication by overlapping intervals
        entities.sort(key=lambda x: x.start)
        merged = []
        for ent in entities:
            if not merged:
                merged.append(ent)
            else:
                last = merged[-1]
                if ent.start < last.end:
                    # overlapping, keep the one with higher confidence
                    if ent.confidence > last.confidence:
                        merged[-1] = ent
                else:
                    merged.append(ent)
        return merged

    def process_redact(self, text: str, session_id: str = None) -> Tuple[str, List[Entity], str]:
        entities = self.detect_all(text)
        redacted_text, mapping = self.redactor.redact(text, entities)
        
        if not session_id:
            session_id = self.store.create_session()
            
        self.store.save_mapping(session_id, mapping)
        return redacted_text, entities, session_id

    def process_restore(self, text: str, session_id: str) -> str:
        mapping = self.store.get_mapping(session_id)
        if not mapping:
            return text
        return self.restorer.restore(text, mapping)
