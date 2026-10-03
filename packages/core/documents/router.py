import os
from .base_handler import DocumentHandler
from .pdf_handler import PDFHandler
from .word_handler import WordHandler
from .excel_handler import ExcelHandler

class DocumentRouter:
    @staticmethod
    def get_handler(file_path: str) -> DocumentHandler:
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext == ".pdf":
            return PDFHandler()
        elif ext in [".docx"]:
            return WordHandler()
        elif ext in [".xlsx", ".xls"]:
            return ExcelHandler()
        else:
            raise ValueError(f"Unsupported file type: {ext}. Ratchet can't protect this file.")
