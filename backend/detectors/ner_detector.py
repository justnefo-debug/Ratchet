import spacy
from typing import List
from core.models import Entity

class NERDetector:
    def __init__(self):
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except:
            self.nlp = None

    def detect(self, text: str) -> List[Entity]:
        if not self.nlp:
            return []
        
        doc = self.nlp(text)
        entities = []
        for ent in doc.ents:
            if ent.label_ in ["PERSON", "ORG", "GPE", "LOC", "DATE", "MONEY", "NORP"]:
                if ent.label_ == "ORG" and ent.text.upper() in ["API", "CNIC", "SSN"]:
                    continue
                entities.append(Entity(
                    type=ent.label_,
                    value=ent.text,
                    start=ent.start_char,
                    end=ent.end_char,
                    confidence=0.85
                ))
        return entities
