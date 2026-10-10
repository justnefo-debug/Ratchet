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
        
    def detect_all(self, text: str, custom_rules: List[Dict] = None) -> List[Entity]:
        entities = []
        entities.extend(self.regex_detector.detect(text))
        entities.extend(self.ner_detector.detect(text))
        
        if custom_rules is not None:
            temp_detector = CustomRulesDetector()
            adapted_rules = []
            for r in custom_rules:
                if not r.get("enabled", True):
                    continue
                rule_type = "regex" if r.get("isRegex") else "keyword"
                adapted_rule = {
                    "type": rule_type,
                    "category": r.get("placeholderPrefix", "CUSTOM"),
                    "enabled": r.get("enabled", True)
                }
                if rule_type == "keyword":
                    adapted_rule["values"] = [r.get("pattern")]
                else:
                    adapted_rule["pattern"] = r.get("pattern")
                adapted_rules.append(adapted_rule)
            temp_detector.rules = adapted_rules
            entities.extend(temp_detector.detect(text))
        else:
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

    def process_redact(self, text: str, session_id: str = None, custom_rules: List[Dict] = None) -> Tuple[str, List[Entity], str]:
        entities = self.detect_all(text, custom_rules)
        redacted_text, mapping = self.redactor.redact(text, entities)
        
        if not session_id and mapping:
            session_id = self.store.create_session()
            
        if session_id and mapping:
            self.store.save_mapping(session_id, mapping)
            
        return redacted_text, entities, session_id or "empty"

    def process_restore(self, text: str, session_id: str) -> str:
        mapping = self.store.get_mapping(session_id)
        if not mapping:
            return text
        return self.restorer.restore(text, mapping)
