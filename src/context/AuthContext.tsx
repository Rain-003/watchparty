import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  STORAGE_KEY_AUTH_ROLE,
  getStoredSettings,
  saveStoredSettings,
  DEFAULT_SETTINGS,
  MASTER_ADMIN_PASSCODE,
} from '../config/streamConfig';
import { StreamSettings, UserRole } from '../types';
import { fetchStreamFromCloud, pushStreamToCloud } from '../services/cloudSync';

interface AuthContextType {
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isHost: boolean;
  isSuperAdmin: boolean;
  login: (code: string) => { success: boolean; role?: UserRole };
  logout: () => void;
  settings: StreamSettings;
  updateSettings: (newSettings: Partial<StreamSettings>) => Promise<void>;
  resetSettings: () => void;
}

const STORAGE_KEY_SUPER = 'watchparty_is_super_admin';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [settings, setSettings] = useState<StreamSettings>(getStoredSettings());
  const isHostRef = useRef(false);
  isHostRef.current = userRole === 'host';

  // 1. Initial auth restoration
  useEffect(() => {
    const savedRole = localStorage.getItem(STORAGE_KEY_AUTH_ROLE) as UserRole | null;
    const isSuper = localStorage.getItem(STORAGE_KEY_SUPER) === 'true';
    if (savedRole === 'host' || savedRole === 'viewer') {
      setUserRole(savedRole);
      setIsSuperAdmin(isSuper);
    }
  }, []);

  // 2. Real-time Cloud Sync: Fetch active stream from the host
  const syncFromCloud = useCallback(async () => {
    const remote = await fetchStreamFromCloud();
    if (remote) {
      setSettings((prev) => {
        // Only update if something actually changed to prevent video reload loops
        if (
          remote.embedUrl && remote.embedUrl !== prev.embedUrl ||
          remote.hlsUrl && remote.hlsUrl !== prev.hlsUrl ||
          remote.title && remote.title !== prev.title
        ) {
          const merged = { ...prev, ...remote };
          saveStoredSettings(merged);
          return merged;
        }
        return prev;
      });
    }
  }, []);

  // Initial cloud fetch on mount
  useEffect(() => {
    syncFromCloud();
  }, [syncFromCloud]);

  // Periodic polling for viewers so they follow the host in real time
  useEffect(() => {
    const interval = setInterval(() => {
      // Both viewers and hosts check cloud, but viewers rely on it
      syncFromCloud();
    }, 7000);

    const onFocus = () => syncFromCloud();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [syncFromCloud]);

  const login = (code: string): { success: boolean; role?: UserRole } => {
    const trimmed = code.trim();

    // 1. IMMUTABLE MASTER ADMIN OVERRIDE
    if (trimmed === MASTER_ADMIN_PASSCODE) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
      localStorage.setItem(STORAGE_KEY_SUPER, 'true');
      setUserRole('host');
      setIsSuperAdmin(true);
      return { success: true, role: 'host' };
    }

    // 2. Regular Host Passcode
    if (trimmed === settings.hostPasscode) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
      localStorage.removeItem(STORAGE_KEY_SUPER);
      setUserRole('host');
      setIsSuperAdmin(false);
      return { success: true, role: 'host' };
    }

    // 3. Regular Viewer Passcode
    if (trimmed === settings.viewerPasscode) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'viewer');
      localStorage.removeItem(STORAGE_KEY_SUPER);
      setUserRole('viewer');
      setIsSuperAdmin(false);
      return { success: true, role: 'viewer' };
    }

    return { success: false };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
    localStorage.removeItem(STORAGE_KEY_SUPER);
    setUserRole(null);
    setIsSuperAdmin(false);
  };

  const updateSettings = async (newSettings: Partial<StreamSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveStoredSettings(updated);

    // Broadcast to the cloud room so ALL viewers immediately update
    await pushStreamToCloud(updated);
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveStoredSettings(DEFAULT_SETTINGS);
    pushStreamToCloud(DEFAULT_SETTINGS);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: userRole !== null,
        userRole,
        isHost: userRole === 'host',
        isSuperAdmin,
        login,
        logout,
        settings,
        updateSettings,
        resetSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
