import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Mail, MailOpen, Gift, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useUI } from '../../contexts/UIContext';

type MailboxModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  language: string;
  onRequireLogin: () => void;
  onClaimed: () => Promise<void> | void;
  onUnreadCountChange?: (count: number) => void;
};

type MailItem = {
  id: number;
  occurrenceDate: string;
  mailType: 'announcement' | 'mail';
  title: string;
  content: string;
  createdAt: string;
  startsAt: string;
  rewardPencils: number;
  rewardPracticeNotes: number;
  isRead: boolean;
  readAt: string | null;
  isClaimed: boolean;
  claimedAt: string | null;
  deletedAt: string | null;
};

const normalizeNoticeLocale = (language: string): string => {
  const normalized = String(language || '').toLowerCase();
  if (!normalized) return 'en';
  if (normalized.startsWith('zh-hant') || normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) {
    return 'zh-Hant';
  }
  if (normalized.startsWith('zh-hans') || normalized.startsWith('zh-cn') || normalized.startsWith('zh-sg')) {
    return 'zh-Hans';
  }
  if (normalized.startsWith('zh')) return 'zh-Hant';
  return normalized.split('-')[0];
};

const buildNoticeLocaleCandidates = (language: string): string[] => {
  const preferred = normalizeNoticeLocale(language);
  const list = [preferred, 'en', 'ko'];
  return list.filter((value, index) => value && list.indexOf(value) === index);
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
};

const ONCE_OCCURRENCE_DATE = '1970-01-01';

