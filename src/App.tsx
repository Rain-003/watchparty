import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PasscodeGate } from './components/PasscodeGate';
import { CinemaPlayer } from './components/CinemaPlayer';
import { StreamSettingsModal } from './components/StreamSettingsModal';

const WatchPartyContent: React.FC = () => {
  const { isAuthenticated, isHost } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (!isAuthenticated) {
    return <PasscodeGate />;
  }

  return (
    <>
      <CinemaPlayer onOpenSettings={() => setIsSettingsOpen(true)} />
      {isHost && (
        <StreamSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <WatchPartyContent />
    </AuthProvider>
  );
};

export default App;
