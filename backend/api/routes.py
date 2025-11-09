def _project_root():
    try:
        return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    except Exception:
        return os.getcwd()

def _read_api_key():
    # Read OpenAI API key with priority: DB setting > ENV > secrets file JSON api_key > raw
    # DB (AppSetting) takes precedence so admin can manage from Settings UI
    try:
        db_key = _get_setting('OPENAI_API_KEY')
        if db_key and isinstance(db_key, str) and db_key.strip():
            return db_key.strip().strip('\ufeff')
    except Exception:
        pass
    # Env fallback
    key = os.environ.get('OPENAI_API_KEY')
    if key:
        key = key.strip().strip('\ufeff')
        if key:
            return key
    # Try secrets files at project root
    root = _project_root()
    for name in ('secrets', 'secrets.json'):
        try:
            p = os.path.join(root, name)
            if os.path.exists(p):
                with open(p, 'r', encoding='utf-8') as f:
                    raw = f.read()
                # Remove BOM and surrounding whitespace
                txt = (raw or '').lstrip('\ufeff').strip()
                if not txt:
                    continue
                # Try strict JSON first (even if not starting with '{' due to BOM/WS)
                try:
                    js = json.loads(txt)
                    if isinstance(js, dict):
                        k2 = js.get('api_key') or js.get('OPENAI_API_KEY')
                        if k2:
                            return str(k2).strip()
                except Exception:
                    pass
                # Try regex extraction for api_key: <value>
                m = re.search(r"api_key\s*[:=]\s*['\"]?([^\s,'\"]+)", txt, re.IGNORECASE)
                if m:
                    return m.group(1).strip()
                # Fallback: assume first non-empty line is the key
                raw = raw.strip().strip('\ufeff')
                # extract the first sk- or sk-proj- like token if present
                m = re.search(r"(sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9-]{20,})", raw)
                if m:
                    return m.group(1)
                if raw:
                    return raw
        except Exception:
            continue
    return None

def _read_openai_meta():
    """Read optional metadata like project or organization from secrets/secrets.json.
    Returns dict: { 'project': str|None, 'organization': str|None, 'base_url': str|None }
    """
    meta = { 'project': None, 'organization': None, 'base_url': None }
    root = _project_root()
    for name in ('secrets', 'secrets.json'):
        try:
            p = os.path.join(root, name)
            if os.path.exists(p):
                with open(p, 'r', encoding='utf-8') as f:
                    raw = f.read()
                txt = (raw or '').lstrip('\ufeff').strip()
                try:
                    js = json.loads(txt)
                    if isinstance(js, dict):
                        if js.get('project'): meta['project'] = str(js.get('project')).strip()
                        if js.get('organization'): meta['organization'] = str(js.get('organization')).strip()
                        if js.get('base_url'): meta['base_url'] = str(js.get('base_url')).strip()
                        break
                except Exception:
                    # not json; ignore
                    pass
        except Exception:
            continue
    return meta
def ensure_user_role_column():
    try:
        engine = db.get_engine()
        if engine.url.get_backend_name() == 'sqlite':
            with engine.connect() as conn:
                cols = [r[1] for r in conn.exec_driver_sql('PRAGMA table_info(users)').fetchall()]
                if 'role' not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN role VARCHAR(20) NULL")
    except Exception:
        pass

def current_user_obj():
    try:
        uid = get_jwt_identity()
        return User.query.get(int(uid)) if uid else None
    except Exception:
        return None

def admin_required():
    u = current_user_obj()
    if not u or (getattr(u, 'role', 'user') != 'admin'):
        return False
    return True

def ensure_admin_seed():
    try:
        ensure_user_role_column()
        # if there is no admin at all, promote the oldest user as admin
        any_admin = User.query.filter_by(role='admin').first()
        if not any_admin:
            first_user = User.query.order_by(User.id.asc()).first()
            if first_user and not getattr(first_user, 'role', None):
                first_user.role = 'admin'
                db.session.commit()
    except Exception:
        pass
def ensure_color_yarn_columns():
    try:
        engine = db.get_engine()
        if engine.url.get_backend_name() == 'sqlite':
            with engine.connect() as conn:
                cols = [r[1] for r in conn.exec_driver_sql('PRAGMA table_info(colors)').fetchall()]
                to_add = []
                if 'yarn_code' not in cols:
                    to_add.append("ALTER TABLE colors ADD COLUMN yarn_code VARCHAR(80) NULL")
                if 'yarn_name' not in cols:
                    to_add.append("ALTER TABLE colors ADD COLUMN yarn_name VARCHAR(120) NULL")
                for sql in to_add:
                    conn.exec_driver_sql(sql)
    except Exception:
        # Best-effort; if migration fails we'll rely on existing schema
        pass
from flask import Blueprint, jsonify, request, send_file
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from extensions import db
from .models import User, Loom, Palette, Color, Design, PatternVersion, ExportJob, PromptTemplate, AppSetting
from services.image_processing import quantize_to_palette
from services.pattern_ops import make_repeat
from services.exporters.bmp import save_bmp8
from PIL import Image, ImageOps
import os
import base64
import requests
import uuid
import sqlite3
import json
import string
import platform
import math
import re

api_bp = Blueprint('api', __name__)
ALLOWED_COLORS = {8, 12, 16}
SD_URL = os.environ.get('SD_URL', 'http://127.0.0.1:7860')
SD_TIMEOUT_SEC = int(os.environ.get('SD_TIMEOUT_SEC', '300'))

# Storage helpers
def _get_setting(key: str):
    try:
        s = AppSetting.query.filter_by(key=key).first()
        return s.value if s else None
    except Exception:
        return None

def _set_setting(key: str, value: str):
    try:
        s = AppSetting.query.filter_by(key=key).first()
        if s:
            s.value = value
        else:
            s = AppSetting(key=key, value=value)
            db.session.add(s)
        db.session.commit()
        return True, None
    except Exception as e:
        # Try to create tables (for first-run where AppSetting may not exist)
        try:
            db.create_all()
            s = AppSetting.query.filter_by(key=key).first()
            if s:
                s.value = value
            else:
                s = AppSetting(key=key, value=value)
                db.session.add(s)
            db.session.commit()
            return True, None
        except Exception as e2:
            return False, str(e2)

def get_output_root():
    # Prefer DB setting; fall back to environment, then default
    root = _get_setting('output_root') or os.environ.get('OUTPUT_ROOT') or os.path.join('backend','output')
    try:
        os.makedirs(root, exist_ok=True)
    except Exception:
        pass
    return root

def storage_path(*parts):
    return os.path.join(get_output_root(), *parts)

def get_sd_url():
    return os.environ.get('SD_URL') or _get_setting('sd_url') or SD_URL

