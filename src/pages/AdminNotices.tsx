import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';

type SupportedNoticeLocale = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant';

type TranslationInput = {
  title: string;
  content: string;
};

type MailType = 'announcement' | 'mail';
type TargetType = 'all' | 'user';
type RecurrenceType = 'daily' | null;

type NoticeRow = {
  id: number;
  is_active: boolean;
  mail_type: MailType;
  target_type: TargetType;
  target_user_id: string | null;
  is_recurring: boolean;
  recurrence_type: RecurrenceType;
  recurrence_until: string | null;
  daily_send_time: string;
  starts_at: string;
  ends_at: string | null;
  reward_pencils: number;
  reward_practice_notes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  translations: Record<SupportedNoticeLocale, TranslationInput>;
};

const NOTICE_LOCALES: { code: SupportedNoticeLocale; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
];

const toDatetimeLocal = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIsoOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const cloneEmptyTranslations = (): Record<SupportedNoticeLocale, TranslationInput> => ({
  ko: { title: '', content: '' },
  en: { title: '', content: '' },
  ja: { title: '', content: '' },
  'zh-Hans': { title: '', content: '' },
  'zh-Hant': { title: '', content: '' },
});

const collectTranslationPayload = (translations: Record<SupportedNoticeLocale, TranslationInput>, announcementId: number) => {
  return NOTICE_LOCALES
    .map(({ code }) => {
      const item = translations[code];
      return {
        locale: code,
        title: item.title.trim(),
        content: item.content.trim(),
      };
    })
    .filter((item) => item.title && item.content)
    .map((item) => ({
      announcement_id: announcementId,
      locale: item.locale,
      title: item.title,
      content: item.content,
    }));
};