const getKstNow = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}:${pick('second')}`,
  };
};

const toKstDateString = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

const isPencilsFullClaimError = (message: string | undefined) => {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('pencils are full');
};

const MailboxModal = ({
  isOpen,
  onClose,
  userId,
  language,
  onRequireLogin,
  onClaimed,
  onUnreadCountChange,
}: MailboxModalProps) => {
  const { t } = useTranslation();
  const { showToast } = useUI();
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [deletingUnreadId, setDeletingUnreadId] = useState<number | null>(null);
  const [deletingReadAll, setDeletingReadAll] = useState(false);
  const [items, setItems] = useState<MailItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const localeCandidates = useMemo(() => buildNoticeLocaleCandidates(language), [language]);

  const loadMailbox = async (keepSelectedId?: number | null) => {
    setLoading(true);
    try {
      const { data: announcements, error: announcementError } = await (supabase as any)
        .from('announcements')
        .select('id, title, content, starts_at, ends_at, created_at, reward_pencils, reward_practice_notes, mail_type, target_type, target_user_id, is_recurring, recurrence_type, recurrence_until, daily_send_time')
        .eq('is_active', true)
        .order('starts_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (announcementError) throw announcementError;
      const kstNow = getKstNow();
      const baseRows = (announcements || []).filter((row: any) => {
        const targetType = String(row.target_type ?? 'all');
        const targetUserId = row.target_user_id ? String(row.target_user_id) : null;
        if (targetType === 'user' && (!userId || targetUserId !== userId)) return false;

        const isRecurring = Boolean(row.is_recurring);
        if (!isRecurring) {
          const startsAt = row.starts_at ? new Date(String(row.starts_at)).getTime() : Number.POSITIVE_INFINITY;
          const endsAt = row.ends_at ? new Date(String(row.ends_at)).getTime() : null;
          if (startsAt > Date.now()) return false;
          if (endsAt !== null && endsAt < Date.now()) return false;
          return true;
        }

        if (String(row.recurrence_type ?? '') !== 'daily') return false;
        const startDateKst = toKstDateString(row.starts_at);
        const untilDateKst = row.recurrence_until ? toKstDateString(row.recurrence_until) : '';
        const sendTime = String(row.daily_send_time ?? '00:00:00').slice(0, 8).padEnd(8, ':00');
        if (!startDateKst || kstNow.date < startDateKst) return false;
        if (untilDateKst && kstNow.date > untilDateKst) return false;
        if (kstNow.time < sendTime) return false;
        return true;
      });
      const ids = baseRows.map((row: any) => Number(row.id));
      const translationMap = new Map<number, Map<string, { title: string; content: string }>>();
      const occurrenceById = new Map<number, string>();
      baseRows.forEach((row: any) => {
        occurrenceById.set(
          Number(row.id),
          Boolean(row.is_recurring) ? kstNow.date : ONCE_OCCURRENCE_DATE
        );
      });
      const occurrenceDates = Array.from(new Set(Array.from(occurrenceById.values())));
      const stateMap = new Map<string, { read_at: string | null; claimed_at: string | null; deleted_at: string | null }>();

      if (ids.length > 0) {
        const { data: translations, error: translationError } = await (supabase as any)
          .from('announcement_translations')
          .select('announcement_id, locale, title, content')
          .in('announcement_id', ids)
          .in('locale', localeCandidates);
        if (translationError) throw translationError;

        (translations || []).forEach((row: any) => {
          const announcementId = Number(row.announcement_id);
          const locale = String(row.locale ?? '');
          if (!translationMap.has(announcementId)) {
            translationMap.set(announcementId, new Map());
          }
          translationMap.get(announcementId)!.set(locale, {
            title: String(row.title ?? ''),
            content: String(row.content ?? ''),
          });
        });
      }

      if (userId && ids.length > 0) {
        const { data: states, error: stateError } = await (supabase as any)
          .from('announcement_user_states')
          .select('announcement_id, occurrence_date, read_at, claimed_at, deleted_at')
          .eq('user_id', userId)
          .in('announcement_id', ids)
          .in('occurrence_date', occurrenceDates);
        if (stateError) throw stateError;

        (states || []).forEach((row: any) => {
          const key = `${Number(row.announcement_id)}:${String(row.occurrence_date ?? ONCE_OCCURRENCE_DATE)}`;
          stateMap.set(key, {
            read_at: row.read_at ? String(row.read_at) : null,
            claimed_at: row.claimed_at ? String(row.claimed_at) : null,
            deleted_at: row.deleted_at ? String(row.deleted_at) : null,
          });
        });
      }

      const mapped: MailItem[] = baseRows.map((row: any) => {
        const id = Number(row.id);
        const translations = translationMap.get(id);

        let resolvedTitle = '';
        let resolvedContent = '';
        if (translations) {
          for (const locale of localeCandidates) {
            const item = translations.get(locale);
            if (item?.title && item?.content) {
              resolvedTitle = item.title;
              resolvedContent = item.content;
              break;
            }
          }
        }

        const occurrenceDate = occurrenceById.get(id) ?? ONCE_OCCURRENCE_DATE;
        const state = stateMap.get(`${id}:${occurrenceDate}`);
        return {
          id,
          occurrenceDate,
          mailType: String(row.mail_type ?? 'announcement') === 'mail' ? 'mail' : 'announcement',
          title: resolvedTitle || String(row.title ?? ''),
          content: resolvedContent || String(row.content ?? ''),
          createdAt: String(row.created_at ?? ''),
          startsAt: String(row.starts_at ?? ''),
          rewardPencils: Math.max(0, Number(row.reward_pencils ?? 0)),
          rewardPracticeNotes: Math.max(0, Number(row.reward_practice_notes ?? 0)),
          isRead: Boolean(state?.read_at),
          readAt: state?.read_at ?? null,
          isClaimed: Boolean(state?.claimed_at),
          claimedAt: state?.claimed_at ?? null,
          deletedAt: state?.deleted_at ?? null,
        };
      });

      const visibleMapped = mapped.filter((item) => !item.deletedAt);
      setItems(visibleMapped);
      const unreadCount = visibleMapped.filter((item) => !item.isRead).length;
      onUnreadCountChange?.(unreadCount);

      const nextSelected =
        keepSelectedId && visibleMapped.some((item) => item.id === keepSelectedId)
          ? keepSelectedId
          : visibleMapped[0]?.id ?? null;
      setSelectedId(nextSelected);
    } catch (error) {
      console.error('Failed to load mailbox:', error);
      showToast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadMailbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId, language]);

  const unreadItems = items.filter((item) => !item.isRead);
  const readItems = items.filter((item) => item.isRead);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const isReadItemClaimable = (item: MailItem) =>
    (item.rewardPencils > 0 || item.rewardPracticeNotes > 0) && !item.isClaimed;
  const readDeletableItems = readItems.filter((item) => !isReadItemClaimable(item));
  const readProtectedCount = readItems.length - readDeletableItems.length;

  const markAsRead = async (item: MailItem) => {
    if (!userId || item.isRead) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from('announcement_user_states')
        .upsert(
          [{
            announcement_id: item.id,
            user_id: userId,
            occurrence_date: item.occurrenceDate,
            read_at: nowIso,
          }],
          { onConflict: 'announcement_id,user_id,occurrence_date' }
        );
      if (error) throw error;

      let nextUnreadCount = 0;
      setItems((prev) => {
        const next = prev.map((row) =>
          row.id === item.id
            ? { ...row, isRead: true, readAt: row.readAt ?? nowIso }
            : row
        );
        nextUnreadCount = next.filter((row) => !row.isRead).length;
        return next;
      });
      onUnreadCountChange?.(nextUnreadCount);
    } catch (error) {
      console.error('Failed to mark mailbox read:', error);
    }
  };

  const handleSelect = async (item: MailItem) => {
    setSelectedId(item.id);
    await markAsRead(item);
  };

  const handleClaim = async () => {
    if (!selected) return;
    if (!userId) {
      onClose();
      onRequireLogin();
      return;
    }
    if (selected.isClaimed) return;
    if (selected.rewardPencils <= 0 && selected.rewardPracticeNotes <= 0) return;

    setClaiming(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc('claim_announcement_reward', { p_announcement_id: selected.id, p_occurrence_date: selected.occurrenceDate });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const addedPencils = Math.max(0, Number(row?.pencils_added ?? 0));
      const addedNotes = Math.max(0, Number(row?.practice_notes_added ?? 0));
      showToast(
        t('mailbox.claimSuccess', '보상을 수령했습니다. (+{{pencils}} 연필, +{{notes}} 연습노트)', {
          pencils: addedPencils,
          notes: addedNotes,
        }),
        'success'
      );

      await onClaimed();
      await loadMailbox(selected.id);
    } catch (error: any) {
      console.error('Failed to claim mailbox reward:', error);
      const rawMessage = String(error?.message || '');
      if (isPencilsFullClaimError(rawMessage)) {
        showToast(
          t('mailbox.claimBlockedPencilsFull', '연필이 5개 이상이면 수령할 수 없습니다. 먼저 연필을 사용해 주세요.'),
          'info'
        );
      } else {
        showToast(rawMessage || t('common.error'), 'error');
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleDeleteUnread = async (item: MailItem) => {
    if (!userId || item.isRead) return;
    if (isReadItemClaimable(item)) {
      showToast(
        t('mailbox.deleteBlockedByClaimable', '수령 가능한 보상이 있는 우편은 삭제할 수 없습니다.'),
        'info'
      );
      return;
    }
    setDeletingUnreadId(item.id);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase as any)
        .from('announcement_user_states')
        .upsert(
          [{
            announcement_id: item.id,
            user_id: userId,
            occurrence_date: item.occurrenceDate,
            deleted_at: nowIso,
          }],
          { onConflict: 'announcement_id,user_id,occurrence_date' }
        );
      if (error) throw error;
      showToast(t('mailbox.deleteUnreadSuccess', '안읽은 우편을 삭제했습니다.'), 'success');
      await loadMailbox(selectedId);
    } catch (error: any) {
      console.error('Failed to delete unread mailbox item:', error);
      showToast(error?.message || t('common.error'), 'error');
    } finally {
      setDeletingUnreadId(null);
    }
  };

  const handleDeleteAllRead = async () => {
    if (!userId) return;
    if (readItems.length === 0) return;
    if (readDeletableItems.length === 0) {
      showToast(
        readProtectedCount > 0
          ? t('mailbox.deleteReadAllBlockedByClaimable', '수령 가능한 보상이 있는 읽은 우편은 삭제할 수 없습니다.')
          : t('mailbox.empty', '우편이 없습니다.'),
        'info'
      );
      return;
    }

    setDeletingReadAll(true);
    try {
      const nowIso = new Date().toISOString();
      const rows = readDeletableItems.map((item) => ({
        announcement_id: item.id,
        user_id: userId,
        occurrence_date: item.occurrenceDate,
        deleted_at: nowIso,
      }));
      const { error } = await (supabase as any)
        .from('announcement_user_states')
        .upsert(rows, { onConflict: 'announcement_id,user_id,occurrence_date' });
      if (error) throw error;

      showToast(
        t('mailbox.deleteReadAllSuccess', '읽은 우편 {{count}}개를 삭제했습니다.', { count: readDeletableItems.length }),
        'success'
      );
      if (readProtectedCount > 0) {
        showToast(
          t('mailbox.deleteReadAllSkippedClaimable', '수령 가능한 보상이 있는 {{count}}개 우편은 유지됩니다.', { count: readProtectedCount }),
          'info'
        );
      }
      await loadMailbox(selectedId);
    } catch (error: any) {
      console.error('Failed to delete all read mailbox items:', error);
      showToast(error?.message || t('common.error'), 'error');
    } finally {
      setDeletingReadAll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-4xl h-[min(78vh,680px)] rounded-3xl border border-cyan-400/30 bg-slate-50 dark:bg-gray-900/95 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{t('mailbox.title', '우편함')}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr]">
          <div className="border-r border-white/10 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {loading && (
                <div className="text-xs text-slate-500 dark:text-gray-400 p-2">{t('common.loading')}</div>
              )}

              {!loading && (
                <>
                  <div>
                    <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                      {t('mailbox.unread', '안읽은 우편')} ({unreadItems.length})
                    </div>
                    {unreadItems.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-gray-400 p-2">{t('mailbox.emptyUnread', '안읽은 우편이 없습니다.')}</div>
                    ) : unreadItems.map((item) => (
                      <div
                        key={`unread-${item.id}-${item.occurrenceDate}`}
                        className={`w-full rounded-xl border p-2.5 mb-2 transition-colors ${selectedId === item.id
                          ? 'border-cyan-300 bg-cyan-500/15'
                          : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { void handleSelect(item); }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-start gap-2">
                              <Mail className="w-4 h-4 mt-0.5 text-cyan-300 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title || t('mailbox.untitled', '제목 없음')}</div>
                                <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">{formatDate(item.startsAt || item.createdAt)}</div>
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => { void handleDeleteUnread(item); }}
                            disabled={deletingUnreadId === item.id || isReadItemClaimable(item)}
                            className="rounded-lg border border-red-300/30 bg-red-500/15 p-2 text-red-300 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={t('mailbox.deleteUnread', '삭제')}
                            aria-label={t('mailbox.deleteUnread', '삭제')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="px-2 pb-2 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                        {t('mailbox.read', '읽은 우편')} ({readItems.length})
                      </div>
                      <button
                        onClick={() => { void handleDeleteAllRead(); }}
                        disabled={deletingReadAll || readItems.length === 0}
                        className="rounded-lg border border-white/20 bg-slate-900/50 px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-800/70 disabled:opacity-40"
                      >
                        {deletingReadAll
                          ? t('common.loading')
                          : t('mailbox.deleteReadAll', '읽은 우편 전체 삭제')}
                      </button>
                    </div>
                    {readItems.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-gray-400 p-2">{t('mailbox.emptyRead', '읽은 우편이 없습니다.')}</div>
                    ) : readItems.map((item) => (
                      <button
                        key={`read-${item.id}-${item.occurrenceDate}`}
                        onClick={() => { void handleSelect(item); }}
                        className={`w-full rounded-xl border p-3 mb-2 text-left transition-colors ${selectedId === item.id
                          ? 'border-cyan-300 bg-cyan-500/15'
                          : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60'
                          }`}
                      >
                        <div className="flex items-start gap-2">
                          <MailOpen className="w-4 h-4 mt-0.5 text-slate-500 dark:text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title || t('mailbox.untitled', '제목 없음')}</div>
                            <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">{formatDate(item.startsAt || item.createdAt)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-h-0 p-5 overflow-y-auto">
            {!selected && (
              <div className="h-full flex items-center justify-center text-slate-500 dark:text-gray-400 text-sm">
                {t('mailbox.selectHint', '우편을 선택해 주세요.')}
              </div>
            )}

            {selected && (
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{selected.title || t('mailbox.untitled', '제목 없음')}</h3>
                <div className="text-xs text-slate-500 dark:text-gray-400">{formatDate(selected.startsAt || selected.createdAt)}</div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm leading-relaxed text-slate-700 dark:text-gray-200 whitespace-pre-wrap">
                  {selected.content || t('mailbox.noContent', '내용이 없습니다.')}
                </div>

                {(selected.rewardPencils > 0 || selected.rewardPracticeNotes > 0) && (
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-2 text-emerald-200 font-bold text-sm mb-2">
                      <Gift className="w-4 h-4" />
                      {t('mailbox.rewardTitle', '수령 가능한 보상')}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {selected.rewardPencils > 0 && (
                        <span className="rounded-full px-3 py-1 bg-yellow-500/20 border border-yellow-300/30 text-yellow-200">
                          {t('mailbox.rewardPencils', '연필 +{{count}}', { count: selected.rewardPencils })}
                        </span>
                      )}
                      {selected.rewardPracticeNotes > 0 && (
                        <span className="rounded-full px-3 py-1 bg-cyan-500/20 border border-cyan-300/30 text-cyan-200">
                          {t('mailbox.rewardPracticeNotes', '연습노트 +{{count}}', { count: selected.rewardPracticeNotes })}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  {(selected.rewardPencils > 0 || selected.rewardPracticeNotes > 0) && (
                    <button
                      onClick={() => { void handleClaim(); }}
                      disabled={selected.isClaimed || claiming}
                      className={`rounded-xl px-4 py-2 font-bold transition-colors ${selected.isClaimed
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                        }`}
                    >
                      {selected.isClaimed
                        ? t('mailbox.claimed', '수령 완료')
                        : claiming
                          ? t('common.loading')
                          : t('mailbox.claim', '수령')}
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 font-semibold border border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-white dark:bg-gray-800"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MailboxModal;
