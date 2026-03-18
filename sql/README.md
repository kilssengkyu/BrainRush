# BrainRush SQL Guide

This directory is the single source of truth for DB changes.

## Structure

- `schema.sql`: Baseline schema snapshot.
- `migrations/`: Ordered, immutable migration files to apply to both DEV/PROD.
- `deploy/`: Environment rollout tracking files (what is DEV-only vs PROD-applied).
- `archive/`: Legacy/manual SQL files kept for reference only (do not apply blindly).

## Rules

1. Add new DB changes only in `migrations/` with filename:
   - `YYYYMMDD_HHMM__short_description.sql` (or existing `YYYYMMDD_description.sql` style)
2. Never edit a migration that was already applied.
3. Do not move files between DEV/PROD folders to represent status.
4. Track rollout status only in `deploy/*.md`.

## Rollout Workflow

1. Create migration file in `migrations/`.
2. Apply to DEV.
3. Add item to `deploy/dev_applied_prod_pending.md`.
4. After PROD apply, move/update entry in `deploy/prod_applied.md`.
