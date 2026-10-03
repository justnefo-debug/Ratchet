import re
from typing import Dict

class Restorer:
    def restore(self, text: str, mapping: Dict[str, str]) -> str:
        restored_text = text
        for placeholder, original in mapping.items():
            # In some cases the AI might strip the brackets or modify slightly, 
            # for now we do exact replacements.
            restored_text = restored_text.replace(placeholder, original)
        return restored_text
