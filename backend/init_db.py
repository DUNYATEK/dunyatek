from app import app
from extensions import db
# Import models so SQLAlchemy sees them
from api.models import User, Loom, Palette, Color, Design, PatternVersion, ExportJob

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        print("Database tables created.")
