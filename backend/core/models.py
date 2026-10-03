from dataclasses import dataclass
from typing import List, Optional

@dataclass
class Entity:
    type: str
    value: str
    start: int
    end: int
    confidence: float
    placeholder: Optional[str] = None
