import os

class Settings:
    DEBUG = os.environ.get("DEBUG", "True").lower() == "true"
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-do-not-use-in-prod")
    MAPPING_STORE_FILE = "mappings.json"
    CONFIDENCE_THRESHOLD = 0.5
    
    # New Settings
    SESSION_TIMEOUT_SECONDS = 3600 # 1 hour default
    PLACEHOLDER_FORMAT = "[{TYPE}_{INDEX}]" # Format string
    
    # Presets mapping sensitivity level to baseline threshold adjustments
    SENSITIVITY_LEVELS = {
        "low": 0.8,     # Only very confident detections
        "medium": 0.6,  # Balanced
        "high": 0.4     # Catch almost everything, more false positives
    }
    
    # Can be overridden by user
    ACTIVE_SENSITIVITY = "medium"
    
    # Entity-specific threshold modifiers (added to base sensitivity)
    ENTITY_THRESHOLDS = {
        "PERSON": 0.1,  # Names are harder, need slightly higher threshold
        "EMAIL": -0.2,  # Emails are easy regex, can be lower
        "CREDIT_CARD": -0.2
    }

