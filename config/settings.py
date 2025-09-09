from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    GROQ_API_KEY: str
    TAVILY_API_KEY: str
    app_name: str = "Perplexity MVP"
    debug: bool = False

    class Config:
        env_file = ".env"

settings = Settings()