from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
from core.models import Entity

class DocumentHandler(ABC):
    """
    Base class for all document type handlers in Ratchet.
    Follows the pattern: extract text -> detect -> redact -> rebuild
    """
    
    @abstractmethod
    def extract_text(self, file_path: str) -> str:
        """Extract all scannable text from the document."""
        pass
        
    @abstractmethod
    def rebuild(self, file_path: str, mapping: Dict[str, str], entities: List[Entity]) -> str:
        """
        Rebuild the document with placeholders instead of sensitive data.
        Returns the path to the newly generated safe file.
        """
        pass
        
    @abstractmethod
    def clean_metadata(self, file_path: str):
        """Strip all sensitive metadata from the file."""
        pass
