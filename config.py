import os
from dotenv import load_dotenv

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "Home Security System")
API_KEY = os.getenv("API_KEY", "your_api_key_here")
DATABASE_URL = os.getenv("DATABASE_URL", "your_database_url_here")
SAFETY_MODEL_PATH = os.getenv("SAFETY_MODEL_PATH", "safety_model.pt")