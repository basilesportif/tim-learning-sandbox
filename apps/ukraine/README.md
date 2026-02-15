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

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```