def get_generation_settings():
    def _int(name, default=None):
        v = _get_setting(name)
        try:
            return int(v) if v is not None else default
        except Exception:
            return default
    def _float(name, default=None):
        v = _get_setting(name)
        try:
            return float(v) if v is not None else default
        except Exception:
            return default
    def _str(name, default=None):
        v = _get_setting(name)
        return v if v is not None else default
    def _bool(name, default=None):
        v = _get_setting(name)
        if v is None: return default
        return str(v).lower() in ('1','true','yes','on')
    return {
        "gen_steps": _int('gen_steps', 30),
        "gen_cfg": _float('gen_cfg', 6.0),
        "gen_sampler": _str('gen_sampler', 'DPM++ 2M Karras'),
        "gen_width": _int('gen_width', 1024),
        "gen_height": _int('gen_height', 1536),
        "preview_target": _int('preview_target', 1600),
        "pattern_default_dither": _bool('pattern_default_dither', False),
        "pattern_default_max_colors": _int('pattern_default_max_colors', 16),
    }

# Settings: featured (pinned) prompt IDs
@api_bp.route('/settings/presets', methods=['GET'])
@jwt_required()
def get_preset_settings():
    try:
        raw = _get_setting('featured_prompt_ids')
        ids = json.loads(raw) if raw else []
        if not isinstance(ids, list):
            ids = []
        return jsonify({"featured_prompt_ids": ids}), 200
    except Exception:
        return jsonify({"featured_prompt_ids": []}), 200

@api_bp.route('/settings/presets', methods=['PUT'])
@jwt_required()
def set_preset_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    data = request.get_json() or {}
    ids = data.get('featured_prompt_ids')
    if ids is None or not isinstance(ids, list):
        return jsonify({"error":"featured_prompt_ids list olmalı"}), 400
    try:
        # ensure all are ints
        ids = [int(x) for x in ids]
    except Exception:
        return jsonify({"error":"ID listesi sayısal olmalı"}), 400
    ok, err = _set_setting('featured_prompt_ids', json.dumps(ids))
    if not ok:
        return jsonify({"error": f"Ayar kaydedilemedi (DB): {err}"}), 500
    return jsonify({"featured_prompt_ids": ids}), 200

# Basit ping testi
@api_bp.route('/ping', methods=['GET'])
def ping():
    return jsonify({"message": "pong"}), 200

# Settings: storage output root
@api_bp.route('/settings/storage', methods=['GET'])
@jwt_required()
def get_storage_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    return jsonify({"output_root": get_output_root()}), 200

@api_bp.route('/settings/storage', methods=['PUT'])
@jwt_required()
def set_storage_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    data = request.get_json() or {}
    root = data.get('output_root')
    if not root or not isinstance(root, str):
        return jsonify({"error":"output_root gerekli"}), 400
    try:
        os.makedirs(root, exist_ok=True)
    except Exception as e:
        return jsonify({"error": f"Klasör oluşturulamadı: {e}"}), 400
    # Write test to validate permissions
    try:
        test_path = os.path.join(root, '_write_test.tmp')
        with open(test_path, 'w', encoding='utf-8') as f:
            f.write('ok')
        os.remove(test_path)
    except Exception as e:
        return jsonify({"error": f"Klasöre yazılamıyor: {e}"}), 400
    ok, err = _set_setting('output_root', root)
    if not ok:
        return jsonify({"error": f"Ayar kaydedilemedi (DB): {err}"}), 500
    return jsonify({"message":"Kaydedildi", "output_root": root}), 200

# Model settings (SD URL)
@api_bp.route('/settings/model', methods=['GET'])
@jwt_required()
def get_model_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    return jsonify({"sd_url": get_sd_url()}), 200

@api_bp.route('/settings/model', methods=['PUT'])
@jwt_required()
def set_model_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    data = request.get_json() or {}
    sd_url = data.get('sd_url')
    if not sd_url or not isinstance(sd_url, str):
        return jsonify({"error":"sd_url gerekli"}), 400
    _set_setting('sd_url', sd_url)
    return jsonify({"message":"Kaydedildi", "sd_url": sd_url}), 200

# OpenAI settings (admin-only)
@api_bp.route('/settings/openai', methods=['GET'])
@jwt_required()
def get_openai_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    try:
        # Prefer DB value for preview
        def _mask(k: str):
            try:
                k = (k or '').strip()
                if len(k) <= 10:
                    return '***'
                return f"{k[:6]}...{k[-4:]}"
            except Exception:
                return '***'
        db_val = _get_setting('OPENAI_API_KEY')
        if db_val and isinstance(db_val, str) and db_val.strip():
            return jsonify({"has_key": True, "key_preview": _mask(db_val)}), 200
        # Fallback: env or secrets only reveal status, not preview
        has_key = bool(os.environ.get('OPENAI_API_KEY') or _read_api_key())
        return jsonify({"has_key": bool(has_key)}), 200
    except Exception:
        return jsonify({"has_key": False}), 200

@api_bp.route('/settings/openai', methods=['PUT'])
@jwt_required()
def set_openai_settings():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    data = request.get_json() or {}
    key = (data.get('key') or '').strip()
    if not key:
        return jsonify({"error":"key gerekli"}), 400
    ok, err = _set_setting('OPENAI_API_KEY', key)
    if not ok:
        return jsonify({"error": f"Ayar kaydedilemedi (DB): {err}"}), 500
    # Return masked preview back
    try:
        preview = f"{key[:6]}...{key[-4:]}" if len(key) > 10 else '***'
    except Exception:
        preview = '***'
    return jsonify({"message":"Kaydedildi", "has_key": True, "key_preview": preview}), 200

# Generation defaults
@api_bp.route('/settings/generation', methods=['GET'])
@jwt_required()
def get_generation_settings_api():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    return jsonify(get_generation_settings()), 200

@api_bp.route('/settings/generation', methods=['PUT'])
@jwt_required()
def set_generation_settings_api():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    data = request.get_json() or {}
    # Validate and set when present
    if 'gen_steps' in data:
        try:
            v = int(data['gen_steps']); v = max(1, min(100, v)); _set_setting('gen_steps', str(v))
        except Exception: return jsonify({"error":"gen_steps geçersiz"}), 400
    if 'gen_cfg' in data:
        try:
            v = float(data['gen_cfg']); v = max(1.0, min(15.0, v)); _set_setting('gen_cfg', str(v))
        except Exception: return jsonify({"error":"gen_cfg geçersiz"}), 400
    if 'gen_sampler' in data:
        _set_setting('gen_sampler', str(data['gen_sampler']))
    if 'gen_width' in data:
        try:
            v = int(data['gen_width']); v = max(64, min(2048, v)); _set_setting('gen_width', str(v))
        except Exception: return jsonify({"error":"gen_width geçersiz"}), 400
    if 'gen_height' in data:
        try:
            v = int(data['gen_height']); v = max(64, min(2048, v)); _set_setting('gen_height', str(v))
        except Exception: return jsonify({"error":"gen_height geçersiz"}), 400
    if 'preview_target' in data:
        try:
            v = int(data['preview_target']); v = max(400, min(4000, v)); _set_setting('preview_target', str(v))
        except Exception: return jsonify({"error":"preview_target geçersiz"}), 400
    if 'pattern_default_dither' in data:
        v = data['pattern_default_dither']
        _set_setting('pattern_default_dither', '1' if (str(v).lower() in ('1','true','yes','on')) else '0')
    if 'pattern_default_max_colors' in data:
        try:
            v = int(data['pattern_default_max_colors']);
            if v not in (8,12,16,32,64,128,256):
                return jsonify({"error":"pattern_default_max_colors geçersiz"}), 400
            _set_setting('pattern_default_max_colors', str(v))
        except Exception:
            return jsonify({"error":"pattern_default_max_colors geçersiz"}), 400
    return jsonify(get_generation_settings()), 200

