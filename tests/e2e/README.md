# E2E scope

Chromium Playwright specs run against `pnpm dev` with no signed-in session.

Covered here: signed-out redirects for every role area, and unsigned
webhook rejection. Sign-up and the staff-invite flow need a live Clerk
test-mode session, so a human runs those against the Clerk dev instance
instead of automation.
