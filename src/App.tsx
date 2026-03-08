import { App as CapacitorApp } from '@capacitor/app';
import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';

// BackButton Handler Component (Need inside Router)
const BackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useUI();
  const { t } = useTranslation();
  const isExitConfirmOpenRef = useRef(false);

  useEffect(() => {
    let backButtonListener: { remove: () => void } | null = null;
    const setupBackButton = async () => {
      // Capacitor App plugin might throw if used in web, wrap in try/catch or check platform
      // But @capacitor/app supports web mostly or fails silently.
      // Actually, safely check if native? No, just add listener.
      try {
        backButtonListener = await CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
          const modalCloseRequest = { handled: false };
          window.dispatchEvent(new CustomEvent('brainrush:request-modal-close', { detail: modalCloseRequest }));
          if (modalCloseRequest.handled) return;

          if (location.pathname === '/' || location.pathname === '/home') {
            if (isExitConfirmOpenRef.current) return;
            isExitConfirmOpenRef.current = true;
            try {
              const shouldExit = await confirm(
                t('common.exitAppTitle', '앱 종료'),
                t('common.exitAppConfirm', '앱을 종료하시겠습니까?')
              );
              if (shouldExit) {
                CapacitorApp.exitApp();
              }
            } finally {
              isExitConfirmOpenRef.current = false;
            }
            return;
          } else if (canGoBack) {
            window.history.back();
          } else {
            navigate('/');
          }
        });
      } catch (e) {
        console.log('Not running in Capacitor context');
      }
    };
    setupBackButton();

    return () => {
      // Avoid removing unrelated listeners (e.g., appUrlOpen for OAuth).
      if (backButtonListener) backButtonListener.remove();
    };
  }, [confirm, location, navigate, t]);

  return null;
};

const AuthErrorRelay = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const search = new URLSearchParams(location.search || '');
    const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));

    const errorCode = search.get('error_code') || hash.get('error_code');
    const errorDescription = search.get('error_description') || hash.get('error_description') || '';
    const isUserBanned = errorCode === 'user_banned' || String(errorDescription).toLowerCase().includes('banned');

    if (!isUserBanned) return;

    try {
      localStorage.setItem('brainrush_auth_error', JSON.stringify({
        message: errorDescription || 'User is banned',
        isBanned: true,
        bannedUntil: null,
        at: Date.now()
      }));
    } catch {
      // no-op
    }

    if (location.pathname !== '/login') {
      navigate('/login', { replace: true });
    } else if (location.search || location.hash) {
      navigate('/login', { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
};
import Game from './pages/Game';
import Settings from './pages/Settings';
import { SoundProvider } from './contexts/SoundContext';

import { AuthProvider } from './contexts/AuthContext';
import { UIProvider, useUI } from './contexts/UIContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TutorialProvider } from './contexts/TutorialContext';
// Pages
import Login from './pages/Login';
import Profile from './pages/Profile';
import PracticeMode from './pages/PracticeMode';
import Shop from './pages/Shop';
import Privacy from './pages/Privacy';
import Support from './pages/Support';
import Admin from './pages/Admin';
import AdminMember from './pages/AdminMember';
import AdminCatalogGames from './pages/AdminCatalogGames';
import AdminCatalogShop from './pages/AdminCatalogShop';

import GameInviteListener from './components/social/GameInviteListener';
import RematchListener from './components/social/RematchListener';
import ChatNotificationListener from './components/social/ChatNotificationListener';
import LocalNotificationScheduler from './components/notifications/LocalNotificationScheduler';

// Force Logout Listener (Single Active Session)
const ForceLogoutListener = () => {
  const navigate = useNavigate();
  const { showToast } = useUI();
  const { t } = useTranslation();

  useEffect(() => {
    const handler = () => {
      showToast(t('auth.loggedOutByOtherDevice', 'You were logged out because this account was used on another device.'), 'error');
      navigate('/login', { replace: true });
    };
    window.addEventListener('forceLogout', handler);
    return () => window.removeEventListener('forceLogout', handler);
  }, [navigate, showToast, t]);

  return null;
};


import BGMManager from './components/audio/BGMManager';
import ForceUpdateCheck from './components/ForceUpdateCheck';

function App() {
  useEffect(() => {
    const isAndroid = Capacitor.getPlatform() === 'android';
    const offset = isAndroid ? '12px' : '0px';
    document.documentElement.style.setProperty('--home-top-offset', offset);

    // Request App Tracking Transparency on iOS
    const requestTracking = async () => {
      if (Capacitor.getPlatform() === 'ios') {
        try {
          await AdMob.requestTrackingAuthorization();
        } catch (e) {
          console.error('ATT Request failed:', e);
        }
      }
      // Initialize AdMob globally
      if (Capacitor.isNativePlatform()) {
        AdMob.initialize().catch(e => console.error('Global AdMob init failed:', e));
      }
    };
    requestTracking();
  }, []);

  return (
    <SoundProvider>
      <ThemeProvider>
        <AuthProvider>
          <UIProvider>
            <TutorialProvider>
              <BrowserRouter>
                <div className="app-theme-root">
                  <BackButtonHandler />
                  <ForceUpdateCheck />
                  <AuthErrorRelay />
                  <BGMManager />
                  <GameInviteListener />
                  <RematchListener />
                  <ChatNotificationListener />
                  <LocalNotificationScheduler />
                  <ForceLogoutListener />
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/game/:roomId" element={<Game />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/practice" element={<PracticeMode />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/member" element={<AdminMember />} />
                    <Route path="/admin/games" element={<AdminCatalogGames />} />
                    <Route path="/admin/shop" element={<AdminCatalogShop />} />
                  </Routes>
                </div>
              </BrowserRouter>
            </TutorialProvider>
          </UIProvider>
        </AuthProvider>
      </ThemeProvider>
    </SoundProvider>
  );
}

export default App;
