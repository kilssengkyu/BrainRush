
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Settings from './pages/Settings';
import { SoundProvider } from './contexts/SoundContext';

import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
// Pages
import Login from './pages/Login';
import Profile from './pages/Profile';
import PracticeMode from './pages/PracticeMode';

import GameInviteListener from './components/social/GameInviteListener';

function App() {
  return (
    <SoundProvider>
      <AuthProvider>
        <UIProvider>
          <Router>
            <GameInviteListener />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/game/:roomId" element={<Game />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/practice" element={<PracticeMode />} />
            </Routes>
          </Router>
        </UIProvider>
      </AuthProvider>
    </SoundProvider>
  );
}

export default App;