# Simple server-side directory browser (admin-only)
@api_bp.route('/fs/drives', methods=['GET'])
@jwt_required()
def list_drives():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    drives = []
    try:
        if platform.system().lower().startswith('win'):
            for d in string.ascii_uppercase:
                p = f"{d}:\\"
                if os.path.exists(p):
                    drives.append(p)
        else:
            drives = ['/']
    except Exception:
        pass
    return jsonify({"drives": drives}), 200

@api_bp.route('/fs/list', methods=['GET'])
@jwt_required()
def list_dir_api():
    if not admin_required():
        return jsonify({"error":"Yetki yok"}), 403
    path = request.args.get('path') or ''
    try:
        if path == '':
            return list_drives()
        if not os.path.exists(path):
            return jsonify({"error":"Path yok"}), 400
        items = []
        for name in os.listdir(path):
            full = os.path.join(path, name)
            try:
                if os.path.isdir(full):
                    items.append({"name": name, "path": full, "type": "dir"})
            except Exception:
                continue
        items.sort(key=lambda x: x['name'].lower())
        return jsonify({"path": path, "items": items}), 200
    except Exception as e:
        return jsonify({"error": f"Listeleme hatası: {e}"}), 500

# Kullanıcı Kaydı (Signup)
@api_bp.route('/signup', methods=['POST'])
def signup():
    ensure_user_role_column()
    data = request.get_json()

    if not data or not data.get('name') or not data.get('email') or not data.get('password'):
        return jsonify({"error": "name, email ve password gerekli"}), 400

    # email zaten var mı
    if User.query.filter_by(email=data['email']).first():
        return jsonify({"error": "Bu email zaten kayıtlı"}), 400

    hashed_password = generate_password_hash(data['password'])
    # first user becomes admin
    first = User.query.count() == 0
    new_user = User(
        name=data['name'],
        email=data['email'],
        password_hash=hashed_password,
        role='admin' if first else 'user'
    )
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "Kullanıcı kaydedildi"}), 201

# Kullanıcı Giriş (Login)
@api_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "email ve password gerekli"}), 400

    user = User.query.filter_by(email=data['email']).first()

    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({"error": "Email veya şifre hatalı"}), 401

    access_token = create_access_token(identity=str(user.id))  # <— str yaptık
    return jsonify({"access_token": access_token}), 200

# Korunan endpoint örneği
@api_bp.route('/protected', methods=['GET'])
@jwt_required()
def protected():
    current_user_id = get_jwt_identity()
    user = User.query.get(int(current_user_id))
    return jsonify({
        "message": "Bu korumalı bir endpointtir",
        "current_user": user.email if user else None,
        "role": getattr(user, 'role', None) if user else None
    }), 200

# Kullanıcıları listeleme
@api_bp.route('/users', methods=['GET'])
@jwt_required()
def list_users():
    ensure_user_role_column()
    users = User.query.all()
    return jsonify([{
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": getattr(u, 'role', None),
        "created_at": u.created_at.strftime('%Y-%m-%d %H:%M:%S') if u.created_at else None
    } for u in users]), 200

# Kullanıcı oluşturma (Yeni)
@api_bp.route('/users', methods=['POST'])
@jwt_required()
def create_user():
    ensure_user_role_column(); ensure_admin_seed()
    if not admin_required():
        return jsonify({"error": "Yetki yok"}), 403
    data = request.get_json()
    if not data or not data.get('name') or not data.get('email') or not data.get('password'):
        return jsonify({"error": "name, email ve password gerekli"}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({"error": "Bu email zaten kayıtlı"}), 400

    hashed_password = generate_password_hash(data['password'])
    role = data.get('role') or 'user'
    if role not in ('user','admin'):
        role = 'user'
    new_user = User(
        name=data['name'],
        email=data['email'],
        password_hash=hashed_password,
        role=role
    )
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "Yeni kullanıcı oluşturuldu"}), 201

