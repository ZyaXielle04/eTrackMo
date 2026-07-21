# eTrackMo Finance Tracker

eTrackMo is a secure personal finance SaaS web app built with Flask and
Firebase. It uses Firebase Client SDK for browser authentication and Firebase
Admin SDK on the backend for trusted database writes.

## Features

- Email/password authentication with Firebase Authentication
- Register, login, forgot password, and email verification flows
- Protected dashboard shell
- Accounts page for creating, editing, deleting, and reviewing balances
- Transactions page for recording income, expenses, account transfers, and external sends
- Date and time tracking for transaction records
- Dropdown-based transaction categories for cleaner reporting data
- Optional transaction fees for transfer-style money movement
- Searchable and filterable transaction history page
- Polished responsive styling across auth, dashboard, account, transaction, and history pages
- Split backend API routes into feature-focused modules before Coop development
- Coop creation, invite-code join requests, owner approvals, and granular sharing permissions
- Expandable Coop group details for members, invite codes, requests, and permissions
- Server-recorded transaction entries with backend balance updates
- Responsive SaaS-style dashboard layout with shared sidebar partials
- Firebase Realtime Database integration
- Backend-controlled database writes through Firebase Admin SDK

## Planned Features

- Transaction editing and deletion
- Multi-account finance overview
- Coop data visibility views for approved members
- Invite links for Coop join requests

## Tech Stack

- Python
- Flask
- Firebase Authentication
- Firebase Realtime Database
- Firebase Admin SDK
- Flask-WTF
- Flask-Talisman
- HTML, CSS, and JavaScript

## Project Structure

```text
app/
  routes/
    api/
      __init__.py
      accounts.py
      auth_profile.py
      common.py
      coops.py
      transactions.py
    __init__.py
    auth.py
  static/
    css/
    js/
    images/
  templates/
    partials/
firebase/
credentials/
tests/
app.py
config.py
firebase-database.rules.json
SECURITY.md
PRODUCT_FEATURES.md
```

## Setup

1. Create and activate a virtual environment.

```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

2. Install dependencies.

```powershell
pip install -r requirements.txt
```

3. Create a `.env` file from `.env.example`.

```powershell
Copy-Item .env.example .env
```

4. Add your Firebase Admin SDK service account file.

Place it at:

```text
credentials/firebase-service-account.json
```

Keep this file private. It is required for the backend Firebase Admin SDK.

5. Fill in the Firebase and Flask values in `.env`.

```env
SECRET_KEY=replace-with-at-least-32-random-characters
FLASK_DEBUG=False
APP_REQUIRE_CONFIG=True
FIREBASE_CREDENTIALS_PATH=credentials/firebase-service-account.json
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.region.firebasedatabase.app
FIREBASE_API_KEY=your-firebase-web-api-key
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-web-app-id
FIREBASE_MEASUREMENT_ID=your-measurement-id
```

6. Run the app.

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Firebase Database Rules

Apply the rules in `firebase-database.rules.json` in the Firebase Console.

The intended security model is:

- Browser clients can read only their own user-scoped data.
- Browser clients cannot directly write sensitive finance data.
- Account, transaction, profile, and audit writes go through the Flask backend.
- Backend writes use Firebase Admin SDK after verifying Firebase ID tokens.

## Security

Current security controls include:

- Required environment configuration validation
- Secure Flask session cookie settings
- Content Security Policy and security headers through Flask-Talisman
- CSRF protection on unsafe backend requests
- Firebase ID token verification with revoked-token checks
- Verified-email requirement for protected account APIs
- Backend-only account and transaction writes
- Account ID validation
- Decimal-based money parsing stored as integer cents
- Lightweight API rate limiting
- Audit event logging for profile and account mutations
- Secrets and credentials excluded from source control

See `SECURITY.md` for more details.

## Tests

Run the security smoke tests:

```powershell
venv\Scripts\python.exe -m unittest discover -s tests
```

Run a syntax check:

```powershell
venv\Scripts\python.exe -m compileall app tests
```

Check installed dependencies:

```powershell
venv\Scripts\python.exe -m pip check
```

## Important Notes

- Do not commit `.env`.
- Do not commit `credentials/firebase-service-account.json`.
- Rotate Firebase service account keys immediately if they are exposed.
- Publish `firebase-database.rules.json` manually in Firebase Console before
  treating the database as locked down.

## License

No license has been specified yet.
