import os

class Settings:
    DEBUG = os.environ.get("DEBUG", "True").lower() == "true"
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-do-not-use-in-prod")
    MAPPING_STORE_FILE = "mappings.json"
    CONFIDENCE_THRESHOLD = 0.5
