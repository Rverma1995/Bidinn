import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  CreditCard,
  BarChart3,
  UserCog,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'manager', 'team_lead', 'sales_rep'] },
  { path: '/leads', icon: Users, label: 'Leads', roles: ['admin', 'manager', 'team_lead', 'sales_rep'] },
  { path: '/pipeline', icon: Kanban, label: 'Pipeline', roles: ['admin', 'manager', 'team_lead', 'sales_rep'] },
  { path: '/bookings', icon: Calendar, label: 'Bookings', roles: ['admin', 'manager', 'team_lead', 'sales_rep'] },
  { path: '/payments', icon: CreditCard, label: 'Payments', roles: ['admin', 'manager', 'team_lead'] },
  { path: '/reports', icon: BarChart3, label: 'Reports', roles: ['admin', 'manager'] },
  { path: '/team', icon: UserCog, label: 'Team', roles: ['admin', 'manager', 'team_lead'] },
];

export function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const location = useLocation();

  const filteredItems = navItems.filter(item => 
    item.roles.includes(user?.role)
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-slate-200 dark:border-slate-800",
        collapsed ? "justify-center px-2" : "px-6"
      )}>
        <h1 className={cn(
          "font-bold text-primary transition-all duration-300",
          collapsed ? "text-xl" : "text-2xl tracking-tight"
        )}>
          {collapsed ? "B" : "Bidinn"}
        </h1>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100",
                  collapsed && "justify-center"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {!collapsed && (
          <>
            <Separator className="my-4 mx-4" />
            <div className="px-4">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Settings
              </p>
              <NavLink
                to="/settings"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  location.pathname === '/settings'
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </NavLink>
            </div>
          </>
        )}
      </ScrollArea>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={onToggle}
          data-testid="sidebar-toggle"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
