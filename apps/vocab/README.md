# Vocab

Private vocabulary prep for books.

## What It Does

- Admin signs in with Clerk and imports books from pasted text, `.txt`, or page photos
- Book source text is stored server-side only for admin use
- Child users sign in with Clerk and see only their own assignments
- Sessions use multiple-choice meaning checks, optional hints, optional illustrations, and light spaced repetition

## Required Environment

Server:

```bash
export CLERK_PUBLISHABLE_KEY="pk_..."
export CLERK_SECRET_KEY="sk_..."
export VOCAB_ADMIN_EMAILS="admin@example.com"
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
