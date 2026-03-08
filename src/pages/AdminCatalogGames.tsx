import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';

type GameCatalogRow = {
  game_type: string;
  is_enabled: boolean;
  use_in_rank: boolean;
  use_in_normal: boolean;
  use_in_practice: boolean;
  stat_speed: number;
  stat_memory: number;
  stat_judgment: number;
  stat_calculation: number;
  stat_accuracy: number;
  stat_observation: number;
  icon_url: string;
  updated_at: string | null;
};

const MAX_ICON_SIZE = 5 * 1024 * 1024;
const ALLOWED_ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const getCatalogStoragePath = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const marker = '/storage/v1/object/public/catalog-icons/';
  const idx = trimmed.indexOf(marker);
  if (idx < 0) return null;
  const path = trimmed.slice(idx + marker.length).split('?')[0];
  return path || null;
};

const AdminCatalogGames = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { playSound } = useSound();
  const { showToast } = useUI();

  const [rows, setRows] = useState<GameCatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});
  const [deletingKeys, setDeletingKeys] = useState<Record<string, boolean>>({});
  const [iconLoadFailed, setIconLoadFailed] = useState<Record<string, boolean>>({});
  const [hasIconColumn, setHasIconColumn] = useState(true);
  const [hasStatColumns, setHasStatColumns] = useState(true);

  const appRole = (user?.app_metadata as any)?.role;
  const profileRole = (profile as any)?.role;
  const isAdmin = appRole === 'admin' || profileRole === 'admin';

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.game_type.localeCompare(b.game_type)),
    [rows]
  );

  const loadRows = async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let data: any[] | null = null;
      let error: any = null;

      const withIcon = await (supabase as any)
        .from('game_catalog')
        .select('game_type, is_enabled, use_in_rank, use_in_normal, use_in_practice, icon_url, stat_speed, stat_memory, stat_judgment, stat_calculation, stat_accuracy, stat_observation, updated_at');

      data = withIcon.data;
      error = withIcon.error;

      if (error) {
        const withoutIcon = await (supabase as any)
          .from('game_catalog')
          .select('game_type, is_enabled, use_in_rank, use_in_normal, use_in_practice, updated_at');
        data = withoutIcon.data;
        error = withoutIcon.error;
        setHasIconColumn(!error);
        setHasStatColumns(!error);
      } else {
        setHasIconColumn(true);
        setHasStatColumns(true);
      }

      if (error) throw error;

      const mapped = (data || []).map((row: any) => ({
        game_type: String(row.game_type),
        is_enabled: !!row.is_enabled,
        use_in_rank: !!row.use_in_rank,
        use_in_normal: !!row.use_in_normal,
        use_in_practice: !!row.use_in_practice,
        stat_speed: Number(row.stat_speed || 0),
        stat_memory: Number(row.stat_memory || 0),
        stat_judgment: Number(row.stat_judgment || 0),
        stat_calculation: Number(row.stat_calculation || 0),
        stat_accuracy: Number(row.stat_accuracy || 0),
        stat_observation: Number(row.stat_observation || 0),
        icon_url: typeof row.icon_url === 'string' ? row.icon_url : '',
        updated_at: row.updated_at || null,
      })) as GameCatalogRow[];

      setRows(mapped);
      setIconLoadFailed({});
    } catch (error) {
      console.error('Failed to load game catalog:', error);
      showToast('미니게임 목록을 불러오지 못했습니다.', 'error');
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

  const patchRow = (gameType: string, patch: Partial<GameCatalogRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.game_type === gameType ? { ...row, ...patch } : row))
    );
  };

  const saveRow = async (row: GameCatalogRow) => {
    setSavingKeys((prev) => ({ ...prev, [row.game_type]: true }));
    try {
      const payload: Record<string, any> = {
        is_enabled: row.is_enabled,
        use_in_rank: row.use_in_rank,
        use_in_normal: row.use_in_normal,
        use_in_practice: row.use_in_practice,
        updated_at: new Date().toISOString(),
      };

      if (hasIconColumn) payload.icon_url = row.icon_url.trim() || null;
      if (hasStatColumns) {
        payload.stat_speed = Math.max(0, Math.floor(Number(row.stat_speed) || 0));
        payload.stat_memory = Math.max(0, Math.floor(Number(row.stat_memory) || 0));
        payload.stat_judgment = Math.max(0, Math.floor(Number(row.stat_judgment) || 0));
        payload.stat_calculation = Math.max(0, Math.floor(Number(row.stat_calculation) || 0));
        payload.stat_accuracy = Math.max(0, Math.floor(Number(row.stat_accuracy) || 0));
        payload.stat_observation = Math.max(0, Math.floor(Number(row.stat_observation) || 0));
      }

      const { error } = await (supabase as any)
        .from('game_catalog')
        .update(payload)
        .eq('game_type', row.game_type);

      if (error) throw error;

      showToast(`저장 완료: ${row.game_type}`, 'success');
      setRows((prev) =>
        prev.map((item) =>
          item.game_type === row.game_type
            ? { ...item, updated_at: payload.updated_at, icon_url: row.icon_url.trim() }
            : item
        )
      );
    } catch (error) {
      console.error('Failed to save game catalog row:', error);
      showToast(`저장 실패: ${row.game_type}`, 'error');
    } finally {
      setSavingKeys((prev) => ({ ...prev, [row.game_type]: false }));
    }
  };

  const uploadIconForGame = async (row: GameCatalogRow, file: File) => {
    if (!hasIconColumn) {
      showToast('icon_url 컬럼이 없어 업로드를 사용할 수 없습니다.', 'error');
      return;
    }
    if (!ALLOWED_ICON_TYPES.includes(file.type)) {
      showToast('PNG/JPG/WEBP/SVG 이미지만 업로드할 수 있습니다.', 'error');
      return;
    }
    if (file.size > MAX_ICON_SIZE) {
      showToast('이미지 최대 용량은 5MB입니다.', 'error');
      return;
    }

    const extFromType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };
    const fallbackExt = (file.name.split('.').pop() || 'png').toLowerCase();
    const fileExt = extFromType[file.type] || fallbackExt;
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
    const filePath = `games/${row.game_type}/${fileName}`;

    setUploadingKeys((prev) => ({ ...prev, [row.game_type]: true }));
    try {
      const { error: uploadError } = await supabase.storage
        .from('catalog-icons')
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('catalog-icons')
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) throw new Error('Failed to get public URL');

      setIconLoadFailed((prev) => ({ ...prev, [row.game_type]: false }));
      patchRow(row.game_type, { icon_url: publicUrl });
      await saveRow({ ...row, icon_url: publicUrl });
    } catch (error) {
      console.error('Failed to upload game icon:', error);
      showToast(`아이콘 업로드 실패: ${row.game_type}`, 'error');
    } finally {
      setUploadingKeys((prev) => ({ ...prev, [row.game_type]: false }));
    }
  };

  const deleteIconForGame = async (row: GameCatalogRow) => {
    if (!hasIconColumn) {
      showToast('icon_url 컬럼이 없어 아이콘 삭제를 사용할 수 없습니다.', 'error');
      return;
    }

    setDeletingKeys((prev) => ({ ...prev, [row.game_type]: true }));
    try {
      const currentUrl = row.icon_url.trim();
      const storagePath = getCatalogStoragePath(currentUrl);

      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from('catalog-icons')
          .remove([storagePath]);
        if (removeError) throw removeError;
      }

      setIconLoadFailed((prev) => ({ ...prev, [row.game_type]: false }));
      patchRow(row.game_type, { icon_url: '' });
      await saveRow({ ...row, icon_url: '' });
    } catch (error) {
      console.error('Failed to delete game icon:', error);
      showToast(`아이콘 삭제 실패: ${row.game_type}`, 'error');
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [row.game_type]: false }));
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
              <Gamepad2 className="h-5 w-5" />
              <h1 className="text-xl font-bold">미니게임 관리</h1>
            </div>
            <p className="text-sm text-white/80">사용 여부와 아이콘 URL만 수정 가능합니다.</p>
            {!hasIconColumn && (
              <p className="mt-2 text-xs text-amber-300">현재 DB에 icon_url 컬럼이 없어 아이콘 URL 편집은 비활성화됩니다.</p>
            )}
            {!hasStatColumns && (
              <p className="mt-1 text-xs text-amber-300">현재 DB에 stat_* 컬럼이 없어 능력치 증가값 편집은 비활성화됩니다.</p>
            )}
          </div>

          <div className="mt-4 grid gap-3 pb-6">
            {isLoading && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">로딩 중...</div>
            )}

            {!isLoading && sortedRows.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">표시할 미니게임이 없습니다.</div>
            )}

            {!isLoading &&
              sortedRows.map((row) => {
                const iconUrl = row.icon_url.trim();
                const showRuntimeIcon = !!iconUrl && !iconLoadFailed[row.game_type];
                return (
                  <div key={row.game_type} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                          <img
                            src={`/images/games/${row.game_type}.png`}
                            alt={row.game_type}
                            className="h-full w-full object-cover"
                          />
                          {showRuntimeIcon && (
                            <img
                              src={iconUrl}
                              alt={`${row.game_type} runtime icon`}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={() => setIconLoadFailed((prev) => ({ ...prev, [row.game_type]: true }))}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-lg font-semibold">{row.game_type}</div>
                          <div className="text-xs text-white/60">업데이트: {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.is_enabled}
                            onChange={(e) => patchRow(row.game_type, { is_enabled: e.target.checked })}
                          />
                          전체 사용
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.use_in_normal}
                            onChange={(e) => patchRow(row.game_type, { use_in_normal: e.target.checked })}
                          />
                          일반전
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.use_in_rank}
                            onChange={(e) => patchRow(row.game_type, { use_in_rank: e.target.checked })}
                          />
                          랭크전
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.use_in_practice}
                            onChange={(e) => patchRow(row.game_type, { use_in_practice: e.target.checked })}
                          />
                          연습모드
                        </label>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Speed
                        <input
                          type="number"
                          min={0}
                          value={row.stat_speed}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_speed: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Memory
                        <input
                          type="number"
                          min={0}
                          value={row.stat_memory}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_memory: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Judgment
                        <input
                          type="number"
                          min={0}
                          value={row.stat_judgment}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_judgment: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Calculation
                        <input
                          type="number"
                          min={0}
                          value={row.stat_calculation}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_calculation: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Accuracy
                        <input
                          type="number"
                          min={0}
                          value={row.stat_accuracy}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_accuracy: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                      <label className="rounded-lg border border-white/15 px-2 py-2 text-xs">
                        Observation
                        <input
                          type="number"
                          min={0}
                          value={row.stat_observation}
                          disabled={!hasStatColumns}
                          onChange={(e) => patchRow(row.game_type, { stat_observation: Math.max(0, Number(e.target.value || 0)) })}
                          className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={row.icon_url}
                        onChange={(e) => {
                          setIconLoadFailed((prev) => ({ ...prev, [row.game_type]: false }));
                          patchRow(row.game_type, { icon_url: e.target.value });
                        }}
                        disabled={!hasIconColumn}
                        placeholder="아이콘 URL (비우면 기존 내장 아이콘 사용)"
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                      />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        disabled={!hasIconColumn || !!uploadingKeys[row.game_type]}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (!file) return;
                          playSound('click');
                          void uploadIconForGame(row, file);
                        }}
                        className="w-full sm:w-[18rem] rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-cyan-500/30 file:px-2 file:py-1 file:text-cyan-100 disabled:opacity-60"
                      />
                      <button
                        onClick={() => {
                          playSound('click');
                          saveRow(row);
                        }}
                        disabled={!!savingKeys[row.game_type] || !!uploadingKeys[row.game_type] || !!deletingKeys[row.game_type]}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-60"
                      >
                        {uploadingKeys[row.game_type] ? <Upload className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                        {uploadingKeys[row.game_type] ? '업로드 중...' : savingKeys[row.game_type] ? '저장 중...' : '저장'}
                      </button>
                      <button
                        onClick={() => {
                          playSound('click');
                          void deleteIconForGame(row);
                        }}
                        disabled={!!uploadingKeys[row.game_type] || !!savingKeys[row.game_type] || !!deletingKeys[row.game_type] || !row.icon_url.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/35 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingKeys[row.game_type] ? '삭제 중...' : '아이콘 삭제'}
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

export default AdminCatalogGames;
