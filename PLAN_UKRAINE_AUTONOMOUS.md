# PLAN_UKRAINE_AUTONOMOUS

## Goal
Ship the `ukraine` reader as a child-first autonomous app for a 5-year-old, with a parent-gated admin area, improved bilingual assessment quality, and reliable deploy/test coverage.

## Scope
- Child mode by default (no password prompt for daily reading)
- Parent gate (PIN) for profile/export/diagnostics/settings
- Guided diagnostic includes adult observation checkpoint
- Alternate RU/UK daily schedule (parent-configurable)
- iPad portrait/landscape UX hardening
- Content cleanup for current RU/UK passages
- Deploy and sanity-check

## Execution Steps

1. Backend auth + settings
- Add parent PIN auth endpoints (`/api/parent/auth/status|login|logout`)
- Add child settings endpoints (`/api/child/settings` GET public, POST parent-only)
- Keep diagnostic token flow; require parent auth for diagnostic link creation
- Open child-safe endpoints (`/api/texts`, `/api/sessions/*`) without parent auth
- Keep parent-only endpoints protected (`/api/profile`, `/api/recommendations`, `/api/export/profile.json`)

2. Backend diagnostic enrichment
- Accept and normalize `adult_observations` on diagnostic passages
- Include adult-observation signal in diagnostic performance computation
- Add endpoint for optional incremental observation write (`/api/diagnostics/runs/:runId/adult-observations`)

3. Frontend API wiring
- Replace unlock-password flow with parent PIN flow for admin routes
- Add child settings API calls and client helpers

4. Frontend child mode
- Default route presents child flow immediately
- Hide profile/admin controls from child flow
- Use schedule-based language selection (alternate RU/UK by day)
- Keep session queue/offline sync behavior

5. Frontend parent area
- Add parent login card in profile route when unauthenticated
- Parent dashboard keeps export + create diagnostic link + profile details
- Add settings UI for language schedule mode

6. Diagnostic UI upgrade
- After quiz per passage, show adult observation checkpoint step
- Submit observations with passage result and continue adaptive flow

7. Content quality pass
- Rewrite repetitive RU/UK paragraph templates to remove gender/case errors
- Keep IDs/difficulty/quiz schema stable

8. iPad hardening
- Increase touch target size and spacing
- Add orientation-aware layout rules for portrait and landscape

9. Verification + deploy
- Run lint/build for `apps/ukraine`
- Run Playwright smoke (child flow, parent login, diagnostic link entrypoint)
- Deploy via `./scripts/deploy.sh ukraine`
- Verify production URL loads and core flows respond

## Acceptance Criteria
- Child can start and complete reading without entering any password
- Parent-only features require PIN and reject unauthenticated access
- Diagnostic run captures adult observations and updates profiles
- RU/UK language alternates daily by default
- UI is usable on iPad portrait + landscape
- Deploy succeeds and app is reachable in production
