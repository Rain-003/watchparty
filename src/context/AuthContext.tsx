import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  STORAGE_KEY_AUTH_ROLE,
  getStoredSettings,
  saveStoredSettings,
  DEFAULT_SETTINGS,
  MASTER_ADMIN_PASSCODE,
} from '../config/streamConfig';
import { StreamSettings, UserRole } from '../types';
import { getStreamFromUrl } from '../utils/urlHelper';

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

  const [settings, setSettings] = useState<StreamSettings>(() => {
    const base = getStoredSettings();
    // Priority 1: If a stream URL is encoded in the page URL (?v=... or ?stream=...)
    // This allows the host to share a direct link that overrides stored settings
    const urlStream = getStreamFromUrl();
    if (urlStream) {
      return { ...base, embedUrl: urlStream };
    }
    return base;
  });

  // Restore session on mount
  useEffect(() => {
    const savedRole = localStorage.getItem(STORAGE_KEY_AUTH_ROLE) as UserRole | null;
    const isSuper = localStorage.getItem(STORAGE_KEY_SUPER) === 'true';
    if (savedRole === 'host' || savedRole === 'viewer') {
      setUserRole(savedRole);
      setIsSuperAdmin(isSuper);
    }
  }, []);

  const login = (code: string): { success: boolean; role?: UserRole } => {
    const trimmed = code.trim();

    // 1. Immutable master owner key
    if (trimmed === MASTER_ADMIN_PASSCODE) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
      localStorage.setItem(STORAGE_KEY_SUPER, 'true');
      setUserRole('host');
      setIsSuperAdmin(true);
      return { success: true, role: 'host' };
    }

    // 2. Regular host
    if (trimmed === settings.hostPasscode) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
      localStorage.removeItem(STORAGE_KEY_SUPER);
      setUserRole('host');
      setIsSuperAdmin(false);
      return { success: true, role: 'host' };
    }

    // 3. Viewer
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
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveStoredSettings(DEFAULT_SETTINGS);
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
