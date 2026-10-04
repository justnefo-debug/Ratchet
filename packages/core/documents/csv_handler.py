import os
import pandas as pd
from typing import List, Dict
from core.models import Entity
from .base_handler import DocumentHandler

class CSVHandler(DocumentHandler):
    def extract_text(self, file_path: str) -> str:
        # Read all columns as string to avoid dropping leading zeros, etc.
        df = pd.read_csv(file_path, dtype=str)
        text_parts = []
        
        # Add headers
        text_parts.append(", ".join(str(c) for c in df.columns))
        
        # Add values
        for _, row in df.iterrows():
            text_parts.append(", ".join(str(v) for v in row.values if pd.notna(v)))
            
        return "\n".join(text_parts)
            
    def rebuild(self, file_path: str, mapping: Dict[str, str], entities: List[Entity]) -> str:
        df = pd.read_csv(file_path, dtype=str)
        
        def replace_in_text(val):
            if pd.isna(val):
                return val
            val_str = str(val)
            for placeholder, original in mapping.items():
                if original in val_str:
                    val_str = val_str.replace(original, placeholder)
            return val_str
            
        # Replace in column names
        new_columns = []
        for col in df.columns:
            new_columns.append(replace_in_text(col))
        df.columns = new_columns
        
        # Replace in values
        df = df.map(replace_in_text)
            
        safe_path = file_path.replace(".csv", "_safe.csv")
        df.to_csv(safe_path, index=False)
        return safe_path
        
    def clean_metadata(self, file_path: str):
        # CSV files don't have standard embedded metadata
        pass
