---
title: API Keys for Agents & Services
section: working-with
order: 23
slug: api-keys
---

# API Keys for Agents & Services

API keys let external services and agents call the KainBain API with
least-privilege credentials — for example, a security scanner that
auto-creates tickets with only the create-tasks grant. Keys reuse the same
role structure as user accounts (`admin`, `member`, `viewer`), optionally
narrowed by scopes.

The whole layer is **off by default**: with every knob at its default, the
API behaves exactly as today and key credentials are ignored. Browser
sessions and the Runner credential channel never need a key, with the
switch on or off.

## Turning it on

1. Open System Settings › Access and flip **API keys** on (or set
   `KAINBAIN_API_KEYS_ENABLED=true` before boot; the settings page can
   change it later without a restart).
2. Create a key (below) and give the secret to the calling service.
3. To actually **require** credentials on guarded routes, also turn on
   **Access control**: API keys alone never block anonymous traffic, which
   is what keeps the UI and Runners working untouched. With both switches
   on, guarded routes need a signed-in session or a valid key.

Send the secret as `Authorization: Bearer <secret>` or as the `x-api-key`
header. When a request carries both a valid session cookie and a key, the
session wins.

## Creating a key

System Settings › Access › API keys › New key (admin role required):

- **Name** — flags every action the key takes (`api-key:<name>` in task
  history and the audit log). Names are unique; pick something the next
  on-call engineer will recognise, e.g. `security-scanner`.
- **Role** — the same catalogue as users. `member` creates and updates
  work; `viewer` reads.
- **Scopes** (optional) — narrow the role down, e.g. only `tasks:create`.
  Scopes only ever subtract: a key with no scopes gets its full role.
- **Expiry** (optional, pre-filled to 90 days, clearable) — expired keys
  answer `401` like unknown keys.

The secret is shown **once**. Copy it immediately — it is stored hashed
and can never be displayed again. If it leaks, revoke the key and mint a
new one.

Keys can reach the task surface (create, update, delete tasks) in this
version. Reads stay open, and settings, user management, runs control, and
key management itself are human-session-only: keys answer `403` there even
with the admin role.

## Rotating and revoking

- **Rotate**: create a replacement key, switch the caller to the new
  secret, then revoke the old key. There is no downtime and no automation
  to configure.
- **Revoke**: API keys › Revoke (or `DELETE /auth/api-keys/:id`). The key
  stops working immediately, including already-issued secrets.

## Seeing what a key did

Every key action is flagged by key name in three places:

- **Task history** — e.g. `Task created by api-key:security-scanner`.
- **Security audit log** — `apikey.created`, `apikey.revoked`,
  `apikey.used`, and `apikey.used_denied` entries alongside sign-ins and
  role changes (secrets never appear in any log).
- **Per-key usage** — API keys › Usage (or
  `GET /auth/api-keys/:id/usage`): the key's metadata plus its recent
  audit entries, newest first.

The key list also shows each key's last-used timestamp, so dormant keys
stand out for cleanup.
