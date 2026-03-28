import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Use REACT_APP_BACKEND_URL if set, otherwise use relative URL for production
const API_URL = process.env.REACT_APP_BACKEND_URL 
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bidinn_token'));
  const [loading, setLoading] = useState(true);

  const api = useCallback(() => {
    const instance = axios.create({
      baseURL: API_URL,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: 300000, // 5 minutes timeout for large file uploads
    });
    
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    
    return instance;
  }, [token]);

  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        try {
          const response = await api().get('/auth/me');
          setUser(response.data);
        } catch (error) {
          console.error('Failed to fetch user:', error);
          localStorage.removeItem('bidinn_token');
          setToken(null);
        }
      }
      setLoading(false);
    };

    fetchUser();
  }, [token, api]);

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    
    localStorage.setItem('bidinn_token', access_token);
    setToken(access_token);
    setUser(userData);
    
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('bidinn_token');
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;
  const isTeamLead = user?.role === 'team_lead' || isManager;

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    api: api(),
    isAdmin,
    isManager,
    isTeamLead,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
