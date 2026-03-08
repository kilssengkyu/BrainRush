import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Save, ShoppingBag, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { supabase } from '../lib/supabaseClient';

type ShopCatalogRow = {
  product_id: string;
  is_enabled: boolean;
  sort_order: number;
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

const LOCAL_ICON_MAP: Record<string, string> = {
  remove_ads: '/images/icon/icon_ads_off.png',
  nickname_change_ticket: '/images/icon/icon_ticket.png',
  nickname_ticket: '/images/icon/icon_ticket.png',
  pencils_5: '/images/icon/icon_pen.png',
  pencil_20: '/images/icon/icon_pen.png',
  pencils_20: '/images/icon/icon_pen.png',
  pencil_100: '/images/icon/icon_pen.png',
  pencils_100: '/images/icon/icon_pen.png',
  practice_note_10: '/images/icon/icon_note.png',
  practice_notes_10: '/images/icon/icon_note.png',
  practice_note_20: '/images/icon/icon_note.png',
  practice_notes_20: '/images/icon/icon_note.png',
  practice_note_100: '/images/icon/icon_note.png',
  practice_notes_100: '/images/icon/icon_note.png',
};

const AdminCatalogShop = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { playSound } = useSound();
  const { showToast } = useUI();

  const [rows, setRows] = useState<ShopCatalogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});
  const [deletingKeys, setDeletingKeys] = useState<Record<string, boolean>>({});
  const [iconLoadFailed, setIconLoadFailed] = useState<Record<string, boolean>>({});
  const [hasIconColumn, setHasIconColumn] = useState(true);

  const appRole = (user?.app_metadata as any)?.role;
  const profileRole = (profile as any)?.role;
  const isAdmin = appRole === 'admin' || profileRole === 'admin';

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.product_id.localeCompare(b.product_id)),
    [rows]
  );

  const loadRows = async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      let data: any[] | null = null;
      let error: any = null;

      const withIcon = await (supabase as any)
        .from('shop_catalog')
        .select('product_id, is_enabled, sort_order, icon_url, updated_at');

      data = withIcon.data;
      error = withIcon.error;

      if (error) {
        const withoutIcon = await (supabase as any)
          .from('shop_catalog')
          .select('product_id, is_enabled, sort_order, updated_at');
        data = withoutIcon.data;
        error = withoutIcon.error;
        setHasIconColumn(!error);
      } else {
        setHasIconColumn(true);
      }

      if (error) throw error;

      const mapped = (data || []).map((row: any) => ({
        product_id: String(row.product_id),
        is_enabled: !!row.is_enabled,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 100,
        icon_url: typeof row.icon_url === 'string' ? row.icon_url : '',
        updated_at: row.updated_at || null,
      })) as ShopCatalogRow[];

      setRows(mapped);
      setIconLoadFailed({});
    } catch (error) {
      console.error('Failed to load shop catalog:', error);
      showToast('상점 목록을 불러오지 못했습니다.', 'error');
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

  const patchRow = (productId: string, patch: Partial<ShopCatalogRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.product_id === productId ? { ...row, ...patch } : row))
    );
  };

  const saveRow = async (row: ShopCatalogRow) => {
    setSavingKeys((prev) => ({ ...prev, [row.product_id]: true }));
    try {
      const payload: Record<string, any> = {
        is_enabled: row.is_enabled,
        sort_order: row.sort_order,
        updated_at: new Date().toISOString(),
      };

      if (hasIconColumn) payload.icon_url = row.icon_url.trim() || null;

      const { error } = await (supabase as any)
        .from('shop_catalog')
        .update(payload)
        .eq('product_id', row.product_id);

      if (error) throw error;

      showToast(`저장 완료: ${row.product_id}`, 'success');
      setRows((prev) =>
        prev.map((item) =>
          item.product_id === row.product_id
            ? { ...item, updated_at: payload.updated_at, icon_url: row.icon_url.trim() }
            : item
        )
      );
    } catch (error) {
      console.error('Failed to save shop catalog row:', error);
      showToast(`저장 실패: ${row.product_id}`, 'error');
    } finally {
      setSavingKeys((prev) => ({ ...prev, [row.product_id]: false }));
    }
  };

  const uploadIconForProduct = async (row: ShopCatalogRow, file: File) => {
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
    const filePath = `shop/${row.product_id}/${fileName}`;

    setUploadingKeys((prev) => ({ ...prev, [row.product_id]: true }));
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

      setIconLoadFailed((prev) => ({ ...prev, [row.product_id]: false }));
      patchRow(row.product_id, { icon_url: publicUrl });
      await saveRow({ ...row, icon_url: publicUrl });
    } catch (error) {
      console.error('Failed to upload shop icon:', error);
      showToast(`아이콘 업로드 실패: ${row.product_id}`, 'error');
    } finally {
      setUploadingKeys((prev) => ({ ...prev, [row.product_id]: false }));
    }
  };

  const deleteIconForProduct = async (row: ShopCatalogRow) => {
    if (!hasIconColumn) {
      showToast('icon_url 컬럼이 없어 아이콘 삭제를 사용할 수 없습니다.', 'error');
      return;
    }

    setDeletingKeys((prev) => ({ ...prev, [row.product_id]: true }));
    try {
      const currentUrl = row.icon_url.trim();
      const storagePath = getCatalogStoragePath(currentUrl);

      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from('catalog-icons')
          .remove([storagePath]);
        if (removeError) throw removeError;
      }

      setIconLoadFailed((prev) => ({ ...prev, [row.product_id]: false }));
      patchRow(row.product_id, { icon_url: '' });
      await saveRow({ ...row, icon_url: '' });
    } catch (error) {
      console.error('Failed to delete shop icon:', error);
      showToast(`아이콘 삭제 실패: ${row.product_id}`, 'error');
    } finally {
      setDeletingKeys((prev) => ({ ...prev, [row.product_id]: false }));
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
              <ShoppingBag className="h-5 w-5" />
              <h1 className="text-xl font-bold">상점 상품 관리</h1>
            </div>
            <p className="text-sm text-white/80">사용 여부, 정렬 순서, 아이콘 URL만 수정 가능합니다.</p>
            {!hasIconColumn && (
              <p className="mt-2 text-xs text-amber-300">현재 DB에 icon_url 컬럼이 없어 아이콘 URL 편집은 비활성화됩니다.</p>
            )}
          </div>

          <div className="mt-4 grid gap-3 pb-6">
            {isLoading && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">로딩 중...</div>
            )}

            {!isLoading && sortedRows.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">표시할 상품이 없습니다.</div>
            )}

            {!isLoading &&
              sortedRows.map((row) => {
                const iconUrl = row.icon_url.trim();
                const showRuntimeIcon = !!iconUrl && !iconLoadFailed[row.product_id];
                const localIcon = LOCAL_ICON_MAP[row.product_id] || '/images/icon/icon_note.png';
                return (
                  <div key={row.product_id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                          <img src={localIcon} alt={row.product_id} className="h-full w-full object-cover" />
                          {showRuntimeIcon && (
                            <img
                              src={iconUrl}
                              alt={`${row.product_id} runtime icon`}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={() => setIconLoadFailed((prev) => ({ ...prev, [row.product_id]: true }))}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-lg font-semibold">{row.product_id}</div>
                          <div className="text-xs text-white/60">업데이트: {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.is_enabled}
                            onChange={(e) => patchRow(row.product_id, { is_enabled: e.target.checked })}
                          />
                          사용
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
                          정렬
                          <input
                            type="number"
                            value={row.sort_order}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              patchRow(row.product_id, { sort_order: Number.isFinite(raw) ? raw : 100 });
                            }}
                            className="w-20 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm outline-none focus:border-cyan-400/60"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={row.icon_url}
                        onChange={(e) => {
                          setIconLoadFailed((prev) => ({ ...prev, [row.product_id]: false }));
                          patchRow(row.product_id, { icon_url: e.target.value });
                        }}
                        disabled={!hasIconColumn}
                        placeholder="아이콘 URL (비우면 기존 내장 아이콘 사용)"
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/60 disabled:opacity-60"
                      />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        disabled={!hasIconColumn || !!uploadingKeys[row.product_id]}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = '';
                          if (!file) return;
                          playSound('click');
                          void uploadIconForProduct(row, file);
                        }}
                        className="w-full sm:w-[18rem] rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm file:mr-2 file:rounded-md file:border-0 file:bg-cyan-500/30 file:px-2 file:py-1 file:text-cyan-100 disabled:opacity-60"
                      />
                      <button
                        onClick={() => {
                          playSound('click');
                          saveRow(row);
                        }}
                        disabled={!!savingKeys[row.product_id] || !!uploadingKeys[row.product_id] || !!deletingKeys[row.product_id]}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-60"
                      >
                        {uploadingKeys[row.product_id] ? <Upload className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                        {uploadingKeys[row.product_id] ? '업로드 중...' : savingKeys[row.product_id] ? '저장 중...' : '저장'}
                      </button>
                      <button
                        onClick={() => {
                          playSound('click');
                          void deleteIconForProduct(row);
                        }}
                        disabled={!!uploadingKeys[row.product_id] || !!savingKeys[row.product_id] || !!deletingKeys[row.product_id] || !row.icon_url.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/35 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingKeys[row.product_id] ? '삭제 중...' : '아이콘 삭제'}
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

export default AdminCatalogShop;