const AdminNotices = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { playSound } = useSound();
  const { showToast } = useUI();

  const [rows, setRows] = useState<NoticeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<number, boolean>>({});
  const [deletingKeys, setDeletingKeys] = useState<Record<number, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newActive, setNewActive] = useState(true);
  const [newMailType, setNewMailType] = useState<MailType>('announcement');
  const [newTargetType, setNewTargetType] = useState<TargetType>('all');
  const [newTargetUserId, setNewTargetUserId] = useState('');
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurrenceUntil, setNewRecurrenceUntil] = useState('');
  const [newDailySendTime, setNewDailySendTime] = useState('09:00');
  const [newStartsAt, setNewStartsAt] = useState('');
  const [newEndsAt, setNewEndsAt] = useState('');
  const [newRewardPencils, setNewRewardPencils] = useState(0);
  const [newRewardPracticeNotes, setNewRewardPracticeNotes] = useState(0);
  const [newTranslations, setNewTranslations] = useState<Record<SupportedNoticeLocale, TranslationInput>>(cloneEmptyTranslations());
  const [createLocaleTab, setCreateLocaleTab] = useState<SupportedNoticeLocale>('ko');
  const [editLocaleTab, setEditLocaleTab] = useState<Record<number, SupportedNoticeLocale>>({});

  const appRole = (user?.app_metadata as any)?.role;
  const profileRole = (profile as any)?.role;
  const isAdmin = appRole === 'admin' || profileRole === 'admin';

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [rows]
  );

  const loadRows = async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const { data: announcements, error: announcementError } = await (supabase as any)
        .from('announcements')
        .select('id, is_active, mail_type, target_type, target_user_id, is_recurring, recurrence_type, recurrence_until, daily_send_time, starts_at, ends_at, reward_pencils, reward_practice_notes, created_by, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (announcementError) throw announcementError;

      const ids: number[] = (announcements || []).map((row: any) => Number(row.id));

      const translationMap = new Map<number, Record<SupportedNoticeLocale, TranslationInput>>();
      ids.forEach((id) => translationMap.set(id, cloneEmptyTranslations()));

      if (ids.length > 0) {
        const { data: translations, error: translationError } = await (supabase as any)
          .from('announcement_translations')
          .select('announcement_id, locale, title, content')
          .in('announcement_id', ids);

        if (translationError) throw translationError;

        (translations || []).forEach((row: any) => {
          const announcementId = Number(row.announcement_id);
          const locale = String(row.locale) as SupportedNoticeLocale;
          if (!NOTICE_LOCALES.some((item) => item.code === locale)) return;

          const existing = translationMap.get(announcementId) ?? cloneEmptyTranslations();
          existing[locale] = {
            title: String(row.title ?? ''),
            content: String(row.content ?? ''),
          };
          translationMap.set(announcementId, existing);
        });
      }

      const mapped = (announcements || []).map((row: any) => ({
        id: Number(row.id),
        is_active: Boolean(row.is_active),
        mail_type: String(row.mail_type ?? 'announcement') === 'mail' ? 'mail' : 'announcement',
        target_type: String(row.target_type ?? 'all') === 'user' ? 'user' : 'all',
        target_user_id: row.target_user_id ? String(row.target_user_id) : null,
        is_recurring: Boolean(row.is_recurring),
        recurrence_type: String(row.recurrence_type ?? '') === 'daily' ? 'daily' : null,
        recurrence_until: row.recurrence_until ? String(row.recurrence_until) : null,
        daily_send_time: String(row.daily_send_time ?? '00:00:00').slice(0, 5),
        starts_at: String(row.starts_at ?? new Date().toISOString()),
        ends_at: row.ends_at ? String(row.ends_at) : null,
        reward_pencils: Math.max(0, Number(row.reward_pencils ?? 0)),
        reward_practice_notes: Math.max(0, Number(row.reward_practice_notes ?? 0)),
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: String(row.created_at ?? new Date().toISOString()),
        updated_at: String(row.updated_at ?? new Date().toISOString()),
        translations: translationMap.get(Number(row.id)) ?? cloneEmptyTranslations(),
      })) as NoticeRow[];

      setRows(mapped);
    } catch (error) {
      console.error('Failed to load announcements:', error);
      showToast('공지사항 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate('/', { replace: true });
      return;
    }
    loadRows();
  }, [loading, user, isAdmin, navigate]);

  const patchRow = (id: number, patch: Partial<NoticeRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const patchRowTranslation = (id: number, locale: SupportedNoticeLocale, patch: Partial<TranslationInput>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          translations: {
            ...row.translations,
            [locale]: {
              ...row.translations[locale],
              ...patch,
            },
          },
        };
      })
    );
  };

  const updateNewTranslation = (locale: SupportedNoticeLocale, patch: Partial<TranslationInput>) => {
    setNewTranslations((prev) => ({
      ...prev,
      [locale]: {
        ...prev[locale],
        ...patch,
      },
    }));
  };

  const saveRow = async (row: NoticeRow) => {
    const startsAtIso = toIsoOrNull(toDatetimeLocal(row.starts_at));
    const endsAtIso = toIsoOrNull(toDatetimeLocal(row.ends_at ?? ''));
    const recurrenceUntilIso = toIsoOrNull(toDatetimeLocal(row.recurrence_until ?? ''));

    if (!startsAtIso) {
      showToast('시작 시각이 올바르지 않습니다.', 'error');
      return;
    }
    if (endsAtIso && endsAtIso < startsAtIso) {
      showToast('종료 시각은 시작 시각 이후여야 합니다.', 'error');
      return;
    }
    if (recurrenceUntilIso && recurrenceUntilIso < startsAtIso) {
      showToast('반복 종료 시각은 시작 시각 이후여야 합니다.', 'error');
      return;
    }
    if (row.target_type === 'user' && !row.target_user_id) {
      showToast('개별 우편은 대상 유저 ID가 필요합니다.', 'error');
      return;
    }

    const koTitle = row.translations.ko.title.trim();
    const koContent = row.translations.ko.content.trim();
    if (!koTitle || !koContent) {
      showToast('한국어(ko) 제목/내용은 필수입니다.', 'info');
      return;
    }

    const translationPayload = collectTranslationPayload(row.translations, row.id);
    const rewardPencils = Math.max(0, Number(row.reward_pencils || 0));
    const rewardPracticeNotes = Math.max(0, Number(row.reward_practice_notes || 0));

    setSavingKeys((prev) => ({ ...prev, [row.id]: true }));
    try {
      const { error: announcementError } = await (supabase as any)
        .from('announcements')
        .update({
          is_active: row.is_active,
          mail_type: row.mail_type,
          target_type: row.target_type,
          target_user_id: row.target_type === 'user' ? row.target_user_id : null,
          is_recurring: row.is_recurring,
          recurrence_type: row.is_recurring ? 'daily' : null,
          recurrence_until: row.is_recurring ? recurrenceUntilIso : null,
          daily_send_time: row.is_recurring ? `${row.daily_send_time || '00:00'}:00` : '00:00:00',
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          reward_pencils: rewardPencils,
          reward_practice_notes: rewardPracticeNotes,
          title: koTitle,
          content: koContent,
        })
        .eq('id', row.id);
      if (announcementError) throw announcementError;

      const { error: upsertError } = await (supabase as any)
        .from('announcement_translations')
        .upsert(translationPayload, { onConflict: 'announcement_id,locale' });
      if (upsertError) throw upsertError;

      const localesWithContent = new Set(
        NOTICE_LOCALES
          .filter(({ code }) => {
            const entry = row.translations[code];
            return entry.title.trim() && entry.content.trim();
          })
          .map(({ code }) => code)
      );

      const deleteLocales = NOTICE_LOCALES
        .filter(({ code }) => !localesWithContent.has(code))
        .map(({ code }) => code);

      if (deleteLocales.length > 0) {
        const { error: deleteError } = await (supabase as any)
          .from('announcement_translations')
          .delete()
          .eq('announcement_id', row.id)
          .in('locale', deleteLocales);
        if (deleteError) throw deleteError;
      }

      showToast('공지사항이 저장되었습니다.', 'success');
      await loadRows(true);
    } catch (error) {
      console.error('Failed to save announcement:', error);
      showToast('공지사항 저장에 실패했습니다.', 'error');
    } finally {
      setSavingKeys((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  const createNotice = async () => {
    const startsAtIso = toIsoOrNull(newStartsAt) || new Date().toISOString();
    const endsAtIso = toIsoOrNull(newEndsAt);
    const recurrenceUntilIso = toIsoOrNull(newRecurrenceUntil);

    if (endsAtIso && endsAtIso < startsAtIso) {
      showToast('종료 시각은 시작 시각 이후여야 합니다.', 'error');
      return;
    }
    if (recurrenceUntilIso && recurrenceUntilIso < startsAtIso) {
      showToast('반복 종료 시각은 시작 시각 이후여야 합니다.', 'error');
      return;
    }
    if (newTargetType === 'user' && !newTargetUserId.trim()) {
      showToast('개별 우편은 대상 유저 ID가 필요합니다.', 'error');
      return;
    }

    const koTitle = newTranslations.ko.title.trim();
    const koContent = newTranslations.ko.content.trim();
    if (!koTitle || !koContent) {
      showToast('한국어(ko) 제목/내용은 필수입니다.', 'info');
      return;
    }

    setIsCreating(true);
    try {
      const { data: inserted, error: insertError } = await (supabase as any)
        .from('announcements')
        .insert({
          is_active: newActive,
          mail_type: newMailType,
          target_type: newTargetType,
          target_user_id: newTargetType === 'user' ? newTargetUserId.trim() : null,
          is_recurring: newIsRecurring,
          recurrence_type: newIsRecurring ? 'daily' : null,
          recurrence_until: newIsRecurring ? recurrenceUntilIso : null,
          daily_send_time: newIsRecurring ? `${newDailySendTime || '00:00'}:00` : '00:00:00',
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          reward_pencils: Math.max(0, Number(newRewardPencils || 0)),
          reward_practice_notes: Math.max(0, Number(newRewardPracticeNotes || 0)),
          created_by: user?.id ?? null,
          title: koTitle,
          content: koContent,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      const announcementId = Number(inserted.id);
      const translationPayload = collectTranslationPayload(newTranslations, announcementId);

      if (translationPayload.length > 0) {
        const { error: translationError } = await (supabase as any)
          .from('announcement_translations')
          .insert(translationPayload);
        if (translationError) throw translationError;
      }

      setNewActive(true);
      setNewMailType('announcement');
      setNewTargetType('all');
      setNewTargetUserId('');
      setNewIsRecurring(false);
      setNewRecurrenceUntil('');
      setNewDailySendTime('09:00');
      setNewStartsAt('');
      setNewEndsAt('');
      setNewRewardPencils(0);
      setNewRewardPracticeNotes(0);
      setNewTranslations(cloneEmptyTranslations());
      setCreateLocaleTab('ko');

      showToast('공지사항이 등록되었습니다.', 'success');
      await loadRows(true);
    } catch (error) {
      console.error('Failed to create announcement:', error);
      showToast('공지사항 등록에 실패했습니다.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteNotice = async (row: NoticeRow) => {
    const title = row.translations.ko.title.trim() || row.translations.en.title.trim() || `#${row.id}`;
    const confirmed = window.confirm(`공지사항 "${title}"을(를) 삭제하시겠습니까?`);
    if (!confirmed) return;

    setDeletingKeys((prev) => ({ ...prev, [row.id]: true }));
    try {
      const { error } = await (supabase as any)
        .from('announcements')
        .delete()
        .eq('id', row.id);
      if (error) throw error;

      showToast('공지사항이 삭제되었습니다.', 'success');
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      showToast('공지사항 삭제에 실패했습니다.', 'error');
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [row.id]: false }));
    }
  };

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white overflow-hidden flex flex-col">
      <header className="w-full flex-none z-20 px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => {
              playSound('click');
              navigate('/admin');
            }}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40"
          >
            Back
          </button>
          <button
            onClick={() => {
              playSound('click');
              loadRows(true);
            }}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-6">
            <div className="mb-3 flex items-center gap-2 text-cyan-300">
              <Megaphone className="h-5 w-5" />
              <h1 className="text-xl font-bold">공지사항 관리</h1>
            </div>
            <p className="text-sm text-white/80">홈 진입 시 표시되는 공지사항을 언어별로 관리합니다.</p>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white/90 mb-3">새 공지 등록</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={(e) => setNewActive(e.target.checked)}
                  className="h-4 w-4"
                />
                활성화
              </label>
              <div className="space-y-1">
                <div className="text-xs text-white/60">우편 타입</div>
                <select
                  value={newMailType}
                  onChange={(e) => setNewMailType(e.target.value as MailType)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                >
                  <option value="announcement">공지사항</option>
                  <option value="mail">일반 우편</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">발송 대상</div>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as TargetType)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                >
                  <option value="all">전체 발송</option>
                  <option value="user">개별 발송</option>
                </select>
              </div>
              {newTargetType === 'user' && (
                <div className="space-y-1 md:col-span-2">
                  <div className="text-xs text-white/60">대상 유저 UUID</div>
                  <input
                    type="text"
                    value={newTargetUserId}
                    onChange={(e) => setNewTargetUserId(e.target.value)}
                    placeholder="대상 유저 UUID"
                    className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                  />
                </div>
              )}
              <label className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={newIsRecurring}
                  onChange={(e) => setNewIsRecurring(e.target.checked)}
                  className="h-4 w-4"
                />
                반복 우편(매일)
              </label>
              {newIsRecurring && (
                <div className="space-y-1">
                  <div className="text-xs text-white/60">매일 발송 시각</div>
                  <input
                    type="time"
                    value={newDailySendTime}
                    onChange={(e) => setNewDailySendTime(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                  />
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs text-white/60">시작 시각</div>
                <input
                  type="datetime-local"
                  value={newStartsAt}
                  onChange={(e) => setNewStartsAt(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">종료 시각(선택)</div>
                <input
                  type="datetime-local"
                  value={newEndsAt}
                  onChange={(e) => setNewEndsAt(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
              </div>
              {newIsRecurring && (
                <div className="space-y-1 md:col-span-2">
                  <div className="text-xs text-white/60">반복 종료 시각(선택)</div>
                  <input
                    type="datetime-local"
                    value={newRecurrenceUntil}
                    onChange={(e) => setNewRecurrenceUntil(e.target.value)}
                    placeholder="반복 종료 시각"
                    className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                  />
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs text-white/60">연필 보상 수량</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newRewardPencils}
                  onChange={(e) => setNewRewardPencils(Math.max(0, Number(e.target.value || 0)))}
                  placeholder="연필 보상 수량"
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-white/60">연습노트 보상 수량</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newRewardPracticeNotes}
                  onChange={(e) => setNewRewardPracticeNotes(Math.max(0, Number(e.target.value || 0)))}
                  placeholder="연습노트 보상 수량"
                  className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {NOTICE_LOCALES.map((locale) => (
                <button
                  key={`create-${locale.code}`}
                  onClick={() => setCreateLocaleTab(locale.code)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                    createLocaleTab === locale.code
                      ? 'border-cyan-300 bg-cyan-500/25 text-cyan-100'
                      : 'border-white/20 bg-slate-900/50 text-white/70'
                  }`}
                >
                  {locale.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={newTranslations[createLocaleTab].title}
              onChange={(e) => updateNewTranslation(createLocaleTab, { title: e.target.value })}
              placeholder={`${createLocaleTab} 제목`}
              className="mt-3 w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
            />
            <textarea
              value={newTranslations[createLocaleTab].content}
              onChange={(e) => updateNewTranslation(createLocaleTab, { content: e.target.value })}
              placeholder={`${createLocaleTab} 내용`}
              rows={4}
              className="mt-3 w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300 resize-y"
            />
            <p className="mt-2 text-xs text-amber-200">필수: 한국어(ko) 제목/내용</p>

            <div className="mt-3 flex justify-end">
              <button
                onClick={createNotice}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-cyan-400 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                등록
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 pb-6">
            {isLoading && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">로딩 중...</div>
            )}

            {!isLoading && sortedRows.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">등록된 공지사항이 없습니다.</div>
            )}

            {!isLoading &&
              sortedRows.map((row) => {
                const isSaving = Boolean(savingKeys[row.id]);
                const isDeleting = Boolean(deletingKeys[row.id]);
                const selectedLocale = editLocaleTab[row.id] ?? 'ko';

                return (
                  <div key={row.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.is_active}
                          onChange={(e) => patchRow(row.id, { is_active: e.target.checked })}
                          className="h-4 w-4"
                        />
                        활성화
                      </label>
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">우편 타입</div>
                        <select
                          value={row.mail_type}
                          onChange={(e) => patchRow(row.id, { mail_type: e.target.value as MailType })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        >
                          <option value="announcement">공지사항</option>
                          <option value="mail">일반 우편</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">발송 대상</div>
                        <select
                          value={row.target_type}
                          onChange={(e) => patchRow(row.id, { target_type: e.target.value as TargetType })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        >
                          <option value="all">전체 발송</option>
                          <option value="user">개별 발송</option>
                        </select>
                      </div>
                      {row.target_type === 'user' && (
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs text-white/60">대상 유저 UUID</div>
                          <input
                            type="text"
                            value={row.target_user_id ?? ''}
                            onChange={(e) => patchRow(row.id, { target_user_id: e.target.value })}
                            placeholder="대상 유저 UUID"
                            className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                          />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={row.is_recurring}
                          onChange={(e) => patchRow(row.id, { is_recurring: e.target.checked, recurrence_type: e.target.checked ? 'daily' : null })}
                          className="h-4 w-4"
                        />
                        반복 우편(매일)
                      </label>
                      {row.is_recurring && (
                        <div className="space-y-1">
                          <div className="text-xs text-white/60">매일 발송 시각</div>
                          <input
                            type="time"
                            value={row.daily_send_time}
                            onChange={(e) => patchRow(row.id, { daily_send_time: e.target.value })}
                            className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">시작 시각</div>
                        <input
                          type="datetime-local"
                          value={toDatetimeLocal(row.starts_at)}
                          onChange={(e) => patchRow(row.id, { starts_at: toIsoOrNull(e.target.value) || row.starts_at })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">종료 시각(선택)</div>
                        <input
                          type="datetime-local"
                          value={toDatetimeLocal(row.ends_at)}
                          onChange={(e) => patchRow(row.id, { ends_at: toIsoOrNull(e.target.value) })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        />
                      </div>
                      {row.is_recurring && (
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs text-white/60">반복 종료 시각(선택)</div>
                          <input
                            type="datetime-local"
                            value={toDatetimeLocal(row.recurrence_until)}
                            onChange={(e) => patchRow(row.id, { recurrence_until: toIsoOrNull(e.target.value) })}
                            placeholder="반복 종료 시각"
                            className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">연필 보상 수량</div>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={row.reward_pencils}
                          onChange={(e) => patchRow(row.id, { reward_pencils: Math.max(0, Number(e.target.value || 0)) })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-white/60">연습노트 보상 수량</div>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={row.reward_practice_notes}
                          onChange={(e) => patchRow(row.id, { reward_practice_notes: Math.max(0, Number(e.target.value || 0)) })}
                          className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {NOTICE_LOCALES.map((locale) => (
                        <button
                          key={`${row.id}-${locale.code}`}
                          onClick={() => setEditLocaleTab((prev) => ({ ...prev, [row.id]: locale.code }))}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
                            selectedLocale === locale.code
                              ? 'border-cyan-300 bg-cyan-500/25 text-cyan-100'
                              : 'border-white/20 bg-slate-900/50 text-white/70'
                          }`}
                        >
                          {locale.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={row.translations[selectedLocale].title}
                      onChange={(e) => patchRowTranslation(row.id, selectedLocale, { title: e.target.value })}
                      placeholder={`${selectedLocale} 제목`}
                      className="mt-3 w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                    />
                    <textarea
                      value={row.translations[selectedLocale].content}
                      onChange={(e) => patchRowTranslation(row.id, selectedLocale, { content: e.target.value })}
                      rows={4}
                      placeholder={`${selectedLocale} 내용`}
                      className="mt-3 w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm outline-none focus:border-cyan-300 resize-y"
                    />

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-white/50">
                      <span>생성: {new Date(row.created_at).toLocaleString()}</span>
                      <span>수정: {new Date(row.updated_at).toLocaleString()}</span>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => deleteNotice(row)}
                        disabled={isDeleting}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </button>
                      <button
                        onClick={() => saveRow(row)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-cyan-400 disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        저장
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminNotices;
