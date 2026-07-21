# Security Notes

## Secrets

- Keep `.env` and `credentials/` out of source control.
- Keep `credentials/firebase-service-account.json` only on machines that need to run the Firebase Admin SDK.
- Do not paste the service-account JSON, private key, or `.env` contents into chat, issues, commits, screenshots, or logs.
- Rotate the Firebase service-account key immediately if it is accidentally committed or shared.

## Configuration

- `APP_REQUIRE_CONFIG=True` makes the app fail startup when required secrets or Firebase settings are missing.
- `SECRET_KEY` must be at least 32 characters.
- `FIREBASE_DATABASE_URL` must be HTTPS.
- `FLASK_DEBUG=False` should be used outside local development.

## Firebase Rules

The browser may read only the signed-in user's own data. Sensitive writes are
owned by the Flask backend through the Firebase Admin SDK, not by Firebase
Client SDK browser writes.

Apply the rules in `firebase-database.rules.json` in the Firebase console:

```json
"accounts": {
  "$uid": {
    ".read": "auth !== null && auth.uid === $uid",
    ".write": false
  }
}
```

Keep `users`, `accounts`, `transactions`, `auditLogs`, and future Coop
membership writes behind backend endpoints so each write can verify the Firebase
ID token, check authorization, validate payloads, enforce CSRF, rate limit, and
record audit events.

## Current API Controls

- All account endpoints require a Firebase ID token verified by the Admin SDK
  with revoked-token checks enabled.
- Account endpoints require verified email addresses.
- Browser API writes require Flask CSRF tokens.
- Account identifiers are server-generated UUID hex strings and route params are
  validated before database lookup.
- Amounts are parsed with `Decimal`, stored as integer cents, and bounded.
- Mutations write audit events under `auditLogs/{uid}`.
- A lightweight in-memory rate limiter protects the current single-process app.
  Use Redis-backed or Firebase/App Check-aware rate limiting before horizontal
  scaling.
