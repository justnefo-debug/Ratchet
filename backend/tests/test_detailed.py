import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.models import Entity
from core.redactor import Redactor
from core.restorer import Restorer
from core.engine import PipelineEngine
from detectors.regex_detector import RegexDetector
from detectors.custom_rules import CustomRulesDetector
from core.mapping_store import MappingStore

def run_tests():
    print("--- Detailed Unit Tests ---")
    
    # 1. Test Regex Detector
    print("Testing RegexDetector...")
    regex_detector = RegexDetector()
    text = "Email me at john.doe@example.com or call +1-555-123-4567. My API key is sk-abcdef1234567890abcdef1234567890."
    entities = regex_detector.detect(text)
    types = [e.type for e in entities]
    assert "EMAIL" in types, "Failed to detect EMAIL"
    assert "PHONE" in types, "Failed to detect PHONE"
    assert "API_KEY" in types, "Failed to detect API_KEY"
    print("[OK] RegexDetector passed")

    # 2. Test Custom Rules Detector
    print("Testing CustomRulesDetector...")
    custom_rules = CustomRulesDetector()
    # Assuming default_rules.json has "Project Phoenix"
    text_rules = "We are working on Project Phoenix."
    rules_entities = custom_rules.detect(text_rules)
    assert any(e.value == "Project Phoenix" for e in rules_entities), "Failed to detect custom rule keyword"
    print("[OK] CustomRulesDetector passed")

    # 3. Test Overlap Resolution in Engine
    print("Testing Engine Overlap Resolution...")
    engine = PipelineEngine()
    # Mocking detectors to force an overlap scenario
    class MockRegex:
        def detect(self, t):
            return [
                Entity(type="PHONE", value="+923001234567", start=14, end=27, confidence=0.90),
                Entity(type="FAKE_TYPE", value="300123", start=17, end=23, confidence=0.95)
            ]
    class MockNER:
        def detect(self, t): return []
    class MockCustom:
        def detect(self, t): return []
        
    engine.regex_detector = MockRegex()
    engine.ner_detector = MockNER()
    engine.custom_rules_detector = MockCustom()
    
    res = engine.detect_all("Contact me at +923001234567.")
    # FAKE_TYPE has higher confidence, it should win
    assert len(res) == 1, "Overlap not resolved correctly"
    assert res[0].type == "FAKE_TYPE", f"Expected FAKE_TYPE, got {res[0].type}"
    print("[OK] Engine Overlap Resolution passed")

    # 4. Test Redaction and Exact/Fuzzy Restoration
    print("Testing Full Round-Trip (Redact -> Restore)...")
    store = MappingStore()
    redactor = Redactor()
    restorer = Restorer()
    
    original_text = "Alice lives in Wonderland."
    ents = [Entity(type="PERSON", value="Alice", start=0, end=5, confidence=0.99)]
    redacted_text, mapping = redactor.redact(original_text, ents)
    
    assert redacted_text == "[PERSON_1] lives in Wonderland.", "Redaction failed"
    
    # Exact restore
    exact_restored = restorer.restore(redacted_text, mapping)
    assert exact_restored == original_text, "Exact restoration failed"
    
    # Fuzzy restore (simulating AI removing brackets and pluralizing)
    ai_response = "PERSON_1s live in Wonderland."
    fuzzy_restored = restorer.restore(ai_response, mapping)
    assert "Alices live" in fuzzy_restored or "Alice live" in fuzzy_restored, f"Fuzzy restoration failed: {fuzzy_restored}"
    print("[OK] Redact and Restore passed")

    print("--- All tests completed successfully! ---")

if __name__ == "__main__":
    run_tests()
