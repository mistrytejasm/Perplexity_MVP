import os
import sys
import uvicorn
from pathlib import Path

# Add Backend to Python path
backend_path = Path(__file__).parent / "Backend"
sys.path.insert(0, str(backend_path))

# Import your FastAPI app
from main import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
