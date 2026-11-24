import React, { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE_KEY_AUTH_ROLE, getStoredSettings, saveStoredSettings, DEFAULT_SETTINGS } from '../config/streamConfig';
import { StreamSettings, UserRole } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isHost: boolean;
  login: (code: string) => { success: boolean; role?: UserRole };
  logout: () => void;
  settings: StreamSettings;
  updateSettings: (newSettings: Partial<StreamSettings>) => void;
  resetSettings: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [settings, setSettings] = useState<StreamSettings>(getStoredSettings());

  useEffect(() => {
    const savedRole = localStorage.getItem(STORAGE_KEY_AUTH_ROLE) as UserRole | null;
    if (savedRole === 'host' || savedRole === 'viewer') {
      setUserRole(savedRole);
    }
  }, []);

  const login = (code: string): { success: boolean; role?: UserRole } => {
    const trimmed = code.trim();
    if (trimmed === settings.hostPasscode) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
      setUserRole('host');
      return { success: true, role: 'host' };
    }
    if (trimmed === settings.viewerPasscode) {
      localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'viewer');
      setUserRole('viewer');
      return { success: true, role: 'viewer' };
    }
    return { success: false };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
    setUserRole(null);
  };

  const updateSettings = (newSettings: Partial<StreamSettings>) => {
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