# Kullanıcı silme
@api_bp.route('/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    ensure_user_role_column(); ensure_admin_seed()
    if not admin_required():
        return jsonify({"error": "Yetki yok"}), 403
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Kullanıcı bulunamadı"}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "Kullanıcı silindi"}), 200

# Update user (name/email/role)
@api_bp.route('/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id: int):
    ensure_user_role_column(); ensure_admin_seed()
    if not admin_required():
        return jsonify({"error": "Yetki yok"}), 403
    u = User.query.get(user_id)
    if not u:
        return jsonify({"error": "Kullanıcı bulunamadı"}), 404
    data = request.get_json() or {}
    if 'name' in data: u.name = data['name']
    if 'email' in data: u.email = data['email']
    if 'role' in data: u.role = data['role']
    db.session.commit()
    return jsonify({"message": "Güncellendi"}), 200

@api_bp.route('/looms', methods=['GET'])
@jwt_required()
def list_looms():
    looms = Loom.query.all()
    return jsonify([{ "id": l.id, "name": l.name, "epi": l.epi, "ppi": l.ppi, "width_cm": l.width_cm, "height_cm": l.height_cm, "report_w": l.report_w, "report_h": l.report_h } for l in looms]), 200

@api_bp.route('/looms', methods=['POST'])
@jwt_required()
def create_loom():
    data = request.get_json()
    if not data or not data.get('name') or data.get('epi') is None or data.get('ppi') is None:
        return jsonify({"error": "name, epi, ppi gerekli"}), 400
    loom = Loom(name=data['name'], epi=int(data['epi']), ppi=int(data['ppi']), width_cm=data.get('width_cm'), height_cm=data.get('height_cm'), report_w=data.get('report_w'), report_h=data.get('report_h'))
    db.session.add(loom)
    db.session.commit()
    return jsonify({"id": loom.id}), 201

@api_bp.route('/looms/<int:loom_id>', methods=['PUT'])
@jwt_required()
def update_loom(loom_id):
    loom = Loom.query.get(loom_id)
    if not loom:
        return jsonify({"error": "Loom bulunamadı"}), 404
    data = request.get_json()
    if 'name' in data: loom.name = data['name']
    if 'epi' in data: loom.epi = int(data['epi'])
    if 'ppi' in data: loom.ppi = int(data['ppi'])
    if 'width_cm' in data: loom.width_cm = data['width_cm']
    if 'height_cm' in data: loom.height_cm = data['height_cm']
    if 'report_w' in data: loom.report_w = data['report_w']
    if 'report_h' in data: loom.report_h = data['report_h']
    db.session.commit()
    return jsonify({"message": "Güncellendi"}), 200

@api_bp.route('/looms/<int:loom_id>', methods=['DELETE'])
@jwt_required()
def delete_loom(loom_id):
    loom = Loom.query.get(loom_id)
    if not loom:
        return jsonify({"error": "Loom bulunamadı"}), 404
    db.session.delete(loom)
    db.session.commit()
    return jsonify({"message": "Silindi"}), 200

# Serve original generated image for archive item (by pv_id)
@api_bp.route('/archive/original/<int:pv_id>', methods=['GET'])
def get_original_for_pv(pv_id: int):
    pv = PatternVersion.query.get(pv_id)
    if not pv or not pv.design_id:
        return jsonify({"error": "Kayıt yok"}), 404
    d = Design.query.get(pv.design_id)
    if not d or not d.original_image or not os.path.exists(d.original_image):
        return jsonify({"error": "Orijinal görsel yok"}), 404
    # Serve the file directly
    mime = 'image/png'
    try:
        ext = os.path.splitext(d.original_image)[1].lower()
        if ext in ('.jpg', '.jpeg'): mime = 'image/jpeg'
        elif ext == '.webp': mime = 'image/webp'
        elif ext == '.bmp': mime = 'image/bmp'
    except Exception:
        pass
    return send_file(d.original_image, mimetype=mime)

@api_bp.route('/prompts/import-old', methods=['POST'])
@jwt_required()
def import_old_prompts():
    return jsonify({"error": "Bu uç devre dışı bırakıldı"}), 410

@api_bp.route('/prompts/bulk', methods=['POST'])
@jwt_required()
def import_prompts_bulk():
    return jsonify({"error": "Bu uç devre dışı bırakıldı"}), 410

@api_bp.route('/palettes', methods=['GET'])
@jwt_required()
def list_palettes():
    ensure_color_yarn_columns()
    palettes = Palette.query.all()
    resp = []
    for p in palettes:
        resp.append({
            "id": p.id,
            "name": p.name,
            "max_colors": p.max_colors,
            "colors": [{"id": c.id, "r": c.r, "g": c.g, "b": c.b, "label": c.label, "yarn_code": getattr(c, 'yarn_code', None), "yarn_name": getattr(c, 'yarn_name', None)} for c in p.colors]
        })
    return jsonify(resp), 200

@api_bp.route('/palettes', methods=['POST'])
@jwt_required()
def create_palette():
    ensure_color_yarn_columns()
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "name gerekli"}), 400
    # enforce 8/12/16
    req_mc = int(data.get('max_colors', 16))
    if req_mc not in ALLOWED_COLORS:
        return jsonify({"error": "max_colors 8/12/16 olmalı"}), 400
    palette = Palette(name=data['name'], max_colors=req_mc)
    db.session.add(palette)
    db.session.flush()
    for col in data.get('colors', []):
        color = Color(
            palette_id=palette.id,
            r=int(col['r']), g=int(col['g']), b=int(col['b']),
            label=col.get('label'),
            yarn_code=col.get('yarn_code'),
            yarn_name=col.get('yarn_name')
        )
        db.session.add(color)
    db.session.commit()
    return jsonify({"id": palette.id}), 201

@api_bp.route('/palettes/<int:palette_id>', methods=['PUT'])
@jwt_required()
def update_palette(palette_id):
    ensure_color_yarn_columns()
    palette = Palette.query.get(palette_id)
    if not palette:
        return jsonify({"error": "Palette bulunamadı"}), 404
    data = request.get_json()
    if 'name' in data: palette.name = data['name']
    if 'max_colors' in data:
        req_mc = int(data['max_colors'])
        if req_mc not in ALLOWED_COLORS:
            return jsonify({"error": "max_colors 8/12/16 olmalı"}), 400
        palette.max_colors = req_mc
    if 'colors' in data:
        Color.query.filter_by(palette_id=palette.id).delete()
        for col in data['colors']:
            db.session.add(Color(
                palette_id=palette.id,
                r=int(col['r']), g=int(col['g']), b=int(col['b']),
                label=col.get('label'),
                yarn_code=col.get('yarn_code'),
                yarn_name=col.get('yarn_name')
            ))
    db.session.commit()
    return jsonify({"message": "Güncellendi"}), 200

@api_bp.route('/palettes/<int:palette_id>', methods=['DELETE'])
@jwt_required()
def delete_palette(palette_id):
    palette = Palette.query.get(palette_id)
    if not palette:
        return jsonify({"error": "Palette bulunamadı"}), 404
    db.session.delete(palette)
    db.session.commit()
    return jsonify({"message": "Silindi"}), 200

@api_bp.route('/designs', methods=['GET'])
@jwt_required()
def list_designs():
    designs = Design.query.all()
    return jsonify([{ "id": d.id, "name": d.name, "original_image": d.original_image, "loom_id": d.loom_id, "palette_id": d.palette_id } for d in designs]), 200

@api_bp.route('/designs', methods=['POST'])
@jwt_required()
def create_design():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "name gerekli"}), 400
    d = Design(name=data['name'], original_image=data.get('original_image'), loom_id=data.get('loom_id'), palette_id=data.get('palette_id'))
    db.session.add(d)
    db.session.commit()
    return jsonify({"id": d.id}), 201

@api_bp.route('/designs/<int:design_id>', methods=['PUT'])
@jwt_required()
def update_design(design_id):
    d = Design.query.get(design_id)
    if not d:
        return jsonify({"error": "Design bulunamadı"}), 404
    data = request.get_json()
    if 'name' in data: d.name = data['name']
    if 'original_image' in data: d.original_image = data['original_image']
    if 'loom_id' in data: d.loom_id = data['loom_id']
    if 'palette_id' in data: d.palette_id = data['palette_id']
    db.session.commit()
    return jsonify({"message": "Güncellendi"}), 200

