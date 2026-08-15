# Open Google Finance Classic

A private, self-hosted finance dashboard recreating the old classic interface of Google Finance.

## Development setup

1. Copy `.env.example` to `.env`.
2. Replace `APP_ENCRYPTION_KEY` with a base64-encoded 32-byte value.
3. Run `docker compose up --build`.
4. Open the dashboard at `http://localhost:5173` and confirm the API responds at `http://localhost:3000/health`.

The project uses Redis Stack with AOF persistence. Provider integrations and the React UI are added in subsequent implementation phases.

For a production-style local deployment, run `docker compose -f compose.production.yaml up --build` and open `http://localhost:3000`. Set `COOKIE_SECURE=true` when placing the app behind HTTPS.

## Authentication modes

- `AUTH_MODE=disabled` creates one persistent local profile without a login screen.
- `AUTH_MODE=required` enables username/password login. Set `ALLOW_REGISTRATION=true` to enable self-registration.

Provider credentials are encrypted in Redis with `APP_ENCRYPTION_KEY`. Keep that key safe: losing it prevents the app from reading existing credentials.

## Backup safety

Settings can export a complete JSON backup. It intentionally contains provider API keys in plain text so it can be restored on another instance. Store it as a secret and never attach it to an issue, commit it, or share it publicly. Restoring a backup replaces the current user’s watchlists, market groups, settings, and provider keys.

## Validation

After installing dependencies, run `pnpm test`. The suite covers configuration validation, credential encryption boundaries, cache freshness/stale fallback, and backup credential restoration.
