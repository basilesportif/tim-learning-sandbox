# Clerk

Use this skill when integrating Clerk auth in React, Vite, Express, Next.js, or worker-backed apps, especially when protecting routes, wiring bearer-token auth to APIs, or cleaning up publishable-key env handling.

## Decide the frontend env pattern first

Do not rewrite a repo from one Clerk env pattern to another unless the user explicitly asks for that migration.

Preserve the repo's existing pattern:

- Standard Vite pattern: browser code reads `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
- Injected single-key pattern: browser code reads `import.meta.env.CLERK_PUBLISHABLE_KEY` and Vite injects it from a shared env file

For new React + Vite apps, prefer Clerk Core 3's `@clerk/react` package.
If a repo already uses `@clerk/clerk-react`, preserve it unless the user explicitly wants the package migration.

## Questions to settle before editing

- What frontend stack is this: Vite React, Next.js, plain server-rendered pages, or something else?
- What backend stack is this: Express, worker, Next API routes, or none?
- Which routes or pages must require auth?
- What authorization rule applies after sign-in: any signed-in user, allowlist, or role-based admin access?
- Where should users land after sign-in and sign-up?
- What production URL or domain must be configured in the Clerk dashboard?

## Recommended defaults

- Protect dashboard-style child routes when the user has not named a different entrypoint.
- Use Clerk bearer tokens from frontend to backend: `Authorization: Bearer <token>`.
- Default to signed-in-user access unless the product clearly needs allowlist or role gates.

## Pattern A: Standard Vite publishable key

Use this when the repo already exposes the publishable key through a `VITE_` env var.

Shared env:

```bash
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
```

Frontend env:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

Frontend entrypoint:

```tsx
import { ClerkProvider } from '@clerk/react';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}
```

## Pattern B: Injected single publishable key

Use this when the repo wants one shared publishable key value and already injects it through Vite config.

Shared env:

```bash
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
```

Vite config:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const webDir = fileURLToPath(new URL('.', import.meta.url));
const repoRootDir = path.resolve(webDir, '..');

export default defineConfig(({ mode }) => {
  const webEnv = loadEnv(mode, webDir, '');
  const rootEnv = loadEnv(mode, repoRootDir, '');
  const publishableKey =
    webEnv.CLERK_PUBLISHABLE_KEY ||
    rootEnv.CLERK_PUBLISHABLE_KEY ||
    '';

  return {
    define: {
      'import.meta.env.CLERK_PUBLISHABLE_KEY': JSON.stringify(publishableKey),
    },
  };
});
```

Frontend entrypoint:

```tsx
const publishableKey = import.meta.env.CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error('Missing CLERK_PUBLISHABLE_KEY');
}
```

## Frontend integration

For new React + Vite apps, mount `ClerkProvider` from `@clerk/react` at the app root and prefer `Show` over the older `SignedIn` and `SignedOut` components.
For internal tools without a separate landing page, render Clerk's `<SignIn />` directly in the signed-out state.

```tsx
import { ClerkProvider, SignIn, Show } from '@clerk/react';

function ProtectedRoute({ children }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><SignIn /></Show>
    </>
  );
}
```

When calling a protected API:

```tsx
const token = await getToken();

await fetch('/api/protected', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

If a repo is already on `@clerk/clerk-react`, keep the older imports unless the user asked for the migration.

## Express backend pattern

Typical pattern:

```ts
import { clerkMiddleware, getAuth, createClerkClient } from '@clerk/express';

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

app.use('/api', clerkMiddleware({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
}));

export async function requireUser(req, res, next) {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await clerkClient.users.getUser(auth.userId);
  const email = user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress;

  req.userEmail = email;
  next();
}
```

Keep Clerk middleware mounted before protected handlers.
If the repo already uses `@clerk/express`, keep the server env behavior that already works there.

## Allowlist and admin gates

If the product already has user records, allowed-users files, or admin flags, enforce those after Clerk identifies the user.

Common sequence:

1. Read `auth.userId`
2. Fetch the Clerk user
3. Derive the primary email
4. Apply allowlist or admin checks
5. Attach the resolved app user to the request

Example env:

```bash
CLERK_ALLOWED_EMAILS=admin@example.com,ops@example.com
```

## Optional flex-auth pattern

Use this only when the same endpoint must accept either an API key or a Clerk JWT.

```ts
export function flexAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }

  return clerkAuth(req, res, (error) => {
    if (error) return next(error);
    return requireUser(req, res, next);
  });
}
```

## Troubleshooting

- Missing publishable key in the browser usually means the wrong Vite env pattern is being used.
- Backend 401s with a valid token usually mean Clerk middleware is not mounted before the protected handler.
- Backend 403s after sign-in usually mean the app's allowlist or role gate is rejecting the resolved email.
- Redirect issues in production usually come from Clerk dashboard URLs not matching the deployed domain.
- For new React apps, prefer `@clerk/react`; `@clerk/clerk-react` is the older package name.

## Done criteria

- Protected UI routes gate unauthenticated users into the Clerk flow.
- Protected backend routes reject missing or invalid bearer tokens.
- Post-auth authorization matches the repo's real allowlist or role model.
- The repo uses one Clerk env pattern consistently instead of mixing both by accident.
