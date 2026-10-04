import json
import uuid
import time
from typing import Dict, Any, List
from cryptography.fernet import Fernet

class MappingStore:
    def __init__(self):
        self.key = Fernet.generate_key()
        self.cipher = Fernet(self.key)
        # sessions structure: { session_id: { 'mapping': {placeholder: encrypted_val}, 'created_at': timestamp } }
        self.sessions = {}

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            'mapping': {},
            'created_at': time.time()
        }
        return session_id
        
    def save_mapping(self, session_id: str, mapping: Dict[str, str]):
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                'mapping': {},
                'created_at': time.time()
            }
            
        for placeholder, original in mapping.items():
            encrypted_val = self.cipher.encrypt(original.encode()).decode()
            self.sessions[session_id]['mapping'][placeholder] = encrypted_val
            
    def get_mapping(self, session_id: str) -> Dict[str, str]:
        if session_id not in self.sessions:
            return {}
            
        mapping = {}
        for placeholder, encrypted_val in self.sessions[session_id]['mapping'].items():
            original = self.cipher.decrypt(encrypted_val.encode()).decode()
            mapping[placeholder] = original
            
        # Refresh timestamp on access
        self.sessions[session_id]['created_at'] = time.time()
        return mapping

    def list_sessions(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": sid,
                "created_at": data['created_at'],
                "items_count": len(data['mapping'])
            }
            for sid, data in self.sessions.items()
        ]

    def delete_session(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]

    def cleanup_expired(self, ttl_seconds: int = 3600):
        current_time = time.time()
        expired_keys = [
            sid for sid, data in self.sessions.items()
            if current_time - data['created_at'] > ttl_seconds
        ]
        for sid in expired_keys:
            del self.sessions[sid]
