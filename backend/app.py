from flask import Flask
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from config.settings import settings  # settings.py config klasöründe
from extensions import db
from api.routes import api_bp

app = Flask(__name__)

# Config yükleme
app.config['SECRET_KEY'] = settings.SECRET_KEY
app.config['SQLALCHEMY_DATABASE_URI'] = settings.SQLALCHEMY_DATABASE_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = settings.SQLALCHEMY_TRACK_MODIFICATIONS
app.config['JWT_SECRET_KEY'] = settings.SECRET_KEY  # JWT için gizli anahtar

# Eklentiler
db.init_app(app)
jwt = JWTManager(app)
CORS(app)

# Blueprint
app.register_blueprint(api_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(debug=True)
