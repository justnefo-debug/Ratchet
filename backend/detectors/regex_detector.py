import re
from typing import List
from core.models import Entity

class RegexDetector:
    # We pre-compile patterns for performance
    PATTERNS = {
        "EMAIL": (re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b"), 0.95),
        "PHONE": (re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}(?:[-.\s]?\d{3,4})?\b"), 0.90),
        "CNIC": (re.compile(r"\b\d{5}-\d{7}-\d\b"), 0.99),
        "API_KEY": (re.compile(r"\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b"), 0.99),
        "PERSON": (re.compile(r"\b[A-Z]\.[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b"), 0.95),
        "CREDIT_CARD": (re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{4}[-\s]?\d{6}[-\s]?\d{5}\b"), 0.98),
        "SSN": (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), 0.99),
        "IPV4": (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), 0.95),
        "IPV6": (re.compile(r"\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b"), 0.95),
        "MAC_ADDRESS": (re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b"), 0.95),
        "URL_WITH_CREDS": (re.compile(r"https?://\w+:\w+@"), 0.99),
        "DATE_OF_BIRTH": (re.compile(r"\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b|\b(?:0[1-9]|[12]\d|3[01])[-/](?:0[1-9]|1[0-2])[-/](?:19|20)\d{2}\b"), 0.85),
        "PASSPORT": (re.compile(r"\b[A-Z0-9]{6,9}\b"), 0.70) # Lower confidence as it's just alphanumeric
    }

    @staticmethod
    def _luhn_check(card_number: str) -> bool:
        digits = [int(c) for c in card_number if c.isdigit()]
        if len(digits) < 13 or len(digits) > 19:
            return False
        
        checksum = 0
        reverse_digits = digits[::-1]
        for i, digit in enumerate(reverse_digits):
            if i % 2 == 1:
                digit *= 2
                if digit > 9:
                    digit -= 9
            checksum += digit
            
        return checksum % 10 == 0

    def detect(self, text: str) -> List[Entity]:
        entities = []
        for type_name, (pattern, conf) in self.PATTERNS.items():
            for match in pattern.finditer(text):
                value = match.group(0)
                
                # Special validation for credit cards
                if type_name == "CREDIT_CARD" and not self._luhn_check(value):
                    continue
                    
                # Basic validation for IPV4
                if type_name == "IPV4":
                    parts = value.split('.')
                    if any(int(p) > 255 for p in parts):
                        continue
                        
                entities.append(Entity(
                    type=type_name,
                    value=value,
                    start=match.start(),
                    end=match.end(),
                    confidence=conf
                ))
        return entities
