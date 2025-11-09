from datetime import datetime
from extensions import db

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=True, default='user')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class AppSetting(db.Model):
    __tablename__ = "app_settings"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(120), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=True)

class PromptTemplate(db.Model):
    __tablename__ = "prompt_templates"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    prompt = db.Column(db.Text, nullable=False)
    negative = db.Column(db.Text, nullable=True)
    width = db.Column(db.Integer, nullable=True)
    height = db.Column(db.Integer, nullable=True)
    steps = db.Column(db.Integer, nullable=True)
    cfg = db.Column(db.Float, nullable=True)
    sampler = db.Column(db.String(80), nullable=True)
    tags = db.Column(db.String(200), nullable=True)  # comma-separated
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<User {self.email}>"

class Loom(db.Model):
    __tablename__ = "looms"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    epi = db.Column(db.Integer, nullable=False)
    ppi = db.Column(db.Integer, nullable=False)
    width_cm = db.Column(db.Float, nullable=True)
    height_cm = db.Column(db.Float, nullable=True)
    report_w = db.Column(db.Integer, nullable=True)
    report_h = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    designs = db.relationship("Design", backref="loom", lazy=True)

class Palette(db.Model):
    __tablename__ = "palettes"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    max_colors = db.Column(db.Integer, nullable=False, default=256)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    colors = db.relationship("Color", backref="palette", lazy=True, cascade="all, delete-orphan")
    designs = db.relationship("Design", backref="palette", lazy=True)

class Color(db.Model):
    __tablename__ = "colors"

    id = db.Column(db.Integer, primary_key=True)
    palette_id = db.Column(db.Integer, db.ForeignKey("palettes.id"), nullable=False)
    r = db.Column(db.Integer, nullable=False)
    g = db.Column(db.Integer, nullable=False)
    b = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(50), nullable=True)
    yarn_code = db.Column(db.String(80), nullable=True)
    yarn_name = db.Column(db.String(120), nullable=True)

class Design(db.Model):
    __tablename__ = "designs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    original_image = db.Column(db.String(255), nullable=True)
    loom_id = db.Column(db.Integer, db.ForeignKey("looms.id"), nullable=True)
    palette_id = db.Column(db.Integer, db.ForeignKey("palettes.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patterns = db.relationship("PatternVersion", backref="design", lazy=True)

class PatternVersion(db.Model):
    __tablename__ = "pattern_versions"

    id = db.Column(db.Integer, primary_key=True)
    design_id = db.Column(db.Integer, db.ForeignKey("designs.id"), nullable=False)
    params = db.Column(db.Text, nullable=True)
    preview_path = db.Column(db.String(255), nullable=True)
    matrix_path = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    exports = db.relationship("ExportJob", backref="pattern_version", lazy=True)

class ExportJob(db.Model):
    __tablename__ = "export_jobs"

    id = db.Column(db.Integer, primary_key=True)
    pattern_version_id = db.Column(db.Integer, db.ForeignKey("pattern_versions.id"), nullable=False)
    format = db.Column(db.String(20), nullable=False)
    file_path = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
