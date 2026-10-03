import re
from typing import List
from core.models import Entity

class RegexDetector:
    PATTERNS = {
        "EMAIL": (r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b", 0.95),
        "PHONE": (r"\b(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b", 0.90),
        "CNIC": (r"\b\d{5}-\d{7}-\d\b", 0.99),
        "API_KEY": (r"\b(?:sk-[a-zA-Z0-9_-]{12,64}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36})\b", 0.99),
        "PERSON": (r"\b[A-Z]\.[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b", 0.95)
    }

    def detect(self, text: str) -> List[Entity]:
        entities = []
        for type_name, (pattern, conf) in self.PATTERNS.items():
            for match in re.finditer(pattern, text):
                entities.append(Entity(
                    type=type_name,
                    value=match.group(0),
                    start=match.start(),
                    end=match.end(),
                    confidence=conf
                ))
        return entities
