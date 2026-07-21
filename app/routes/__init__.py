from flask import Blueprint
from flask import current_app
from flask import render_template


main = Blueprint("main", __name__)


def get_firebase_config():

    return {
        "apiKey": current_app.config["FIREBASE_API_KEY"],
        "authDomain": current_app.config["FIREBASE_AUTH_DOMAIN"],
        "databaseURL": current_app.config["FIREBASE_DATABASE_URL"],
        "projectId": current_app.config["FIREBASE_PROJECT_ID"],
        "storageBucket": current_app.config["FIREBASE_STORAGE_BUCKET"],
        "messagingSenderId": current_app.config[
            "FIREBASE_MESSAGING_SENDER_ID"
        ],
        "appId": current_app.config["FIREBASE_APP_ID"],
        "measurementId": current_app.config["FIREBASE_MEASUREMENT_ID"]
    }


@main.route("/")
def index():

    return render_template(
        "index.html",
        firebase_config=get_firebase_config()
    )


@main.route("/login")
def login():

    return render_template(
        "login.html",
        firebase_config=get_firebase_config()
    )


@main.route("/register")
def register():

    return render_template(
        "register.html",
        firebase_config=get_firebase_config()
    )


@main.route("/forgot-password")
def forgot_password():

    return render_template(
        "forgot_password.html",
        firebase_config=get_firebase_config()
    )


@main.route("/verify-email")
def verify_email():

    return render_template(
        "verify_email.html",
        firebase_config=get_firebase_config()
    )


@main.route("/dashboard")
def dashboard():

    return render_template(
        "dashboard.html",
        firebase_config=get_firebase_config(),
        active_page="dashboard"
    )


@main.route("/accounts")
def accounts():

    return render_template(
        "accounts.html",
        firebase_config=get_firebase_config(),
        active_page="accounts"
    )


@main.route("/transactions")
def transactions():

    return render_template(
        "transactions.html",
        firebase_config=get_firebase_config(),
        active_page="transactions"
    )


@main.route("/history")
def history():

    return render_template(
        "history.html",
        firebase_config=get_firebase_config(),
        active_page="history"
    )


@main.route("/coop")
def coop():

    return render_template(
        "internal_page.html",
        firebase_config=get_firebase_config(),
        active_page="coop",
        page_title="Coop",
        page_kicker="Shared finance",
        page_heading="Coop",
        page_description="Create Coops, join by invite code, and manage shared finance permissions.",
        panel_title="Coop workspace",
        panel_body="This page will contain Coop creation, join requests, members, and sharing permissions."
    )


@main.route("/terms")
def terms():

    return render_template(
        "terms.html"
    )


@main.route("/privacy")
def privacy():

    return render_template(
        "privacy.html"
    )


# Import auth blueprint so Flask can register it
from app.routes.auth import auth

