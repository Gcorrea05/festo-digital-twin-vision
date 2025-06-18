
import React, { createContext, useContext, useState, useEffect } from 'react';

// Types for user data
interface User {
  id: string;
  name: string;
  email: string;
  role: 'viewer' | 'operator' | 'administrator';
  avatar?: string;
}

// Types for authentication context
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (requiredRole: 'viewer' | 'operator' | 'administrator') => boolean;
}

// Mock user data
const MOCK_USERS: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@festo.com',
    role: 'administrator',
    avatar: 'https://i.pravatar.cc/150?img=1',
  },
  {
    id: '2',
    name: 'Operator User',
    email: 'operator@festo.com',
    role: 'operator',
    avatar: 'https://i.pravatar.cc/150?img=2',
  },
  {
    id: '3',
    name: 'Viewer User',
    email: 'viewer@festo.com',
    role: 'viewer',
    avatar: 'https://i.pravatar.cc/150?img=3',
  },
];

// Create auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create role hierarchy for permission checking
const ROLE_HIERARCHY = {
  viewer: 0,
  operator: 1,
  administrator: 2,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuthStatus = () => {
      const storedUser = localStorage.getItem('festo_user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (error) {
          console.error('Failed to parse stored user data', error);
          localStorage.removeItem('festo_user');
        }
      }
      setIsLoading(false);
    };

    // Simulate network delay for auth check
    setTimeout(checkAuthStatus, 800);
  }, []);

  // Mock login function
  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    
    // Simulate API call delay
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const foundUser = MOCK_USERS.find(u => u.email === email);
        
        if (foundUser && password === 'password') { // For demo, any password works as "password"
          setUser(foundUser);
          localStorage.setItem('festo_user', JSON.stringify(foundUser));
          setIsLoading(false);
          resolve();
        } else {
          setIsLoading(false);
          reject(new Error('Invalid email or password'));
        }
      }, 1000);
    });
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('festo_user');
    setUser(null);
  };

  // Permission check function
  const hasPermission = (requiredRole: 'viewer' | 'operator' | 'administrator'): boolean => {
    if (!user) return false;
    
    const userRoleLevel = ROLE_HIERARCHY[user.role];
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];
    
    return userRoleLevel >= requiredRoleLevel;
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasPermission
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
