# Pending Production Apply

As of 2026-03-29, migrations up to `20260329_6` are applied in production.

## Remaining

- `20260329_7_split_daily_activity_from_get_profile_with_pencils.sql`

## Apply Order

1. Deploy frontend (Home calls `record_daily_activity`).
2. Apply `20260329_7_split_daily_activity_from_get_profile_with_pencils.sql` in production DB.

## Done Check

```sql
select proname
from pg_proc
where proname = 'record_daily_activity';
```

