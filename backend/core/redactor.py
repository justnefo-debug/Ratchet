from typing import List, Tuple, Dict
from core.models import Entity

class Redactor:
    def redact(self, text: str, entities: List[Entity]) -> Tuple[str, Dict[str, str]]:
        # Pre-assign placeholders left-to-right
        counts = {}
        for ent in sorted(entities, key=lambda x: x.start):
            if ent.type not in counts:
                counts[ent.type] = 1
            else:
                counts[ent.type] += 1
            ent.placeholder = f"[{ent.type}_{counts[ent.type]}]"

        # Sort entities by start index descending to not mess up indices when replacing
        sorted_entities = sorted(entities, key=lambda x: x.start, reverse=True)
        redacted_text = text
        mapping = {}
        
        for ent in sorted_entities:
            # Replace in text
            redacted_text = redacted_text[:ent.start] + ent.placeholder + redacted_text[ent.end:]
            mapping[ent.placeholder] = ent.value
            
        return redacted_text, mapping
