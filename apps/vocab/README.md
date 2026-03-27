# Vocab

Private vocabulary prep for books.

## What It Does

- Admin signs in with Clerk and imports books from pasted text, `.txt`, or page photos
- OCR page photos are processed in filename order, so names like `001.jpg`, `002.jpg`, `003.jpg` control page order
- Book imports run as background jobs so large OCR batches do not time out the browser request
- Each book stores a larger ranked word pool, and child sessions pull easier or harder words from that pool based on performance
- Book source text is stored server-side only for admin use
- Child users sign in with Clerk and see only their own assignments
- Sessions use multiple-choice meaning checks, optional hints, optional illustrations, and light spaced repetition

## Required Environment

Server:

```bash
export CLERK_PUBLISHABLE_KEY="pk_..."
export CLERK_SECRET_KEY="sk_..."
export VOCAB_ADMIN_EMAILS="admin@example.com"
export VOCAB_CHILD_EMAILS="child1@example.com,child2@example.com"
export OPENAI_API_KEY="sk-..."
```

Frontend:

```bash
export VITE_CLERK_PUBLISHABLE_KEY="pk_..."
```

You can also omit the `VITE_` variant and just set root `CLERK_PUBLISHABLE_KEY`; `apps/vocab/vite.config.js` will inject it for the client build.

## Development

```bash
cd apps/vocab
npm install
npm run build
npm run lint
```

Run the shared server from the repo root:

```bash
npm install
npm run dev
```

## Extract Stored Book Images

OCR page uploads are now retained per book. To extract illustration artifacts from those stored page images:

```bash
npm run vocab:extract-artifacts -- --book-id=<book-id>
```

Optional flags:
- `--force` to reprocess pages that were already scanned for artifacts
- `--limit=<n>` to cap how many books are processed in one run

## Reprocess Book Word Pools

To rebuild the ranked word pool for existing books from their stored source text:

```bash
npm run vocab:reprocess-pools -- --book-id=<book-id>
```
