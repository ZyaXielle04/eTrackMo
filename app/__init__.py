from flask import Flask
from flask import jsonify
from flask import request

from config import Config

from firebase.admin import initialize_firebase

from flask_wtf.csrf import CSRFProtect

from flask_talisman import Talisman


csrf = CSRFProtect()


def create_app():
    app = Flask(__name__)

    app.config.from_object(Config)

    Config.validate()

    csrf.init_app(app)

    firebase_database_url = app.config["FIREBASE_DATABASE_URL"]
    firebase_auth_domain = f"https://{app.config['FIREBASE_AUTH_DOMAIN']}"
    firebase_realtime_database_hosts = [
        "https://*.firebasedatabase.app",
        "wss://*.firebasedatabase.app",
    ]

    csp = {
        "default-src": "'self'",
        "base-uri": "'self'",
        "connect-src": [
            "'self'",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://www.googleapis.com",
            "https://www.gstatic.com",
            "https://firestore.googleapis.com",
            firebase_database_url,
            *firebase_realtime_database_hosts,
        ],
        "font-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-src": [
            "'self'",
            firebase_auth_domain,
            firebase_database_url,
            "https://*.firebasedatabase.app",
        ],
        "frame-ancestors": "'none'",
        "img-src": ["'self'", "data:"],
        "object-src": "'none'",
        "script-src": [
            "'self'",
            "'unsafe-inline'",
            "https://www.gstatic.com",
            "https://apis.google.com",
            firebase_database_url,
            "https://*.firebasedatabase.app",
        ],
        "style-src": ["'self'", "'unsafe-inline'"],
    }

    Talisman(
        app,
        content_security_policy=csp,
        force_https=not app.debug,
        force_https_permanent=True,
        frame_options="DENY",
        permissions_policy={},
        referrer_policy="strict-origin-when-cross-origin",
        strict_transport_security=not app.debug,
        strict_transport_security_include_subdomains=True,
    )

    initialize_firebase(
        app.config["FIREBASE_CREDENTIALS_PATH"],
        app.config["FIREBASE_DATABASE_URL"],
        app.config["FIREBASE_SERVICE_ACCOUNT_JSON"],
    )

    from app.routes import main
    from app.routes.auth import auth
    from app.routes.api import api

    app.register_blueprint(main)
    app.register_blueprint(auth)
    app.register_blueprint(api)

    register_error_handlers(app)

    return app


def register_error_handlers(app):
    def wants_json_response():
        return request.path.startswith("/api/")

    @app.errorhandler(400)
    def handle_bad_request(error):
        if wants_json_response():
            return jsonify({"error": "Bad request."}), 400

        return error

    @app.errorhandler(403)
    def handle_forbidden(error):
        if wants_json_response():
            return jsonify({"error": "Forbidden."}), 403

        return error

    @app.errorhandler(404)
    def handle_not_found(error):
        if wants_json_response():
            return jsonify({"error": "Not found."}), 404

        return error

    @app.errorhandler(413)
    def handle_payload_too_large(error):
        if wants_json_response():
            return jsonify({"error": "Request payload is too large."}), 413

        return error

    @app.errorhandler(429)
    def handle_too_many_requests(error):
        if wants_json_response():
            return jsonify({"error": "Too many requests."}), 429

        return error

    @app.errorhandler(500)
    def handle_server_error(error):
        if wants_json_response():
            return jsonify({"error": "Internal server error."}), 500

        return error
