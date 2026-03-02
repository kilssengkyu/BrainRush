import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, Shield, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { supabase } from '../lib/supabaseClient';
import { useUI } from '../contexts/UIContext';

type MemberProfile = {
  id: string;
  nickname: string | null;
  country: string | null;
  mmr: number | null;
  level: number;
  avatar_url: string | null;
  created_at: string | null;
  last_seen: string | null;
  needs_nickname_setup: boolean;
  report_count: number;
  member_role: 'admin' | 'user';
  banned_until: string | null;
};

type MemberReport = {
  id: string;
  session_id: string | null;
  reason: string;
  created_at: string;
  reporter_id: string;
  reporter_nickname: string | null;
};

type SortBy = 'created_at' | 'last_seen' | 'mmr' | 'level' | 'nickname' | 'report_count';
type SortOrder = 'asc' | 'desc';
const PAGE_SIZE = 50;

const AdminMember = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { playSound } = useSound();
  const { showToast } = useUI();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [selectedMember, setSelectedMember] = useState<MemberProfile | null>(null);
  const [memberReports, setMemberReports] = useState<MemberReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [modRole, setModRole] = useState<'user' | 'admin'>('user');
  const [modBanOption, setModBanOption] = useState<'keep' | 'clear' | '1d' | '3d' | '7d' | '30d' | 'permanent'>('keep');
  const [isApplyingModeration, setIsApplyingModeration] = useState(false);

  const appRole = (user?.app_metadata as any)?.role;
  const profileRole = (profile as any)?.role;
  const isAdmin = appRole === 'admin' || profileRole === 'admin';

  const loadMembers = async (page = currentPage) => {
    setIsLoadingMembers(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_members', {
        p_search: search.trim() || null,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE
      });

      if (error) throw error;
      const mapped = ((data || []) as any[]).map((row) => ({
        ...row,
        report_count: Number(row.report_count || 0),
        member_role: row.member_role === 'admin' ? 'admin' : 'user',
        banned_until: row.banned_until || null
      })) as MemberProfile[];
      setMembers(mapped);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (error) {
      console.error('Admin members load error:', error);
      showToast('회원 목록 조회 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const loadMemberReports = async (memberId: string) => {
    setIsLoadingReports(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_member_reports', {
        p_reported_user_id: memberId,
        p_limit: 200,
        p_offset: 0
      });
      if (error) throw error;
      setMemberReports((data || []) as MemberReport[]);
    } catch (error) {
      console.error('Admin member reports load error:', error);
      showToast('신고 사유 조회 중 오류가 발생했습니다.', 'error');
      setMemberReports([]);
    } finally {
      setIsLoadingReports(false);
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
    }
  }, [loading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      loadMembers();
    }
  }, [loading, user, isAdmin, sortBy, sortOrder, currentPage]);

  const filteredMembers = useMemo(() => members, [members]);

  const formatDateTime = (value: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  const closeDetail = () => {
    setSelectedMember(null);
    setMemberReports([]);
  };

  const isPermanentBan = (value: string | null) => {
    if (!value) return false;
    return new Date(value).getFullYear() >= 9999;
  };

  const getBanStatusText = (value: string | null) => {
    if (!value) return '정지 없음';
    if (isPermanentBan(value)) return '영구정지';
    return `정지 만료: ${formatDateTime(value)}`;
  };

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white overflow-hidden flex flex-col">
      <header className="w-full flex-none z-20 px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => {
              playSound('click');
              navigate('/admin');
            }}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40"
          >
            Back
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-6">
            <div className="mb-3 flex items-center gap-2 text-cyan-300">
              <Shield className="h-5 w-5" />
              <h1 className="text-xl font-bold">회원관리</h1>
            </div>
            <p className="text-sm text-white/80">회원을 클릭하면 상세 정보와 신고 사유를 확인할 수 있습니다.</p>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      playSound('click');
                      setCurrentPage(0);
                      loadMembers(0);
                    }
                  }}
                  placeholder="닉네임 / 이메일 / UID 검색"
                  className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-400/60"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as SortBy);
                    setCurrentPage(0);
                  }}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="created_at">가입일</option>
                  <option value="last_seen">최근접속</option>
                  <option value="report_count">신고횟수</option>
                  <option value="mmr">MMR</option>
                  <option value="level">레벨</option>
                  <option value="nickname">닉네임</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value as SortOrder);
                    setCurrentPage(0);
                  }}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="desc">내림차순</option>
                  <option value="asc">오름차순</option>
                </select>
              </div>
              <button
                onClick={() => {
                  playSound('click');
                  loadMembers();
                }}
                disabled={isLoadingMembers}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            </div>
            <p className="mt-3 text-xs text-white/60">
              페이지 {currentPage + 1} / 현재 {filteredMembers.length}명 표시
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  if (currentPage === 0) return;
                  playSound('click');
                  setCurrentPage((p) => Math.max(0, p - 1));
                }}
                disabled={isLoadingMembers || currentPage === 0}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                이전
              </button>
              <button
                onClick={() => {
                  if (!hasMore) return;
                  playSound('click');
                  setCurrentPage((p) => p + 1);
                }}
                disabled={isLoadingMembers || !hasMore}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3 pb-6">
            {isLoadingMembers && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                회원 목록을 불러오는 중...
              </div>
            )}

            {!isLoadingMembers && filteredMembers.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                표시할 회원이 없습니다.
              </div>
            )}

            {!isLoadingMembers &&
              filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    playSound('click');
                    setSelectedMember(m);
                    setModRole(m.member_role || 'user');
                    setModBanOption('keep');
                    loadMemberReports(m.id);
                  }}
                  className="w-full text-left rounded-xl border border-white/10 bg-black/30 p-4 hover:border-cyan-400/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 overflow-hidden rounded-full border border-white/20 bg-white/10 flex-shrink-0">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.nickname || 'avatar'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-white/50">No Img</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-base font-bold text-white truncate">{m.nickname || '(닉네임 없음)'}</div>
                        <div className="text-xs text-cyan-300">MMR {m.mmr ?? 1000} / Lv {m.level ?? 1}</div>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-white/75 break-all">

                        <div>UID: {m.id}</div>
                        <div>Country: {m.country || '-'}</div>
                        <div>신고횟수: {m.report_count}</div>
                        <div>권한: {m.member_role === 'admin' ? '관리자' : '일반'}</div>
                        <div>정지상태: {getBanStatusText(m.banned_until)}</div>
                        <div>가입일: {formatDateTime(m.created_at)}</div>
                        <div>최근 접속: {formatDateTime(m.last_seen)}</div>
                        <div>닉네임 설정 필요: {m.needs_nickname_setup ? '예' : '아니오'}</div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </div>

      {selectedMember && (
        <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl max-h-[85dvh] overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-bold">회원 상세</h3>
              <button
                onClick={closeDetail}
                className="rounded-full p-2 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(85dvh-64px)] space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-white/20 bg-white/10 flex-shrink-0">
                    {selectedMember.avatar_url ? (
                      <img src={selectedMember.avatar_url} alt={selectedMember.nickname || 'avatar'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-white/50">No Img</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm text-white/85 space-y-1 break-all">
                    <div className="text-base font-bold text-white">{selectedMember.nickname || '(닉네임 없음)'}</div>

                    <div>UID: {selectedMember.id}</div>
                    <div>Country: {selectedMember.country || '-'}</div>
                    <div>MMR: {selectedMember.mmr ?? 1000}</div>
                    <div>Level: {selectedMember.level ?? 1}</div>
                    <div>신고횟수: {selectedMember.report_count}</div>
                    <div>권한: {selectedMember.member_role === 'admin' ? '관리자' : '일반'}</div>
                    <div>정지상태: {getBanStatusText(selectedMember.banned_until)}</div>
                    <div>가입일: {formatDateTime(selectedMember.created_at)}</div>
                    <div>최근 접속: {formatDateTime(selectedMember.last_seen)}</div>
                    <div>닉네임 설정 필요: {selectedMember.needs_nickname_setup ? '예' : '아니오'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                <h4 className="text-sm font-bold text-cyan-300 mb-3">관리자 제어</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-white/70 mb-1">권한</div>
                    <select
                      value={modRole}
                      onChange={(e) => setModRole((e.target.value as 'user' | 'admin'))}
                      className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none"
                    >
                      <option value="user">일반</option>
                      <option value="admin">관리자</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-white/70 mb-1">정지</div>
                    <select
                      value={modBanOption}
                      onChange={(e) => setModBanOption(e.target.value as any)}
                      className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none"
                    >
                      <option value="keep">변경 안함</option>
                      <option value="clear">정지 해제</option>
                      <option value="1d">1일 정지</option>
                      <option value="3d">3일 정지</option>
                      <option value="7d">7일 정지</option>
                      <option value="30d">30일 정지</option>
                      <option value="permanent">영구정지</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!selectedMember || isApplyingModeration) return;
                    setIsApplyingModeration(true);
                    try {
                      let p_ban_action: 'keep' | 'clear' | 'temporary' | 'permanent' = 'keep';
                      let p_ban_days: number | null = null;
                      if (modBanOption === 'clear') p_ban_action = 'clear';
                      else if (modBanOption === 'permanent') p_ban_action = 'permanent';
                      else if (modBanOption === '1d' || modBanOption === '3d' || modBanOption === '7d' || modBanOption === '30d') {
                        p_ban_action = 'temporary';
                        p_ban_days = Number(modBanOption.replace('d', ''));
                      }

                      const { data, error } = await supabase.rpc('admin_update_member_moderation', {
                        p_user_id: selectedMember.id,
                        p_role: modRole,
                        p_ban_action,
                        p_ban_days
                      });
                      if (error) throw error;

                      const updated = (data && data[0]) ? data[0] : null;
                      if (updated) {
                        const nextRole = updated.member_role === 'admin' ? 'admin' : 'user';
                        const nextBannedUntil = updated.banned_until || null;
                        setSelectedMember((prev) => prev ? { ...prev, member_role: nextRole, banned_until: nextBannedUntil } : prev);
                        setMembers((prev) => prev.map((m) => m.id === selectedMember.id
                          ? { ...m, member_role: nextRole, banned_until: nextBannedUntil }
                          : m
                        ));
                        setModRole(nextRole);
                        setModBanOption('keep');
                      }
                      showToast('회원 권한/정지 설정이 적용되었습니다.', 'success');
                    } catch (error: any) {
                      console.error('Moderation apply error:', error);
                      showToast(error?.message || '설정 적용 중 오류가 발생했습니다.', 'error');
                    } finally {
                      setIsApplyingModeration(false);
                    }
                  }}
                  disabled={isApplyingModeration}
                  className="mt-3 w-full rounded-lg bg-cyan-600/80 hover:bg-cyan-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {isApplyingModeration ? '적용 중...' : '설정 적용'}
                </button>
              </div>

              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
                <h4 className="text-sm font-bold text-red-300 mb-3">신고 사유 리스트</h4>
                {isLoadingReports && (
                  <div className="text-sm text-white/70">신고 사유를 불러오는 중...</div>
                )}
                {!isLoadingReports && memberReports.length === 0 && (
                  <div className="text-sm text-white/70">신고 사유가 없습니다.</div>
                )}
                {!isLoadingReports && memberReports.length > 0 && (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {memberReports.map((r) => (
                      <div key={r.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
                        <div className="text-sm text-white whitespace-pre-wrap break-words">{r.reason}</div>
                        <div className="mt-2 text-xs text-white/60 space-y-0.5">
                          <div>신고자: {r.reporter_nickname || '(알 수 없음)'}</div>
                          <div>신고시각: {formatDateTime(r.created_at)}</div>
                          <div>세션ID: {r.session_id || '-'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMember;
