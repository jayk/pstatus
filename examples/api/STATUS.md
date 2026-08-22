---
2026-08-21: BLOCKED: Finish token refresh endpoint. ETA:3h type:code needs:api-review

Waiting for the auth team to confirm the refresh token expiry rule.

Relevant branch: `feature/token-refresh`.

---
2026-08-21: TODO: Add rate-limit tests for login flow. ETA:1.5h type:test priority:high

- [ ] Add the happy-path test.
- [ ] Add the burst traffic test.
- [ ] Add the lockout assertion.

---
- [x] Stabilize the health check responses.
  - [x] Return a consistent JSON shape.
  - [x] Add uptime to the response.

- [ ] Replace the legacy request parser.
  - [x] Audit the old parser.
  - [ ] Add the streaming parser.
  - [ ] Add regression tests.

- [ ] BLOCKED: Roll out signed webhooks.
  - [ ] Get the shared secret from operations.
  - [ ] Verify the HMAC in middleware.
