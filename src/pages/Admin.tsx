import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';

const Admin = () => {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const { playSound } = useSound();

  const appRole = (user?.app_metadata as any)?.role;
  const profileRole = (profile as any)?.role;
  const isAdmin = appRole === 'admin' || profileRole === 'admin';

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

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => {
            playSound('click');
            navigate('/');
          }}
          className="mb-4 rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:text-white hover:border-white/40"
        >
          Back
        </button>

        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-cyan-300">
            <Shield className="h-5 w-5" />
            <h1 className="text-xl font-bold">Admin</h1>
          </div>
          <p className="text-sm text-white/80">관리 기능 메뉴</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => {
              playSound('click');
              navigate('/admin/member');
            }}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition-colors hover:bg-white/10"
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
              <Users className="h-5 w-5" />
            </div>
            <div className="text-lg font-semibold">회원관리</div>
            <div className="mt-1 text-sm text-white/70">회원 목록, 검색, 프로필 사진 확인</div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Admin;
