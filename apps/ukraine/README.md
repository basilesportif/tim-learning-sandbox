# Ukraine Reader

Bilingual (Russian + Ukrainian) child reading app with:
- Child-first daily reading flow
- Parent-gated diagnostics and profile tools
- Adaptive text difficulty and progress profiling
- Offline queueing for session sync

## Parent PIN
Set this on the server before production use:

```bash
export UKRAINE_PARENT_PIN="your-pin"
```

Legacy app password endpoint still exists for compatibility:

```bash
export UKRAINE_APP_PASSWORD="your-password"
```

## Child Schedule Settings
Parent area can configure daily language schedule:
- `alternate` (default)
- `both`
- `single`

## Diagnostic
Parent can create one-time diagnostic links from Parent Area.
Diagnostic captures:
- passage reading behavior
- comprehension quiz accuracy
- adult observation checkpoint per passage

## Open Source Text Pipeline
Parent Area now includes source ingestion + review controls.

- Sync endpoint (parent-gated): `POST /ukraine/api/admin/sources/sync`
- Status endpoint (parent-gated): `GET /ukraine/api/admin/sources/status`
- Review queue (parent-gated):
  - `GET /ukraine/api/admin/sources/review-queue`
  - `POST /ukraine/api/admin/sources/review-queue/:reviewId`

Current provider implementation: **Global Digital Library (GDL)**.

New records are not auto-published. They enter `source_review_queue.json` as `pending` and must be approved.

Data files:
- `apps/ukraine/data/source_review_queue.json`
- `apps/ukraine/data/source_sync_log.json`

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

Run a manual source sync from repo root:

```bash
npm run sync:ukraine:sources -- --languages ru,uk --per-language-limit 6
```
