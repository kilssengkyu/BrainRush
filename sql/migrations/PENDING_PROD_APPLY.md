# Pending Production Apply

As of 2026-03-29, migrations up to `20260329_6` are applied in production.

## Remaining

- `20260329_7_split_daily_activity_from_get_profile_with_pencils.sql`
- `20260329_8_home_tutorial_seen_server_flag.sql`
- `20260329_9_mailbox_claim_block_when_pencils_full.sql`
- `20260329_10_pick_ghost_highscore_over_1500_use_bottom5.sql`

## Apply Order

1. Deploy frontend (Home calls `record_daily_activity`).
2. Apply `20260329_7_split_daily_activity_from_get_profile_with_pencils.sql` in production DB.
3. Apply `20260329_8_home_tutorial_seen_server_flag.sql` in production DB.
4. Apply `20260329_9_mailbox_claim_block_when_pencils_full.sql` in production DB.
5. Apply `20260329_10_pick_ghost_highscore_over_1500_use_bottom5.sql` in production DB.

## Done Check

```sql
select proname
from pg_proc
where proname in ('record_daily_activity', 'mark_home_tutorial_seen');
```
