import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.models import Entity
from core.redactor import Redactor
from core.engine import PipelineEngine

def run_tests():
    print("--- Detailed Unit Tests ---")
    
    # 1. Test Redactor Deduplication & Numbering
    redactor = Redactor()
    text = "John is here. Jane is here. John left."
    # We supply 3 entities, two of which are identical values
    entities = [
        Entity(type="PERSON", value="John", start=0, end=4, confidence=1.0),
        Entity(type="PERSON", value="Jane", start=14, end=18, confidence=1.0),
        Entity(type="PERSON", value="John", start=28, end=32, confidence=1.0)
    ]
    redacted, mapping = redactor.redact(text, entities)
    # They should be numbered [PERSON_1], [PERSON_2], [PERSON_3]
    # Because redactor processes them backwards by default to avoid shifting indices.
    # Wait, my Redactor does `sorted(reverse=True)`.
    # Let's check the result.
    print("Redacted:", redacted)
    print("Mapping:", mapping)
    
    # 2. Test Engine Overlapping Logic
    engine = PipelineEngine()
    text_overlap = "Contact me at +923001234567, or email me."
    # Let's mock the detectors for this test
    class MockRegex:
        def detect(self, t):
            # PHONE has confidence 0.90, say it matches the whole thing
            # We'll simulate a fake overlap
            return [
                Entity(type="PHONE", value="+923001234567", start=14, end=27, confidence=0.90),
                Entity(type="FAKE_TYPE", value="300123", start=17, end=23, confidence=0.95)
            ]
    class MockNER:
        def detect(self, t):
            return []
            
    engine.regex_detector = MockRegex()
    engine.ner_detector = MockNER()
    
    res = engine.detect_all(text_overlap)
    # The one with higher confidence should win (FAKE_TYPE 0.95 vs PHONE 0.90)
    print("Overlap resolution result:", [e.type for e in res])
    assert len(res) == 1
    assert res[0].type == "FAKE_TYPE"

if __name__ == "__main__":
    run_tests()