@api_bp.route('/designs/<int:design_id>', methods=['DELETE'])
@jwt_required()
def delete_design(design_id):
    d = Design.query.get(design_id)
    if not d:
        return jsonify({"error": "Design bulunamadı"}), 404
    # Delete dependent PatternVersions and their ExportJobs first to avoid FK errors
    try:
        for pv in list(d.patterns or []):
            try:
                for ex in list(getattr(pv, 'exports', []) or []):
                    db.session.delete(ex)
            except Exception:
                pass
            db.session.delete(pv)
        db.session.delete(d)
        db.session.commit()
        return jsonify({"message": "Silindi"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Silme hatası: {e}"}), 500

@api_bp.route('/generate-pattern', methods=['POST'])
@jwt_required()
def generate_pattern():
    data = request.get_json()
    design_id = data.get('design_id')
    d = Design.query.get(design_id)
    if not d:
        return jsonify({"error": "Design bulunamadı"}), 404
    # Load palette (optional)
    palette = None
    if d.palette_id:
        pal = Palette.query.get(d.palette_id)
        if pal:
            cols = Color.query.filter_by(palette_id=pal.id).all()
            palette = [(c.r, c.g, c.b) for c in cols]
            if len(palette) < 2:
                palette = None
    # Quantize
    if not d.original_image:
        return jsonify({"error": "Design'da original_image yok"}), 400
    # default dither from settings if not provided
    defaults = get_generation_settings()
    dither = data.get('dither')
    if dither is None:
        dither = bool(defaults.get('pattern_default_dither', False))
    else:
        dither = bool(dither)
    delta_e = data.get('delta_e', None)
    try:
        delta_e_val = float(delta_e) if (delta_e is not None and str(delta_e).strip() != '') else None
    except Exception:
        delta_e_val = None
    # enforce max_colors if provided
    req_max = data.get('max_colors', None)
    try:
        if req_max is not None:
            req_max = int(req_max)
            if req_max not in ALLOWED_COLORS:
                return jsonify({"error": "max_colors 8/12/16 olmalı"}), 400
    except Exception:
        req_max = None
    if req_max is None:
        try:
            req_max = int(defaults.get('pattern_default_max_colors') or 16)
        except Exception:
            req_max = 16

    qimg = quantize_to_palette(
        d.original_image,
        palette=palette,
        max_colors=(req_max or 16),
        dither=dither,
        delta_e_tolerance=delta_e_val,
    )
    # Repeat to report if provided
    repeat_w = data.get('report_w')
    repeat_h = data.get('report_h')
    if not repeat_w or not repeat_h:
        # fallback to loom's report
        if d.loom_id:
            l = Loom.query.get(d.loom_id)
            if l and l.report_w and l.report_h:
                repeat_w, repeat_h = l.report_w, l.report_h
    if repeat_w and repeat_h:
        qimg = make_repeat(qimg, (int(repeat_w), int(repeat_h)))
    # Save matrix (true-size) and a larger preview for UI
    os.makedirs(storage_path('matrices'), exist_ok=True)
    os.makedirs(storage_path('previews'), exist_ok=True)
    pv = PatternVersion(design_id=design_id, params=str(data.get('params') or {}), preview_path=None, matrix_path=None)
    db.session.add(pv)
    db.session.flush()
    matrix_path = storage_path('matrices', f'pv_{pv.id}.png')
    qimg.save(matrix_path)
    pv.matrix_path = matrix_path
    # Build preview (nearest-neighbor upscale for readability)
    try:
        w, h = qimg.width, qimg.height
        target_max = int(defaults.get('preview_target') or 1600)
        scale = 1
        if max(w, h) < target_max:
            scale = max(1, int(target_max / max(w, h)))
        prev_img = qimg if scale == 1 else qimg.resize((w*scale, h*scale), Image.NEAREST)
        preview_path = storage_path('previews', f'pv_{pv.id}.png')
        prev_img.convert('P').save(preview_path)
        pv.preview_path = preview_path
    except Exception:
        # Fallback: store original as preview under configured output_root
        fallback_prev = storage_path('previews', f'pv_{pv.id}.png')
        try:
            qimg.convert('P').save(fallback_prev)
            pv.preview_path = fallback_prev
        except Exception:
            pass
    db.session.commit()
    return jsonify({"pattern_version_id": pv.id, "preview_path": preview_path}), 201

@api_bp.route('/export', methods=['POST'])
@jwt_required()
def export_pattern():
    data = request.get_json()
    pv_id = data.get('pattern_version_id')
    fmt = data.get('format', 'bmp8')
    pv = PatternVersion.query.get(pv_id)
    if not pv:
        return jsonify({"error": "PatternVersion bulunamadı"}), 404
    os.makedirs(storage_path('exports'), exist_ok=True)
    job = ExportJob(pattern_version_id=pv.id, format=fmt, file_path=None, status='processing')
    db.session.add(job)
    db.session.flush()
    # Prepare source image: prefer matrix (true-size), fallback to preview
    src_path = pv.matrix_path if pv.matrix_path and os.path.exists(pv.matrix_path) else pv.preview_path
    if not src_path or not os.path.exists(src_path):
        return jsonify({"error": "Kaynak görsel bulunamadı"}), 400
    img = Image.open(src_path)
    out_file = storage_path('exports', f'export_{job.id}.bmp')
    if fmt in ('bmp', 'bmp8'):
        save_bmp8(img, out_file)
    else:
        return jsonify({"error": "Desteklenmeyen format"}), 400
    job.file_path = out_file
    job.status = 'done'
    # Build metadata JSON (best-effort)
    try:
        meta = {
            "pattern_version_id": pv.id,
            "export_job_id": job.id,
            "image": {"width": img.width, "height": img.height, "mode": img.mode},
        }
        # attach design / loom / palette info if present
        if pv.design_id:
            d = Design.query.get(pv.design_id)
            if d:
                meta["design"] = {"id": d.id, "name": d.name}
                if d.loom_id:
                    l = Loom.query.get(d.loom_id)
                    if l:
                        meta["loom"] = {"id": l.id, "name": l.name, "epi": l.epi, "ppi": l.ppi, "report_w": l.report_w, "report_h": l.report_h}
                if d.palette_id:
                    pal = Palette.query.get(d.palette_id)
                    if pal:
                        cols = Color.query.filter_by(palette_id=pal.id).all()
                        meta["palette"] = {
                            "id": pal.id,
                            "name": pal.name,
                            "max_colors": pal.max_colors,
                            "colors": [
                                {"index": i, "r": c.r, "g": c.g, "b": c.b, "yarnCode": getattr(c, 'yarn_code', None), "yarnName": getattr(c, 'yarn_name', None)}
                                for i, c in enumerate(cols)
                            ]
                        }
        meta_path = storage_path('exports', f'export_{job.id}.json')
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    db.session.commit()
    return jsonify({"export_job_id": job.id, "file_path": out_file}), 201

@api_bp.route('/preview/<int:pv_id>', methods=['GET'])
def get_preview(pv_id: int):
    pv = PatternVersion.query.get(pv_id)
    if not pv:
        return jsonify({"error": "Önizleme yok"}), 404
    # If preview missing, try to rebuild from matrix or original
    try:
        if (not pv.preview_path) or (pv.preview_path and not os.path.exists(pv.preview_path)):
            os.makedirs(storage_path('previews'), exist_ok=True)
            src_path = None
            if pv.matrix_path and os.path.exists(pv.matrix_path):
                src_path = pv.matrix_path
            elif pv.design and pv.design.original_image and os.path.exists(pv.design.original_image):
                src_path = pv.design.original_image
            if src_path:
                img = Image.open(src_path)
                w, h = img.width, img.height
                target_max = 1600
                scale = 1
                if max(w, h) < target_max:
                    scale = max(1, int(target_max / max(w, h)))
                prev_img = img if scale == 1 else img.resize((w*scale, h*scale), Image.NEAREST)
                preview_path = storage_path('previews', f'pv_{pv.id}.png')
                prev_img.convert('P').save(preview_path)
                pv.preview_path = preview_path
                db.session.commit()
    except Exception:
        pass
    if not pv.preview_path or not os.path.exists(pv.preview_path):
        return jsonify({"error": "Önizleme yok"}), 404
    return send_file(pv.preview_path, mimetype='image/png')

@api_bp.route('/export-file/<int:job_id>', methods=['GET'])
def get_export_file(job_id: int):
    job = ExportJob.query.get(job_id)
    if not job or not job.file_path or not os.path.exists(job.file_path):
        return jsonify({"error": "Dosya yok"}), 404
    return send_file(job.file_path, mimetype='image/bmp', as_attachment=True, download_name=f'pattern_{job_id}.bmp')

@api_bp.route('/export-meta/<int:job_id>', methods=['GET'])
def get_export_meta(job_id: int):
    meta_path = storage_path('exports', f'export_{job_id}.json')
    if not os.path.exists(meta_path):
        return jsonify({"error": "Meta yok"}), 404
    return send_file(meta_path, mimetype='application/json', as_attachment=True, download_name=f'pattern_{job_id}.json')

# Archive: list previews and exports, and allow deletion
@api_bp.route('/archive/previews', methods=['GET'])
@jwt_required()
def list_previews():
    pvs = PatternVersion.query.order_by(PatternVersion.created_at.desc()).all()
    data = []
    for pv in pvs:
        data.append({
            "id": pv.id,
            "design_id": pv.design_id,
            "design_name": pv.design.name if pv.design else None,
            "preview_path": pv.preview_path,
            "created_at": pv.created_at.isoformat(),
        })
    return jsonify(data), 200

@api_bp.route('/archive/exports', methods=['GET'])
@jwt_required()
def list_exports():
    jobs = ExportJob.query.order_by(ExportJob.created_at.desc()).all()
    data = []
    for j in jobs:
        data.append({
            "id": j.id,
            "pattern_version_id": j.pattern_version_id,
            "file_path": j.file_path,
            "format": j.format,
            "status": j.status,
            "created_at": j.created_at.isoformat(),
            "has_meta": os.path.exists(storage_path('exports', f'export_{j.id}.json')),
        })
    return jsonify(data), 200

@api_bp.route('/archive/preview/<int:pv_id>', methods=['DELETE'])
@jwt_required()
def delete_preview(pv_id: int):
    pv = PatternVersion.query.get(pv_id)
    if not pv:
        return jsonify({"error": "Önizleme bulunamadı"}), 404
    try:
        if pv.preview_path and os.path.exists(pv.preview_path):
            os.remove(pv.preview_path)
    except Exception:
        pass
    # Also delete related export jobs
    for job in pv.exports:
        try:
            if job.file_path and os.path.exists(job.file_path):
                os.remove(job.file_path)
        except Exception:
            pass
        db.session.delete(job)
    db.session.delete(pv)
    db.session.commit()
    return jsonify({"message": "Silindi"}), 200

@api_bp.route('/archive/export/<int:job_id>', methods=['DELETE'])
@jwt_required()
def delete_export(job_id: int):
    job = ExportJob.query.get(job_id)
    if not job:
        return jsonify({"error": "Export bulunamadı"}), 404
    try:
        if job.file_path and os.path.exists(job.file_path):
            os.remove(job.file_path)
    except Exception:
        pass
    db.session.delete(job)
    db.session.commit()
    return jsonify({"message": "Silindi"}), 200

@api_bp.route('/upload-image', methods=['POST'])
@jwt_required()
def upload_image():
    if 'file' not in request.files:
        return jsonify({"error": "Dosya yok"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Dosya adı boş"}), 400
    filename = secure_filename(file.filename)
    os.makedirs(storage_path('images'), exist_ok=True)
    # Avoid overwrite by prefixing with user id and simple counter/time
    uid = get_jwt_identity() or 'anon'
    save_name = f"{uid}_{filename}"
    save_path = storage_path('images', save_name)
    file.save(save_path)
    # Optional: auto create Design if form fields provided
    name = request.form.get('name')
    loom_id = request.form.get('loom_id')
    palette_id = request.form.get('palette_id')
    design_id = None
    if name:
        d = Design(
            name=name,
            original_image=save_path,
            loom_id=int(loom_id) if loom_id and loom_id.isdigit() else None,
            palette_id=int(palette_id) if palette_id and palette_id.isdigit() else None,
        )
        db.session.add(d)
        db.session.commit()
        design_id = d.id
    # Return saved path (and created design if any)
    return jsonify({"path": save_path, "design_id": design_id}), 201

# Serve generated images from backend/data/generated safely
@api_bp.route('/generated/<path:filename>', methods=['GET'])
def get_generated(filename: str):
    root = storage_path('generated')
    full = os.path.normpath(os.path.join(root, filename))
    abs_root = os.path.abspath(root)
    abs_full = os.path.abspath(full)
    if not abs_full.startswith(abs_root):
        return jsonify({"error": "Yetkisiz"}), 403
    if not os.path.exists(abs_full):
        return jsonify({"error": "Dosya yok"}), 404
    return send_file(abs_full)

# Analyze dominant colors of a generated image
@api_bp.route('/generated/<path:filename>/colors', methods=['GET'])
def get_generated_colors(filename: str):
    root = os.path.join('backend', 'data', 'generated')
    full = os.path.normpath(os.path.join(root, filename))
    abs_root = os.path.abspath(root)
    abs_full = os.path.abspath(full)
    if not abs_full.startswith(abs_root):
        return jsonify({"error": "Yetkisiz"}), 403
    if not os.path.exists(abs_full):
        return jsonify({"error": "Dosya yok"}), 404
    try:
        # number of colors to extract
        k = int(request.args.get('k', 12))
        k = max(2, min(32, k))
        img = Image.open(abs_full).convert('RGB')
        # quantize to k colors and get histogram
        q = img.quantize(colors=k, method=Image.MEDIANCUT)
        q = q.convert('RGB')
        counts = q.getcolors(maxcolors=256*256)
        if not counts:
            return jsonify({"colors": []})
        total = sum(c for c, _ in counts)
        # sort by frequency desc
        counts.sort(key=lambda x: x[0], reverse=True)
        result = []
        for c, rgb in counts[:k]:
            r, g, b = rgb
            hexv = f"#{r:02x}{g:02x}{b:02x}"
            pct = round((c / total) * 100, 2)
            result.append({"r": r, "g": g, "b": b, "hex": hexv, "percent": pct})
        return jsonify({"colors": result}), 200
    except Exception as e:
        return jsonify({"error": f"analyze failed: {e}"}), 500

# SD WebUI txt2img proxy
@api_bp.route('/ai/txt2img', methods=['POST'])
@jwt_required()
def ai_txt2img():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "prompt gerekli"}), 400
    negative = data.get('negative', '')
    width = int(data.get('width', 1024))
    height = int(data.get('height', 1536))
    steps = int(data.get('steps', 30))
    cfg = float(data.get('cfg', 6))
    seed = data.get('seed', -1)
    # Backend safeguard: auto-append LoRA tag(s) if configured via env
    # Supports multiple: FORCE_LORA_NAMES="NameA,NameB" and optional FORCE_LORA_STRENGTHS="0.7,0.6"
    try:
        final_prompt = prompt or ''
        names_raw = os.environ.get('FORCE_LORA_NAMES')
        strengths_raw = os.environ.get('FORCE_LORA_STRENGTHS')
        # legacy single-name fallback
        if not names_raw:
            legacy = os.environ.get('FORCE_LORA_NAME')
            if legacy:
                names_raw = legacy
                strengths_raw = os.environ.get('FORCE_LORA_STRENGTH', '0.8')
        if names_raw:
            names = [n.strip() for n in names_raw.split(',') if n.strip()]
            strengths_list = None
            if strengths_raw:
                strengths_list = [s.strip() for s in strengths_raw.split(',')]
            for idx, n in enumerate(names):
                if f"<lora:{n}:" in final_prompt:
                    continue
                strength = '0.8'
                if strengths_list and idx < len(strengths_list):
                    strength = strengths_list[idx] or '0.8'
                final_prompt = f"{final_prompt} <lora:{n}:{strength}>".strip()
    except Exception:
        final_prompt = prompt
    # Support tiling (seamless) generation; default True for pattern design
    try:
        tiling = bool(data.get('tiling', True))
    except Exception:
        tiling = True
    payload = {
        "prompt": final_prompt,
        "negative_prompt": negative,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg_scale": cfg,
        "seed": seed,
        "sampler_name": data.get('sampler_name', 'DPM++ 2M Karras'),
        "n_iter": int(data.get('n_iter', 1)),
        "batch_size": int(data.get('batch_size', 1)),
        "tiling": tiling,
    }
    try:
        resp = requests.post(f"{get_sd_url()}/sdapi/v1/txt2img", json=payload, timeout=SD_TIMEOUT_SEC)
        resp.raise_for_status()
        out = resp.json()
        images_b64 = out.get('images', [])
    except Exception as e:
        return jsonify({"error": f"SD hatası: {e}"}), 502

    os.makedirs(storage_path('generated'), exist_ok=True)
    loom_id = data.get('loom_id')
    epi = data.get('epi')
    ppi = data.get('ppi')
    report_w = data.get('report_w')
    report_h = data.get('report_h')
    sel_palette_id = data.get('palette_id')
    sel_max_colors = int(data.get('max_colors', 0) or 0)
    palette_colors_override = data.get('palette_colors') or None
    palette_colors = None
    if palette_colors_override:
        try:
            palette_colors = [(int(c['r']), int(c['g']), int(c['b'])) for c in palette_colors_override if {'r','g','b'}.issubset(c.keys())]
        except Exception:
            palette_colors = None
    elif sel_palette_id:
        try:
            pal = Palette.query.get(int(sel_palette_id))
            if pal:
                palette_colors = [(c.r, c.g, c.b) for c in pal.colors]
        except Exception:
            palette_colors = None
    frame = data.get('frame') or {}
    frame_w = int(frame.get('width', 0) or 0)
    frame_color = frame.get('color') or None
    saved = []
    for idx, b64img in enumerate(images_b64):
        raw = base64.b64decode(b64img.split(',')[-1])
        fname = f"ai_{uuid.uuid4().hex}_{idx}.png"
        path = storage_path('generated', fname)
        with open(path, 'wb') as f:
            f.write(raw)
        # Do NOT quantize here. Keep full-color result; palette reduction will happen at pattern generation.
        try:
            out_path = path
            if frame_w > 0 and frame_color:
                try:
                    img0 = Image.open(path).convert('RGB')
                    img1 = ImageOps.expand(img0, border=frame_w, fill=frame_color)
                    fname2 = fname.replace('.png', '_fr.png')
                    out_file_path = storage_path('generated', fname2)
                    img1.save(out_file_path, format='PNG')
                    saved.append({"filename": fname2, "path": out_file_path, "url": f"/api/generated/{fname2}"})
                    continue
                except Exception:
                    out_file_path = path
            saved.append({"filename": fname, "path": out_file_path, "url": f"/api/generated/{fname if out_file_path==path else fname.replace('.png','_fr.png') }"})
        except Exception:
            saved.append({"filename": fname, "path": path, "url": f"/api/generated/{fname}"})
    meta = {
        "loom_id": loom_id,
        "epi": epi,
        "ppi": ppi,
        "report_w": report_w,
        "report_h": report_h,
        "palette_id": sel_palette_id,
        "max_colors": sel_max_colors if sel_max_colors else (len(palette_colors) if palette_colors else None),
        "frame": {"width": frame_w, "color": frame_color} if frame_w and frame_color else None,
    }
    return jsonify({"results": saved, "meta": meta}), 201

# SD WebUI img2img proxy (supports reference image path)
@api_bp.route('/ai/img2img', methods=['POST'])
@jwt_required()
def ai_img2img():
    data = request.get_json() or {}
    prompt = data.get('prompt') or ''
    negative = data.get('negative', '')
    width = int(data.get('width', 1024))
    height = int(data.get('height', 1024))
    steps = int(data.get('steps', 30))
    cfg = float(data.get('cfg', 6))
    seed = data.get('seed', -1)
    reference_path = data.get('reference_path')
    if not reference_path or not os.path.exists(reference_path):
        return jsonify({"error": "reference_path geçersiz"}), 400
    # Auto-append LoRA tags like txt2img
    try:
        final_prompt = prompt or ''
        names_raw = os.environ.get('FORCE_LORA_NAMES')
        strengths_raw = os.environ.get('FORCE_LORA_STRENGTHS')
        if not names_raw:
            legacy = os.environ.get('FORCE_LORA_NAME')
            if legacy:
                names_raw = legacy
                strengths_raw = os.environ.get('FORCE_LORA_STRENGTH', '0.8')
        if names_raw:
            names = [n.strip() for n in names_raw.split(',') if n.strip()]
            strengths_list = None
            if strengths_raw:
                strengths_list = [s.strip() for s in strengths_raw.split(',')]
            for idx, n in enumerate(names):
                if f"<lora:{n}:" in final_prompt:
                    continue
                strength = '0.8'
                if strengths_list and idx < len(strengths_list):
                    strength = strengths_list[idx] or '0.8'
                final_prompt = f"{final_prompt} <lora:{n}:{strength}>".strip()
    except Exception:
        final_prompt = prompt
    # tiling
    try:
        tiling = bool(data.get('tiling', True))
    except Exception:
        tiling = True
    # denoising strength
    try:
        denoise = float(data.get('denoising_strength', 0.55))
    except Exception:
        denoise = 0.55
    # read image and b64 encode
    try:
        with open(reference_path, 'rb') as f:
            ref_b64 = base64.b64encode(f.read()).decode('utf-8')
    except Exception as e:
        return jsonify({"error": f"Referans okunamadı: {e}"}), 400
    payload = {
        "prompt": final_prompt,
        "negative_prompt": negative,
        "init_images": [ref_b64],
        "steps": steps,
        "cfg_scale": cfg,
        "seed": seed,
        "sampler_name": data.get('sampler_name', 'DPM++ 2M Karras'),
        "denoising_strength": denoise,
        "width": width,
        "height": height,
        "tiling": tiling,
        # Resize to target size (0: Just resize)
        "resize_mode": 0,
    }
    try:
        resp = requests.post(f"{get_sd_url()}/sdapi/v1/img2img", json=payload, timeout=SD_TIMEOUT_SEC)
        resp.raise_for_status()
        out = resp.json()
        images_b64 = out.get('images', [])
    except Exception as e:
        return jsonify({"error": f"SD hatası: {e}"}), 502
    os.makedirs(storage_path('generated'), exist_ok=True)
    saved = []
    for idx, b64img in enumerate(images_b64):
        raw = base64.b64decode(b64img.split(',')[-1])
        fname = f"ai_{uuid.uuid4().hex}_{idx}.png"
        path = storage_path('generated', fname)
        with open(path, 'wb') as f:
            f.write(raw)
        saved.append({"filename": fname, "path": path, "url": f"/api/generated/{fname}"})
    return jsonify({"results": saved}), 201

@api_bp.route('/v2/ai/txt2img', methods=['POST'])
@jwt_required()
def v2_ai_txt2img():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "prompt gerekli"}), 400
    negative = data.get('negative', '')
    width = int(data.get('width', 1024))
    height = int(data.get('height', 1024))
    n_iter = int(data.get('n_iter', 1))
    batch_size = int(data.get('batch_size', 1))
    total = max(1, n_iter) * max(1, batch_size)
    api_key = _read_api_key()
    model = os.environ.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')
    meta = _read_openai_meta()
    base_url = meta.get('base_url') or os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com')
    if not api_key:
        return jsonify({"error": "OPENAI_API_KEY gerekli"}), 500
    # Map size to supported options (OpenAI: 1024x1024, 1024x1536, 1536x1024)
    try:
        # Decide orientation first
        if width > height:
            size = '1536x1024'  # landscape
        elif height > width:
            size = '1024x1536'  # portrait
        else:
            size = '1024x1024'  # square
    except Exception:
        size = '1024x1024'
    # Basic prompt merge for negatives
    final_prompt = prompt
    if negative:
        final_prompt = f"{prompt}\nNegative: {negative}"
    # Prefer OpenAI Python SDK (as in C:\desenrun) to avoid auth nuances
    items = []
    sdk_err = None
    try:
        import openai
        openai.api_key = api_key
        # Optional base_url / org from meta/env
        if base_url and base_url.strip():
            try:
                openai.base_url = base_url.rstrip('/')
            except Exception:
                pass
        org = meta.get('organization') or os.environ.get('OPENAI_ORG')
        if org:
            try:
                openai.organization = org
            except Exception:
                pass
        result = openai.images.generate(model=model, prompt=final_prompt, size=size, n=total)
        items = getattr(result, 'data', []) or []
    except Exception as e:
        sdk_err = str(e)
        items = []
    if not items:
        # Fallback: direct HTTP to generations endpoint
        try:
            url = f"{(base_url or 'https://api.openai.com').rstrip('/')}/v1/images/generations"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "dunyatek-v2/1.0"
            }
            if meta.get('project'):
                headers['OpenAI-Project'] = meta['project']
            org = meta.get('organization') or os.environ.get('OPENAI_ORG')
            if org:
                headers['OpenAI-Organization'] = org
            payload = {"model": model, "prompt": final_prompt, "size": size, "n": total}
            resp = requests.post(url, headers=headers, json=payload, timeout=SD_TIMEOUT_SEC)
            try:
                resp.raise_for_status()
            except Exception as rexc:
                # include response text for debugging
                return jsonify({"error": f"OpenAI HTTP hatası: {rexc}; body={resp.text[:500]}"}), 502
            js = resp.json()
            items = js.get('data') or []
        except Exception as e:
            # Return combined error context
            return jsonify({"error": f"OpenAI fallback hatası: {e}; sdk_err={sdk_err}"}), 502
    os.makedirs(storage_path('generated'), exist_ok=True)
    saved = []
    for idx, it in enumerate(items):
        b64 = it.get('b64_json')
        if not b64:
            continue
        raw = base64.b64decode(b64)
        fname = f"ai_v2_{uuid.uuid4().hex}_{idx}.png"
        path = storage_path('generated', fname)
        try:
            with open(path, 'wb') as f:
                f.write(raw)
            saved.append({"filename": fname, "path": path, "url": f"/api/generated/{fname}"})
        except Exception:
            continue
    if not saved:
        return jsonify({"error": "OpenAI çıktı alınamadı"}), 502
    return jsonify({"results": saved}), 201

