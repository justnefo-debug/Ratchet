import os
from typing import List, Dict
from core.models import Entity
from .base_handler import DocumentHandler

class TextHandler(DocumentHandler):
    def extract_text(self, file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
            
    def rebuild(self, file_path: str, mapping: Dict[str, str], entities: List[Entity]) -> str:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
            
        for placeholder, original in mapping.items():
            text = text.replace(original, placeholder)
            
        safe_path = file_path.rsplit('.', 1)[0] + '_safe.' + file_path.rsplit('.', 1)[1]
        with open(safe_path, 'w', encoding='utf-8') as f:
            f.write(text)
            
        return safe_path
        
    def clean_metadata(self, file_path: str):
        # Plain text files don't have standard embedded metadata
        pass
