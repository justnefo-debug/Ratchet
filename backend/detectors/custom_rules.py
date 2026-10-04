import json
import re
import os
import fnmatch
from typing import List, Dict, Any
from core.models import Entity

class CustomRulesDetector:
    def __init__(self, config_path: str = None):
        self.rules = []
        self.config_path = config_path or os.path.join(
            os.path.dirname(os.path.dirname(__file__)), 
            "config", 
            "default_rules.json"
        )
        self.load_rules()
        
    def load_rules(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    self.rules = json.load(f).get("rules", [])
            except Exception as e:
                print(f"Error loading custom rules: {e}")
                self.rules = []

    def save_rules(self):
        if self.config_path:
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump({"rules": self.rules}, f, indent=4)

    def add_rule(self, rule: Dict[str, Any]):
        self.rules.append(rule)
        self.save_rules()

    def delete_rule(self, rule_name: str):
        self.rules = [r for r in self.rules if r.get("name") != rule_name]
        self.save_rules()

    def list_rules(self) -> List[Dict[str, Any]]:
        return self.rules

    def detect(self, text: str) -> List[Entity]:
        entities = []
        
        # Sort rules by priority (higher priority first)
        sorted_rules = sorted(self.rules, key=lambda r: r.get("priority", 0), reverse=True)
        
        for rule in sorted_rules:
            if not rule.get("enabled", True):
                continue
                
            rule_type = rule.get("type", "keyword")
            category = rule.get("category", "CUSTOM")
            confidence = rule.get("confidence", 0.99)
            
            if rule_type == "keyword":
                for kw in rule.get("values", []):
                    # Use regex with word boundaries for keywords
                    pattern = r"\b" + re.escape(kw) + r"\b"
                    for match in re.finditer(pattern, text, re.IGNORECASE):
                        entities.append(Entity(
                            type=category,
                            value=match.group(0),
                            start=match.start(),
                            end=match.end(),
                            confidence=confidence
                        ))
                        
            elif rule_type == "regex":
                pattern = rule.get("pattern", "")
                if pattern:
                    try:
                        for match in re.finditer(pattern, text):
                            entities.append(Entity(
                                type=category,
                                value=match.group(0),
                                start=match.start(),
                                end=match.end(),
                                confidence=confidence
                            ))
                    except re.error:
                        pass # Ignore invalid regex
                        
            elif rule_type == "glob":
                pattern = rule.get("pattern", "")
                if pattern:
                    # Very simple glob implementation for text (convert to regex)
                    regex_pattern = fnmatch.translate(pattern)
                    try:
                        for match in re.finditer(regex_pattern, text):
                            entities.append(Entity(
                                type=category,
                                value=match.group(0),
                                start=match.start(),
                                end=match.end(),
                                confidence=confidence
                            ))
                    except re.error:
                        pass
                        
        return entities
