import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
from .base_handler import DocumentHandler
from typing import List, Dict
from core.models import Entity
import os

class PDFHandler(DocumentHandler):
    def extract_text(self, file_path: str) -> str:
        text = ""
        doc = fitz.open(file_path)
        for page in doc:
            page_text = page.get_text("text")
            # If the page has very little text, it might be a scanned document
            if len(page_text.strip()) < 50:
                # Try OCR
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                ocr_text = pytesseract.image_to_string(img)
                text += ocr_text + "\n"
            else:
                text += page_text + "\n"
        doc.close()
        return text
        
    def rebuild(self, file_path: str, mapping: Dict[str, str], entities: List[Entity]) -> str:
        doc = fitz.open(file_path)
        
        # In a real scenario we'd use the mapping/entities to find the exact coordinates
        # PyMuPDF allows us to search text and redact it truly.
        for page in doc:
            for placeholder, original in mapping.items():
                # Search for original text on the page
                text_instances = page.search_for(original)
                for inst in text_instances:
                    # add_redact_annot prepares the redaction box (cross_out=False means fill black or white)
                    # We can use text=placeholder if we want the placeholder text to appear over the box!
                    annot = page.add_redact_annot(inst, text=placeholder, fill=(0, 0, 0))
            
            # apply_redactions() truly removes the underlying text and draws the box
            page.apply_redactions()
            
        safe_path = file_path.replace(".pdf", "_safe.pdf")
        doc.save(safe_path)
        doc.close()
        return safe_path
        
    def clean_metadata(self, file_path: str):
        doc = fitz.open(file_path)
        # Clear all standard metadata
        doc.set_metadata({})
        doc.saveIncr()
        doc.close()
