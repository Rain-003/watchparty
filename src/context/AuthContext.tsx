import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  STORAGE_KEY_AUTH_ROLE,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_SESSION_TOKEN,
  STORAGE_KEY_SUPER,
  getStoredSettings,
  saveStoredSettings,
  DEFAULT_SETTINGS,
} from '../config/streamConfig';
import { StreamSettings, UserRole } from '../types';
import { getStreamFromUrl } from '../utils/urlHelper';
import { pushStreamToCloud } from '../services/cloudSync';

interface AuthContextType {
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isHost: boolean;
  isSuperAdmin: boolean;
  token: string | null;
  isLoading: boolean;
  login: (code: string) => Promise<{ success: boolean; role?: UserRole }>;
  logout: () => void;
  settings: StreamSettings;
  updateSettings: (newSettings: Partial<StreamSettings>) => Promise<void>;
  resetSettings: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [settings, setSettings] = useState<StreamSettings>(() => {
    const base = getStoredSettings();
    // Priority 1: If a stream URL is encoded in the page URL (?v=... or ?stream=...)
    const urlStream = getStreamFromUrl();
    if (urlStream) {
      return { ...base, embedUrl: urlStream };
    }
    return base;
  });

  // Verify cryptographic session token on initial mount
  useEffect(() => {
    const verifyStoredSession = async () => {
      const savedToken = localStorage.getItem(STORAGE_KEY_SESSION_TOKEN);

      if (!savedToken) {
        // No session token -> clear any legacy or spoofed localStorage role
        localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
        localStorage.removeItem(STORAGE_KEY_SUPER);
        setUserRole(null);
        setIsSuperAdmin(false);
        setToken(null);
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', token: savedToken }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.ok && (data.role === 'host' || data.role === 'viewer')) {
            setUserRole(data.role);
            setIsSuperAdmin(!!data.isSuperAdmin);
            setToken(savedToken);
            localStorage.setItem(STORAGE_KEY_AUTH_ROLE, data.role);
            if (data.isSuperAdmin) {
              localStorage.setItem(STORAGE_KEY_SUPER, 'true');
            } else {
              localStorage.removeItem(STORAGE_KEY_SUPER);
            }
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Session verification error:', err);
      }

      // If verification fails or token is forged/expired, purge session
      localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
      localStorage.removeItem(STORAGE_KEY_SUPER);
      setUserRole(null);
      setIsSuperAdmin(false);
      setToken(null);
      setIsLoading(false);
    };

    verifyStoredSession();
  }, []);

  const login = async (code: string): Promise<{ success: boolean; role?: UserRole }> => {
    const trimmed = code.trim();
    if (!trimmed) return { success: false };

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', passcode: trimmed }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.token) {
          localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.token);
          localStorage.setItem(STORAGE_KEY_AUTH_ROLE, data.role);
          if (data.isSuperAdmin) {
            localStorage.setItem(STORAGE_KEY_SUPER, 'true');
          } else {
            localStorage.removeItem(STORAGE_KEY_SUPER);
          }

          setToken(data.token);
          setUserRole(data.role);
          setIsSuperAdmin(!!data.isSuperAdmin);

          return { success: true, role: data.role };
        }
      }
    } catch (err) {
      console.error('Login request failed:', err);
    }

    return { success: false };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
    localStorage.removeItem(STORAGE_KEY_SUPER);
    setUserRole(null);
    setIsSuperAdmin(false);
    setToken(null);
  };

  const updateSettings = async (newSettings: Partial<StreamSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveStoredSettings(updated);

    // Sync to cloud edge if host token is present
    if (token && userRole === 'host') {
      await pushStreamToCloud(updated, token);
    }
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveStoredSettings(DEFAULT_SETTINGS);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: userRole !== null && token !== null,
        userRole,
        isHost: userRole === 'host',
        isSuperAdmin,
        token,
        isLoading,
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
