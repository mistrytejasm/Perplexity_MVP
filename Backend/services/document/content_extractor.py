import fitz  # fitz
import pytesseract
from PIL import Image
import io
import logging
from dataclasses import dataclass
from typing import List

logger = logging.getLogger(__name__)

@dataclass
class ExtractedContent:
    text: str
    total_pages: int
    extraction_method: str

class DocumentContentExtractor:
    def __init__(self):
        self.min_text_threshold = 100  # Minimum characters to consider text extraction successful
    
    def extract_from_pdf(self, file_path: str) -> ExtractedContent:
        """Extract text from PDF file"""
        
        logger.info(f"Extracting content from: {file_path}")
        
        try:
            doc = fitz.open(file_path)
            total_pages = len(doc)
            text_content = ""
            
            # Try direct text extraction first
            for page_num in range(total_pages):
                page = doc[page_num]
                page_text = page.get_text()
                text_content += f"\n--- Page {page_num + 1} ---\n{page_text}"
            
            doc.close()
            
            # Check if we got meaningful text
            clean_text = text_content.strip()
            if len(clean_text) > self.min_text_threshold:
                logger.info(f"Direct text extraction successful: {len(clean_text)} characters")
                return ExtractedContent(
                    text=clean_text,
                    total_pages=total_pages,
                    extraction_method="direct"
                )
            else:
                logger.info("Direct extraction yielded little text, trying OCR...")
                return self._extract_with_ocr(file_path, total_pages)
                
        except Exception as e:
            logger.error(f"PDF extraction failed: {e}")
            raise Exception(f"Failed to extract content from PDF: {str(e)}")
    
    def _extract_with_ocr(self, file_path: str, total_pages: int) -> ExtractedContent:
        """Extract text using OCR for scanned PDFs"""
        
        try:
            doc = fitz.open(file_path)
            ocr_text = ""
            
            for page_num in range(total_pages):
                page = doc[page_num]
                
                # Convert page to image
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better OCR
                img_data = pix.tobytes("png")
                
                # OCR the image
                image = Image.open(io.BytesIO(img_data))
                page_text = pytesseract.image_to_string(image, lang='eng')
                
                ocr_text += f"\n--- Page {page_num + 1} ---\n{page_text}"
            
            doc.close()
            
            logger.info(f"OCR extraction completed: {len(ocr_text)} characters")
            return ExtractedContent(
                text=ocr_text.strip(),
                total_pages=total_pages,
                extraction_method="ocr"
            )
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
            raise Exception(f"OCR extraction failed: {str(e)}")