# Prompt Templates CRUD
@api_bp.route('/prompts', methods=['GET'])
@jwt_required()
def list_prompts():
    items = PromptTemplate.query.order_by(PromptTemplate.created_at.desc()).all()
    return jsonify([
        {
            "id": p.id,
            "name": p.name,
            "prompt": p.prompt,
            "negative": p.negative,
            "width": p.width,
            "height": p.height,
            "steps": p.steps,
            "cfg": p.cfg,
            "sampler": p.sampler,
            "tags": p.tags,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        } for p in items
    ]), 200

@api_bp.route('/prompts', methods=['POST'])
@jwt_required()
def create_prompt():
    data = request.get_json() or {}
    if not data.get('name') or not data.get('prompt'):
        return jsonify({"error": "name ve prompt gerekli"}), 400
    p = PromptTemplate(
        name=data['name'],
        prompt=data['prompt'],
        negative=data.get('negative'),
        width=data.get('width'),
        height=data.get('height'),
        steps=data.get('steps'),
        cfg=data.get('cfg'),
        sampler=data.get('sampler'),
        tags=data.get('tags'),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({"id": p.id}), 201

@api_bp.route('/prompts/<int:pid>', methods=['PUT'])
@jwt_required()
def update_prompt(pid: int):
    p = PromptTemplate.query.get(pid)
    if not p:
        return jsonify({"error": "Prompt bulunamadı"}), 404
    data = request.get_json() or {}
    for key in ['name','prompt','negative','width','height','steps','cfg','sampler','tags']:
        if key in data:
            setattr(p, key, data[key])
    db.session.commit()
    return jsonify({"message": "Güncellendi"}), 200

@api_bp.route('/prompts/<int:pid>', methods=['DELETE'])
@jwt_required()
def delete_prompt(pid: int):
    p = PromptTemplate.query.get(pid)
    if not p:
        return jsonify({"error": "Prompt bulunamadı"}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Silindi"}), 200
