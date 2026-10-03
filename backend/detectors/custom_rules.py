from typing import List
from core.models import Entity

class CustomRulesDetector:
    def __init__(self):
        self.rules = []
        
    def detect(self, text: str) -> List[Entity]:
        # Custom rules engine (keyword, glob, regex) would go here
        return []
