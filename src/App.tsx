import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PasscodeGate } from './components/PasscodeGate';
import { CinemaPlayer } from './components/CinemaPlayer';
import { StreamSettingsModal } from './components/StreamSettingsModal';
import { OwnerAdminModal } from './components/OwnerAdminModal';

const WatchPartyContent: React.FC = () => {
  const { isAuthenticated, isHost, isSuperAdmin, isLoading } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOwnerAdminOpen, setIsOwnerAdminOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08080a] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-400 rounded-full animate-spin" />
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
            Validating Session...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasscodeGate />;
  }

  return (
    <>
      <CinemaPlayer
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOwnerAdmin={() => setIsOwnerAdminOpen(true)}
      />
      {isHost && (
        <StreamSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isSuperAdmin && (
        <OwnerAdminModal
          isOpen={isOwnerAdminOpen}
          onClose={() => setIsOwnerAdminOpen(false)}
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
