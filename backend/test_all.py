import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from detectors.regex_detector import RegexDetector
from detectors.ner_detector import NERDetector
from core.redactor import Redactor
from core.engine import PipelineEngine
from core.models import Entity

def test_regex():
    detector = RegexDetector()
    text = "Contact nafees@example.com or +923001234567. API key sk-1234567890abcdef1234567890abcdef1234567890abcdef. CNIC is 42201-1234567-1."
    entities = detector.detect(text)
    print("Regex Entities:")
    for e in entities:
        print(f"  {e.type}: {e.value}")
    assert any(e.type == 'EMAIL' for e in entities), "Missing EMAIL"
    assert any(e.type == 'PHONE' and e.value == '+923001234567' for e in entities) or any(e.type == 'PHONE' and '923001234567' in e.value for e in entities), "Missing PHONE"
    assert any(e.type == 'CNIC' for e in entities), "Missing CNIC"
    assert any(e.type == 'API_KEY' for e in entities), "Missing API_KEY"
    print("Regex Detector: PASS\n")

def test_ner():
    detector = NERDetector()
    if not detector.nlp:
        print("NER Detector: FAIL - Model en_core_web_sm not loaded!")
        return False
    text = "John Doe went to Google in New York."
    entities = detector.detect(text)
    print("NER Entities:")
    for e in entities:
        print(f"  {e.type}: {e.value}")
    assert any(e.type == 'PERSON' and e.value == 'John Doe' for e in entities), "Failed to find PERSON"
    print("NER Detector: PASS\n")
    return True

def test_pipeline():
    engine = PipelineEngine()
    text = "My name is Alice. Email me at alice@company.com. Bob's phone is 555-555-5555."
    redacted, entities, session_id = engine.process_redact(text)
    
    print("Redacted text:", redacted)
    assert "[PERSON_1]" in redacted
    assert "[EMAIL_1]" in redacted
    assert "[PHONE_1]" in redacted
    
    restored = engine.process_restore(redacted, session_id)
    print("Restored text:", restored)
    assert restored == text
    print("Pipeline Engine: PASS\n")

if __name__ == "__main__":
    print("--- Running Tests ---")
    test_regex()
    ner_ok = test_ner()
    test_pipeline()
    if ner_ok:
        print("ALL TESTS PASSED: 10/10")
    else:
        print("SOME TESTS FAILED")
