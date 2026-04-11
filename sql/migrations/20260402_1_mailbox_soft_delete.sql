-- Mailbox soft delete support:
-- - users can hide unread/read items
-- - read "delete all" can skip claimable-reward mails in app logic

ALTER TABLE public.announcement_user_states
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_announcement_user_states_user_occ_deleted
  ON public.announcement_user_states (user_id, occurrence_date, deleted_at, read_at, claimed_at, created_at DESC);
