import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';

// BackButton Handler Component (Need inside Router)
const BackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let backButtonListener: { remove: () => void } | null = null;
    const setupBackButton = async () => {
      // Capacitor App plugin might throw if used in web, wrap in try/catch or check platform
      // But @capacitor/app supports web mostly or fails silently.
      // Actually, safely check if native? No, just add listener.
      try {
        backButtonListener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          if (location.pathname === '/' || location.pathname === '/home') {
            CapacitorApp.exitApp();
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
  }, [navigate, location]);

  return null;
};
import Game from './pages/Game';
import Settings from './pages/Settings';
import { SoundProvider } from './contexts/SoundContext';

import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
// Pages
import Login from './pages/Login';
import Profile from './pages/Profile';
import PracticeMode from './pages/PracticeMode';
import Shop from './pages/Shop';

import GameInviteListener from './components/social/GameInviteListener';
import ChatNotificationListener from './components/social/ChatNotificationListener';
import LocalNotificationScheduler from './components/notifications/LocalNotificationScheduler';


import BGMManager from './components/audio/BGMManager';

function App() {
  useEffect(() => {
    const isAndroid = Capacitor.getPlatform() === 'android';
    const offset = isAndroid ? '12px' : '0px';
    document.documentElement.style.setProperty('--home-top-offset', offset);
  }, []);

  return (
    <SoundProvider>
      <AuthProvider>
        <UIProvider>
          <BrowserRouter>
            <BackButtonHandler />
            <BGMManager />
            <GameInviteListener />
            <ChatNotificationListener />
            <LocalNotificationScheduler />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/game/:roomId" element={<Game />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/practice" element={<PracticeMode />} />
              <Route path="/shop" element={<Shop />} />
            </Routes>
          </BrowserRouter>
        </UIProvider>
      </AuthProvider>
    </SoundProvider>
  );
}

export default App;
