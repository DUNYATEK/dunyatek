import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    FLASK_ENV = os.getenv("FLASK_ENV", "production")
    SECRET_KEY = os.getenv("SECRET_KEY", "defaultsecret")
    SQLALCHEMY_DATABASE_URI = os.getenv(
    "DATABASE_URL",
    r"sqlite:///C:/dunyatek/dunyatek/backend/dunyatek.db"  # tam yol
)
    SQLALCHEMY_TRACK_MODIFICATIONS = False

settings = Settings()
