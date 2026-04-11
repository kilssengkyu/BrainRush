# SQL Deployment Tracking

Use these files to manage environment rollout status.

- `dev_applied_prod_pending.md`
  - Migrations already applied in DEV but not yet applied in PROD.
- `prod_applied.md`
  - Migrations confirmed as applied in PROD.

## Policy

1. Keep `migrations/` as the only executable source.
2. Do not copy/move migration SQL into environment-specific folders.
3. Update these markdown trackers immediately after each DB apply.
