import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import PipelinePage from './pages/PipelinePage';
import BookingsPage from './pages/BookingsPage';
import PaymentsPage from './pages/PaymentsPage';
import ReportsPage from './pages/ReportsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

interface PublicRouteProps {
  children: React.ReactNode;
}

function PublicRoute({ children }: PublicRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route
          path="payments"
          element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'team_lead']}>
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute allowedRoles={['admin', 'manager']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="team"
          element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'team_lead']}>
              <TeamPage />
            </ProtectedRoute>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster 
            position="top-right" 
            richColors 
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
