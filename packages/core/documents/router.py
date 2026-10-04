import os
from .base_handler import DocumentHandler
from .pdf_handler import PDFHandler
from .word_handler import WordHandler
from .excel_handler import ExcelHandler
from .text_handler import TextHandler
from .csv_handler import CSVHandler
from .pptx_handler import PPTXHandler

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
        elif ext in [".txt", ".md"]:
            return TextHandler()
        elif ext in [".csv"]:
            return CSVHandler()
        elif ext in [".pptx"]:
            return PPTXHandler()
        else:
            raise ValueError(f"Unsupported file type: {ext}. Ratchet can't protect this file.")
