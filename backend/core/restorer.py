import re
from typing import Dict

class Restorer:
    def restore(self, text: str, mapping: Dict[str, str]) -> str:
        restored_text = text
        unmatched = {}
        
        # Pass 1: Exact matching
        for placeholder, original in mapping.items():
            if placeholder in restored_text:
                restored_text = restored_text.replace(placeholder, original)
            else:
                unmatched[placeholder] = original
                
        # Pass 2: Fuzzy matching for modified placeholders (e.g. AI removed brackets or pluralized)
        for placeholder, original in unmatched.items():
            # e.g., "[PERSON_1]" -> "PERSON_1"
            base_placeholder = placeholder.strip("[]")
            
            # Look for variations like "PERSON_1", "PERSON 1", "person_1"
            pattern = re.compile(
                r'\b' + re.escape(base_placeholder.replace('_', ' ')) + r's?\b|\b' + 
                re.escape(base_placeholder) + r's?\b', 
                re.IGNORECASE
            )
            restored_text = pattern.sub(original, restored_text)
            
        return restored_text
