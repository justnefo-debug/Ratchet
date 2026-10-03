from flask import Flask, request, jsonify
from flask_cors import CORS
from core.engine import PipelineEngine

app = Flask(__name__)
CORS(app)

engine = PipelineEngine()

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Ratchet API is running"})

@app.route("/api/detect", methods=["POST"])
def detect():
    data = request.json
    if not data or "text" not in data:
        return jsonify({"error": "text field is required"}), 400
        
    entities = engine.detect_all(data["text"])
    return jsonify({
        "entities": [
            {
                "type": e.type, 
                "value": e.value, 
                "start": e.start, 
                "end": e.end, 
                "confidence": e.confidence
            } for e in entities
        ]
    })

@app.route("/api/redact", methods=["POST"])
def redact():
    data = request.json
    if not data or "text" not in data:
        return jsonify({"error": "text field is required"}), 400
        
    session_id = data.get("session_id")
    redacted_text, entities, sid = engine.process_redact(data["text"], session_id)
    
    return jsonify({
        "redacted_text": redacted_text,
        "session_id": sid,
        "entities": [
            {
                "id": f"entity-{i}",
                "type": e.type, 
                "originalValue": e.value, 
                "startIndex": e.start, 
                "endIndex": e.end, 
                "confidence": e.confidence * 100 if e.confidence <= 1 else e.confidence,
                "placeholder": e.placeholder,
                "enabled": True
            } for i, e in enumerate(entities)
        ]
    })

@app.route("/api/restore", methods=["POST"])
def restore():
    data = request.json
    if not data or "text" not in data or "session_id" not in data:
        return jsonify({"error": "text and session_id fields are required"}), 400
        
    restored_text = engine.process_restore(data["text"], data["session_id"])
    return jsonify({"restored_text": restored_text})

import os
from flask import send_file
import tempfile
import sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'packages'))
from core.documents.router import DocumentRouter

@app.route("/api/document/redact", methods=["POST"])
def document_redact():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
        
    try:
        # Save uploaded file to temp dir
        temp_dir = tempfile.mkdtemp()
        original_path = os.path.join(temp_dir, file.filename)
        file.save(original_path)
        
        handler = DocumentRouter.get_handler(original_path)
        
        # Extract text
        extracted_text = handler.extract_text(original_path)
        
        session_id = request.form.get("session_id")
        
        # Run engine
        redacted_text, entities, session_id = engine.process_redact(extracted_text, session_id)
        mapping = engine.store.get_mapping(session_id)
        
        # Rebuild and clean
        safe_path = handler.rebuild(original_path, mapping, entities)
        handler.clean_metadata(safe_path)
        
        # Send safe file back
        return send_file(safe_path, as_attachment=True, download_name=f"safe_{file.filename}")
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
