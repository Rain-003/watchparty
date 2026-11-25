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

interface LoginResult {
  success: boolean;
  role?: UserRole;
  requiresOtp?: boolean;
  email?: string;
  devOtp?: string;
  deliveryNotice?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  userRole: UserRole | null;
  isHost: boolean;
  isSuperAdmin: boolean;
  token: string | null;
  isLoading: boolean;
  login: (code: string) => Promise<LoginResult>;
  verifyOtp: (otp: string) => Promise<{ success: boolean; error?: string }>;
  claimHostGrant: (grantCode: string) => Promise<{ success: boolean; error?: string }>;
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
    const urlStream = getStreamFromUrl();
    if (urlStream) {
      return { ...base, embedUrl: urlStream };
    }
    return base;
  });

  // Verify cryptographic session token on initial mount & claim host invites
  useEffect(() => {
    const initSession = async () => {
      // 1. Check if URL contains a 1-time host grant invite
      const urlParams = new URLSearchParams(window.location.search);
      const hostGrantCode = urlParams.get('grant') || urlParams.get('claim_host');

      if (hostGrantCode) {
        try {
          const grantRes = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claim_host', grantCode: hostGrantCode.trim() }),
          });

          if (grantRes.ok) {
            const data = await grantRes.json();
            if (data.ok && data.token) {
              localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.token);
              localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
              localStorage.removeItem(STORAGE_KEY_SUPER);
              setUserRole('host');
              setIsSuperAdmin(false);
              setToken(data.token);
              setIsLoading(false);

              // Clean query parameters from URL without reloading
              const cleanUrl = window.location.pathname;
              window.history.replaceState({}, '', cleanUrl);
              return;
            }
          }
        } catch (err) {
          console.warn('Failed to claim host invite from URL:', err);
        }
      }

      // 2. Normal stored session verification
      const savedToken = localStorage.getItem(STORAGE_KEY_SESSION_TOKEN);

      if (!savedToken) {
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

      // If verification fails or session was revoked, purge storage
      localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
      localStorage.removeItem(STORAGE_KEY_SUPER);
      setUserRole(null);
      setIsSuperAdmin(false);
      setToken(null);
      setIsLoading(false);
    };

    initSession();
  }, []);

  const claimHostGrant = async (grantCode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim_host', grantCode: grantCode.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.ok && data.token) {
        localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.token);
        localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
        localStorage.removeItem(STORAGE_KEY_SUPER);
        setUserRole('host');
        setIsSuperAdmin(false);
        setToken(data.token);
        return { success: true };
      }
      return { success: false, error: data.message || data.error || 'Failed to claim host grant' };
    } catch {
      return { success: false, error: 'Network error claiming host grant' };
    }
  };

  const login = async (code: string): Promise<LoginResult> => {
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

        // 2FA OTP flow for Owner
        if (data.requiresOtp) {
          return {
            success: true,
            requiresOtp: true,
            email: data.fullEmail || data.email,
            devOtp: data.devOtp,
            deliveryNotice: data.deliveryNotice,
          };
        }

        // Direct token for Host/Viewer
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

  const verifyOtp = async (otpCode: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', otp: otpCode }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.token) {
          localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.token);
          localStorage.setItem(STORAGE_KEY_AUTH_ROLE, 'host');
          localStorage.setItem(STORAGE_KEY_SUPER, 'true');

          setToken(data.token);
          setUserRole('host');
          setIsSuperAdmin(true);

          return { success: true };
        }
      } else {
        const data = await res.json();
        return { success: false, error: data.error || 'Invalid code' };
      }
    } catch (err) {
      console.error('OTP verification failed:', err);
    }

    return { success: false, error: 'Network error verifying code' };
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
        verifyOtp,
        claimHostGrant,
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
