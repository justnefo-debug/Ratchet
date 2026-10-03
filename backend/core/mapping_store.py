import json
import uuid
import base64
from typing import Dict
from cryptography.fernet import Fernet

class MappingStore:
    def __init__(self):
        # In a real app this would be a secure key, here we generate one for the session
        self.key = Fernet.generate_key()
        self.cipher = Fernet(self.key)
        self.sessions = {} # session_id -> mapping

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {}
        return session_id
        
    def save_mapping(self, session_id: str, mapping: Dict[str, str]):
        if session_id not in self.sessions:
            self.sessions[session_id] = {}
            
        for placeholder, original in mapping.items():
            encrypted_val = self.cipher.encrypt(original.encode()).decode()
            self.sessions[session_id][placeholder] = encrypted_val
            
    def get_mapping(self, session_id: str) -> Dict[str, str]:
        if session_id not in self.sessions:
            return {}
            
        mapping = {}
        for placeholder, encrypted_val in self.sessions[session_id].items():
            original = self.cipher.decrypt(encrypted_val.encode()).decode()
            mapping[placeholder] = original
        return mapping
