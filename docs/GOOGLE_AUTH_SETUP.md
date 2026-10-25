# Google sign-in setup for NORI V0.2.7

Google sign-in is optional and stays disabled until valid server-side OAuth settings are provided. Email/password sign-in remains available without these settings. For detailed steps in Russian, see [`GOOGLE_AUTH_SETUP_RU.md`](GOOGLE_AUTH_SETUP_RU.md).

## Local Windows setup

1. Create an OAuth client of type **Web application** in Google Cloud Console and configure the OAuth consent screen as required by Google.
2. Add this exact Authorized redirect URI to the client while testing on the same computer:
   `http://localhost:3000/auth/google/callback`
3. Copy `.env.example` to `.env` in the project root. Put the client ID and client secret in the matching variables. Keep `.env` private; it is excluded by `.gitignore`. Never paste the secret into client JavaScript or a public repository.
4. Stop and restart NORI. `GET /api/oauth/google/status` should return `configured: true`. The Google button will then become enabled.
5. Click the Google button, review the Google consent screen and return to NORI. A one-time, short-lived ticket is exchanged for the NORI session token.

The redirect URI configured in Google must match `GOOGLE_REDIRECT_URI` exactly. For an internet deployment, use the site's real HTTPS callback URL and register that exact URL with Google. The localhost callback is for the computer running the service; it is not suitable for a phone opening NORI via another computer's LAN IP. For phone or public use with Google sign-in, deploy the backend to an HTTPS host first and configure its redirect URI accordingly.

## Current limitations

- This is a local prototype, not an audited production identity system.
- Accounts created with email/password and Google are not automatically linked by email. If the email already belongs to a password account, the Google callback asks the user to sign in through the existing method.
- Email verification, password recovery, rate limiting, account recovery, persistent database migrations and security review remain future work.
- Integration against Google's live provider cannot be tested until a real client is configured by the project owner. The project does not contain OAuth secrets.
