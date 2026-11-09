---
title: Authentication & Access Control
section: working-with
order: 22
slug: authentication
---

# Authentication & Access Control

KainBain can sign users in through your organisation's existing accounts
(OpenID Connect) and control what they may change with roles. The whole
layer is **off by default**: with every knob at its default, each request
runs as the shared built-in `admin` user and no login screen appears.

> **Beginners:** leave it off until you need it. Nothing here is required
> for a personal install — turn it on only when several people share one
> KainBain and you want them to sign in individually.

## Turning it on

1. Register KainBain at your identity provider as a confidential web app
   and note the client id and secret. Register this exact redirect URI:
   `https://<your-host>/api/auth/callback`.
2. Find the provider's issuer URL — the base URL whose
   `<issuer>/.well-known/openid-configuration` returns JSON. If that URL
   does not answer, the issuer is wrong.
3. Set the variables and restart (full table in Ports & Environment
   (`#/docs/ports-env`)):

```bash
KAINBAIN_OIDC_ISSUER_URL=https://id.example.com/realms/company
KAINBAIN_OIDC_CLIENT_ID=kainbain
KAINBAIN_OIDC_CLIENT_SECRET=<secret>
KAINBAIN_AUTH_ENABLED=true
```

4. Seed your first admin **before** enabling, or nobody can administer:
   `KAINBAIN_AUTH_BOOTSTRAP_ADMINS=you@example.com`.
5. Open the app, sign in at `#/login` with your organisation account, and
   manage everyone from System Settings Access.

You can change every value later from the Access tab itself (no restart):
runtime settings beat env vars per knob.

## Roles in brief

| Role | May |
| --- | --- |
| `admin` | Administer users, roles, mappings, and settings |
| `member` | Sign in as an ordinary user (route checks to come) |
| `viewer` | Sign in read-only (route checks to come) |

A user's effective roles are their directly assigned roles, plus roles
mapped from their provider groups, plus any roles scoped to the current
project. Groups refresh from the sign-in token on every login; disabling a
user bites immediately.

Machine runners are unaffected: `/runners/*` keeps its own credential
channel and never asks for user sign-in.

## If something goes wrong

| Symptom | Most likely fix |
| --- | --- |
| Login button answers `502` | Issuer URL wrong or provider unreachable — open the discovery URL yourself |
| Provider complains about the redirect URI | Registered URI differs by a character (scheme, host, port, path) — compare exactly |
| Callback answers `400 invalid_state` | Attempt expired or cookies blocked — sign in again from `#/login` |
| Callback answers `401 sign_in_failed` | Client secret wrong or server clock skewed — re-enter the secret, check NTP |
| Nobody has `admin` | Set `KAINBAIN_AUTH_BOOTSTRAP_ADMINS` and restart; if a saved Access-tab setting disagrees, stop the server, delete `~/.kainbain/engine/auth/access.json`, and restart |

The full operator manual — provider specifics for Auth0, Entra ID, and
Keycloak, the complete troubleshooting table, the `/auth/*` API, security
notes, and how to add roles — is
`docs/authentication-and-access-control.md` in the repo, decided in
`docs/adr/0015-oidc-rbac-access-control.md`.
