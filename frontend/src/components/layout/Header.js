import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { generateInitials, formatRelativeTime, getRoleLabel } from '../../lib/utils';
import {
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  User,
  Settings,
  Menu,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function Header({ onMenuClick, showMobileMenu }) {
  const { user, logout, api } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const seenNotifIds = useRef(new Set());
  const isFirstFetch = useRef(true);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [hasMoreNotifs, setHasMoreNotifs] = useState(true);
  const lastNotifDate = useRef(null);

  const showFollowupToast = useCallback((notification) => {
    const isMissed = notification.type === 'followup_missed';
    toast(notification.title, {
      description: notification.message,
      duration: 10000,
      icon: isMissed ? '🔴' : '🟡',
      action: notification.target_id ? {
        label: 'View Lead',
        onClick: () => navigate(`/leads/${notification.target_id}`),
      } : undefined,
    });
  }, [navigate]);

  const fetchNotifications = useCallback(async (isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingNotifs(true);
      }
      
      const url = isLoadMore && lastNotifDate.current 
        ? `/notifications?last_seen=${encodeURIComponent(lastNotifDate.current)}` 
        : '/notifications';

      const response = await api.get(url);
      const data = response.data;
      const notifList = data.notifications || (Array.isArray(data) ? data : []);
      const count = data.unread_count ?? notifList.filter(n => !n.is_read).length;

      // On first fetch, just seed the seen IDs — don't pop toasts for old ones
      if (isFirstFetch.current) {
        notifList.forEach(n => seenNotifIds.current.add(n.id));
        isFirstFetch.current = false;
      } else if (!isLoadMore) {
        // Show pop-up toasts for NEW followup notifications we haven't seen
        notifList.forEach(n => {
          if (
            !seenNotifIds.current.has(n.id) &&
            !n.is_read &&
            (n.type === 'followup_upcoming' || n.type === 'followup_missed')
          ) {
            showFollowupToast(n);
          }
          seenNotifIds.current.add(n.id);
        });
      } else {
        notifList.forEach(n => seenNotifIds.current.add(n.id));
      }

      if (isLoadMore) {
        setNotifications(prev => {
          const newItems = notifList.filter(n => !prev.some(p => p.id === n.id));
          return [...prev, ...newItems];
        });
      } else {
        setNotifications(notifList);
        setUnreadCount(count);
      }
      
      if (notifList.length > 0) {
        lastNotifDate.current = notifList[notifList.length - 1].created_at;
      }
      setHasMoreNotifs(notifList.length > 0);
      
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      if (!isLoadMore) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      if (isLoadMore) {
        setLoadingNotifs(false);
      }
    }
  }, [api, showFollowupToast]);

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 50 && !loadingNotifs && hasMoreNotifs) {
      fetchNotifications(true);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
    if (notification.target_id && notification.target_type === 'lead') {
      navigate(`/leads/${notification.target_id}`);
    }
  };

  const getNotificationIcon = (type) => {
    if (type === 'followup_upcoming') return <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
    if (type === 'followup_missed') return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />;
    return null;
  };

  return (
    <header className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30" data-testid="header">
      {/* Left side - Mobile menu + Search */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          data-testid="mobile-menu-btn"
        >
          {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
        
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search leads, bookings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 pl-9 h-9 bg-slate-50 dark:bg-slate-800 border-0"
            data-testid="search-input"
          />
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-slate-600 dark:text-slate-400"
          data-testid="theme-toggle"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </Button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-600 dark:text-slate-400"
              data-testid="notifications-btn"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0" data-testid="notifications-panel">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="h-80" onScrollCapture={handleScroll}>
              {notifications.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  No notifications
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                        !notification.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                      } ${notification.type === 'followup_missed' ? 'border-l-2 border-l-red-500' : ''} ${notification.type === 'followup_upcoming' ? 'border-l-2 border-l-amber-500' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                      data-testid={`notification-item-${notification.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {getNotificationIcon(notification.type) || (
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                            !notification.is_read ? 'bg-blue-500' : 'bg-transparent'
                          }`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                          {notification.target_id && notification.target_type === 'lead' && (
                            <p className="text-xs text-primary mt-1 font-medium">Click to view lead</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRelativeTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {loadingNotifs && (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      Loading more...
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3" data-testid="user-menu-btn">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {generateInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground">{getRoleLabel(user?.role)}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" data-testid="user-menu-dropdown">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400" data-testid="logout-btn">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
