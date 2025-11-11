import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiClient, User } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    if (!apiClient.isAuthenticated()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await apiClient.getMe();
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      // Only clear user on actual auth errors, not network errors
      if (error instanceof Error && error.message === 'Unauthorized') {
        setUser(null);
      }
      // Keep existing user data on other errors to prevent unnecessary logouts
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
