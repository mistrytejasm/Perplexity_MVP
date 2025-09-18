import os
import hashlib
import uuid
import time
from typing import Optional
from fastapi import UploadFile, HTTPException
import aiofiles
import logging

logger = logging.getLogger(__name__)

class DocumentUploadHandler:
    def __init__(self):
        self.upload_dir = "storage/uploads"
        self.max_file_size = 50 * 1024 * 1024  # 50MB
        self.allowed_types = {
            "application/pdf": ".pdf"
        }
        
        # Create upload directory if it doesn't exist
        os.makedirs(self.upload_dir, exist_ok=True)
    
    async def validate_and_save_file(self, file: UploadFile) -> tuple[str, str, str]:
        """Validate file and save to disk. Returns (file_path, file_id, file_hash)"""
        
        # Validate file type
        if file.content_type not in self.allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Only PDF files are allowed."
            )
        
        # Read file content
        content = await file.read()
        
        # Validate file size
        if len(content) > self.max_file_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {self.max_file_size / 1024 / 1024:.1f}MB"
            )
        
        # Generate file hash and unique ID
        file_hash = hashlib.sha256(content).hexdigest()
        file_id = str(uuid.uuid4())
        
        # Generate unique filename
        file_extension = self.allowed_types.get(file.content_type, "")
        stored_filename = f"{file_id}{file_extension}"
        file_path = os.path.join(self.upload_dir, stored_filename)
        
        # Save file to disk
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
        
        logger.info(f"File saved: {file.filename} -> {file_path}")
        return file_path, file_id, file_hash
    
    def get_file_info(self, file_path: str) -> dict:
        """Get file information"""
        if not os.path.exists(file_path):
            return {}
        
        stat = os.stat(file_path)
        return {
            "size": stat.st_size,
            "created": stat.st_ctime
        }
