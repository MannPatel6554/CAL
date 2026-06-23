import React, { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  Edit3,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
  Bell,
  BellOff,
  X,
  AlertCircle,
  Sun,
  Moon
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:10000/api';

export default function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // API connection state
  const [apiOnline, setApiOnline] = useState(true);

  // Theme state ('dark' or 'light')
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // Calendar & Events state
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'denied'
  );

  // Form state for creating/editing events
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [editingEvent, setEditingEvent] = useState(null); // holds event object if editing
  const [showAddForm, setShowAddForm] = useState(false);

  // Todo list state
  const [todos, setTodos] = useState([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');

  // Email verification success states
  const [showVerificationSuccess, setShowVerificationSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  // Handle email verification redirect parameters on mount
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    
    let isSignup = false;
    let errorMsg = '';

    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      if (hashParams.get('type') === 'signup') {
        isSignup = true;
      }
      if (hashParams.get('error_description')) {
        errorMsg = hashParams.get('error_description');
      }
    }

    if (search) {
      const searchParams = new URLSearchParams(search);
      if (searchParams.get('type') === 'signup') {
        isSignup = true;
      }
      if (searchParams.get('error_description')) {
        errorMsg = searchParams.get('error_description');
      }
    }

    if (isSignup) {
      setShowVerificationSuccess(true);
      // Clean query parameters from URL
      window.history.replaceState(null, null, window.location.pathname);
    } else if (errorMsg) {
      setVerificationError(errorMsg.replace(/\+/g, ' '));
      window.history.replaceState(null, null, window.location.pathname);
    }
  }, []);

  // Sync theme to localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Fetch events when token changes
  useEffect(() => {
    if (token) {
      fetchEvents();
    } else {
      setEvents([]);
    }
  }, [token]);

  // Fetch todos when token or selectedDate changes
  useEffect(() => {
    if (token) {
      fetchTodos(selectedDate);
    } else {
      setTodos([]);
    }
  }, [token, selectedDate]);

  // Request browser Notification permission on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        setNotificationPermission(perm);
      });
    }
  }, []);

  // Check API health
  const checkApiHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      setApiOnline(res.ok);
    } catch (err) {
      setApiOnline(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
    const interval = setInterval(checkApiHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Polling Scheduler logic: runs every 60s
  useEffect(() => {
    if (!token) return;

    // Run poll immediately on login/load
    pollDueEvents();

    const intervalId = setInterval(() => {
      pollDueEvents();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [token]);

  // Fetch all events for the user
  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/events`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setEvents(data);
      } else {
        toast.error(data.error || 'Failed to fetch events');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error fetching events');
    }
  };

  // Poll for due events
  const pollDueEvents = async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      const res = await fetch(`${API_BASE}/events/due?date=${dateStr}&time=${timeStr}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }

      const dueEvents = await res.json();
      if (res.ok && dueEvents.length > 0) {
        dueEvents.forEach((event) => {
          // Trigger in-app Toast
          toast.info(`⏰ Reminder: "${event.title}" is due now!`, {
            position: 'top-right',
            autoClose: 8000,
            theme: theme === 'dark' ? 'dark' : 'light'
          });

          // Trigger native OS Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Schedule Notifier', {
              body: `"${event.title}" is scheduled for ${event.time}`,
              icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📅</text></svg>'
            });
          }
        });

        // Refresh events list to reflect updated 'notified' flag in state
        fetchEvents();
      }
    } catch (err) {
      console.error('Error polling due events:', err);
    }
  };

  // Todo CRUD helper functions

  const fetchTodos = async (dateObj) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    try {
      const res = await fetch(`${API_BASE}/todos?date=${dateStr}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setTodos(data);
      } else {
        toast.error(data.error || 'Failed to fetch todos');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error fetching todos');
    }
  };

  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) {
      toast.warning('Please enter a task title');
      return;
    }

    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    try {
      const res = await fetch(`${API_BASE}/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTodoTitle.trim(),
          date: dateStr
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Task added successfully');
        setNewTodoTitle('');
        fetchTodos(selectedDate);
      } else {
        toast.error(data.error || 'Failed to add task');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error adding task');
    }
  };

  const handleToggleTodo = async (todoId, currentCompleted) => {
    try {
      const res = await fetch(`${API_BASE}/todos/${todoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          completed: !currentCompleted
        })
      });

      const data = await res.json();
      if (res.ok) {
        fetchTodos(selectedDate);
      } else {
        toast.error(data.error || 'Failed to update task');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error updating task');
    }
  };

  const handleDeleteTodo = async (todoId) => {
    try {
      const res = await fetch(`${API_BASE}/todos/${todoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Task deleted');
        fetchTodos(selectedDate);
      } else {
        toast.error(data.error || 'Failed to delete task');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error deleting task');
    }
  };

  // Auth submission handlers
  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const endpoint = authMode === 'login' ? 'login' : 'register';

    try {
      const res = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Authentication failed');
        return;
      }

      if (authMode === 'login') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        toast.success('Welcome back!');
      } else {
        setSuccessMsg('Registration successful! Please check your email to verify your account before logging in.');
        setAuthMode('login');
        setPassword('');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error. Check if your server is running.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setEvents([]);
    toast.info('Logged out successfully');
  };

  const handleRequestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        setNotificationPermission(perm);
        if (perm === 'granted') {
          toast.success('System notifications enabled!');
        } else {
          toast.warning('Notifications permission denied or blocked.');
        }
      });
    } else {
      toast.error('System notifications not supported in this browser.');
    }
  };

  // CRUD operations
  const handleCreateOrUpdateEvent = async (e) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventTime) {
      toast.warning('Please enter title and time');
      return;
    }

    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const url = editingEvent
      ? `${API_BASE}/events/${editingEvent.id}`
      : `${API_BASE}/events`;

    const method = editingEvent ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: eventTitle,
          date: dateStr,
          time: eventTime,
          notified: editingEvent ? editingEvent.notified : false
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(editingEvent ? 'Event updated successfully' : 'Event created successfully');
        setEventTitle('');
        setEventTime('');
        setEditingEvent(null);
        setShowAddForm(false);
        fetchEvents();
      } else {
        toast.error(data.error || 'Failed to save event');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error saving event');
    }
  };

  const handleStartEdit = (event) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventTime(event.time);
    setShowAddForm(true);
  };

  const handleCancelEdit = () => {
    setEditingEvent(null);
    setEventTitle('');
    setEventTime('');
    setShowAddForm(false);
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;

    try {
      const res = await fetch(`${API_BASE}/events/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Event deleted');
        if (editingEvent && editingEvent.id === id) {
          handleCancelEdit();
        }
        fetchEvents();
      } else {
        toast.error(data.error || 'Failed to delete event');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error deleting event');
    }
  };

  // Calendar Helper functions
  const daysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleSelectDay = (dayNum) => {
    setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum));
  };

  // Get current month details
  const totalDays = daysInMonth(currentMonth);
  const startDay = firstDayOfMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Get events on a specific day
  const getEventsForDay = (dayNum) => {
    const year = currentMonth.getFullYear();
    const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const day = String(dayNum).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return events.filter((e) => e.date === dateStr);
  };

  const formattedSelectedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const selectedDateStr = `${selectedDate.getFullYear()}-${String(
    selectedDate.getMonth() + 1
  ).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  const selectedDayEvents = events.filter((e) => e.date === selectedDateStr);

  // Render Auth UI
  if (!token) {
    return (
      <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}>
        {!apiOnline && (
          <div className="bg-red-600/95 text-white text-center py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2 z-50 sticky top-0 backdrop-blur-sm animate-pulse shadow-md">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Cannot connect to backend server. API: {API_BASE}</span>
          </div>
        )}
        
        {/* Floating Theme Toggle on Login Screen */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2.5 rounded-xl border transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850'
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 shadow-sm'
            }`}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 relative">
          {/* Decorative background gradients */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className={`w-full max-w-md backdrop-blur-xl border rounded-2xl shadow-2xl p-8 z-10 transition-all duration-300 ${
            theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white/80 border-slate-200 shadow-xl'
          }`}>
            <div className="flex flex-col items-center mb-8">
              <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-500/5">
                <CalendarIcon className="w-8 h-8" />
              </div>
              <h1 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>Schedule Notifier</h1>
              <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Never miss your personal calendar events</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              <div>
                <label htmlFor="email" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full border rounded-lg py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-950 placeholder-slate-400'
                  }`}
                />
              </div>

              <div>
                <label htmlFor="password" className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                  theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full border rounded-lg py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-950 placeholder-slate-400'
                  }`}
                />
              </div>

              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm rounded-lg p-3">
                  {successMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-3 rounded-lg shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 transition-all duration-150"
              >
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>
                {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </span>{' '}
              <button
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4"
              >
                {authMode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>
          <ToastContainer position="bottom-left" theme={theme === 'dark' ? 'dark' : 'light'} />
        </div>
      </div>
    );
  }

  // Render Dashboard
  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {!apiOnline && (
        <div className="bg-red-600/90 text-white text-center py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2 z-50 sticky top-0 backdrop-blur-sm animate-pulse shadow-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Cannot connect to backend server. API: {API_BASE}</span>
        </div>
      )}
      {/* Navbar */}
      <header className={`border-b sticky top-0 z-30 px-6 py-4 flex items-center justify-between transition-colors duration-200 ${
        theme === 'dark' ? 'border-slate-900 bg-slate-900/40 backdrop-blur-md' : 'border-slate-200 bg-white/80 backdrop-blur-md shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/30 rounded-lg flex items-center justify-center text-indigo-400">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className={`text-lg font-bold tracking-wide ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Schedule Notifier</h1>
            <span className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Real-time alerts</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme Toggle Button */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2 rounded-lg border transition-all duration-200 ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-sm'
            }`}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notification Button */}
          {notificationPermission !== 'granted' ? (
            <button
              onClick={handleRequestPermission}
              className="flex items-center gap-2 text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium px-3 py-1.5 rounded-full transition-all"
              title="Click to enable desktop alerts"
            >
              <BellOff className="w-4 h-4" />
              <span className="hidden sm:inline">Enable Alerts</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Alerts Enabled</span>
            </div>
          )}

          {/* User profile & logout */}
          <div className={`flex items-center gap-3 border-l pl-4 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="hidden md:flex flex-col text-right">
              <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className={`p-2 rounded-lg transition-all ${
                theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
              }`}
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Calendar Grid View (Takes 2 Cols) */}
        <section className={`lg:col-span-2 rounded-xl p-5 flex flex-col border transition-colors duration-200 ${
          theme === 'dark' ? 'bg-slate-900/30 border-slate-900' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          {/* Calendar Controller Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{monthName}</h2>
            <div className={`flex items-center gap-2 rounded-lg p-1 border transition-colors duration-200 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={handlePrevMonth}
                className={`p-1.5 rounded-md transition-all ${
                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className={`text-xs px-2.5 py-1 rounded transition-all font-medium ${
                  theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={handleNextMonth}
                className={`p-1.5 rounded-md transition-all ${
                  theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 7x5 Calendar Grid */}
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5 flex-1 select-none">
            {/* Trailing days of previous month */}
            {Array.from({ length: startDay }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className={`min-h-[85px] p-2 border rounded-lg flex flex-col justify-between transition-colors ${
                  theme === 'dark' ? 'bg-slate-950/20 border-slate-900/50 text-slate-700' : 'bg-slate-100/30 border-slate-100 text-slate-300'
                }`}
              >
                <span></span>
              </div>
            ))}

            {/* Days of current month */}
            {Array.from({ length: totalDays }).map((_, idx) => {
              const dayNum = idx + 1;
              const dayEvents = getEventsForDay(dayNum);
              
              const isToday =
                new Date().getDate() === dayNum &&
                new Date().getMonth() === currentMonth.getMonth() &&
                new Date().getFullYear() === currentMonth.getFullYear();

              const isSelected =
                selectedDate.getDate() === dayNum &&
                selectedDate.getMonth() === currentMonth.getMonth() &&
                selectedDate.getFullYear() === currentMonth.getFullYear();

              return (
                <div
                  key={`day-${dayNum}`}
                  onClick={() => handleSelectDay(dayNum)}
                  className={`min-h-[95px] p-2 border cursor-pointer rounded-lg flex flex-col justify-between transition-all group ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                      : isToday
                      ? (theme === 'dark' ? 'bg-slate-900 border-slate-700 text-indigo-400' : 'bg-slate-100 border-indigo-300 text-indigo-600 font-bold')
                      : (theme === 'dark' ? 'bg-slate-900/40 border-slate-900 hover:border-slate-800 text-slate-300' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 shadow-sm')
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isToday ? 'bg-indigo-500 text-slate-950 w-5 h-5 rounded-full flex items-center justify-center' : ''}`}>
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500"></span>
                    )}
                  </div>

                  {/* Micro list of events inside cell */}
                  <div className="mt-1 space-y-1 overflow-hidden flex-1 flex flex-col justify-end max-h-[60px]">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[9px] truncate px-1 py-0.5 rounded leading-tight font-medium border ${
                          ev.notified
                            ? (theme === 'dark' ? 'bg-slate-800/50 border-slate-800 text-slate-500 line-through' : 'bg-slate-105 border-slate-200 text-slate-400 line-through')
                            : isSelected
                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-200'
                            : (theme === 'dark' ? 'bg-slate-850 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600')
                        }`}
                      >
                        {ev.time} {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[8px] text-slate-500 pl-1 font-semibold">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Remaining empty cells to complete the 7x5 or grid look */}
            {Array.from({ length: 35 - (startDay + totalDays) > 0 ? 35 - (startDay + totalDays) : (42 - (startDay + totalDays) === 7 ? 0 : 42 - (startDay + totalDays)) }).map((_, idx) => (
              <div
                key={`empty-end-${idx}`}
                className={`min-h-[85px] p-2 border rounded-lg transition-colors ${
                  theme === 'dark' ? 'bg-slate-950/20 border-slate-900/50' : 'bg-slate-100/30 border-slate-100'
                }`}
              >
                <span></span>
              </div>
            ))}
          </div>
        </section>

        {/* Selected Day Agenda & Event Editor and Todo List (Takes 1 Col) */}
        <div className="flex flex-col gap-6">
          {/* Selected Day Agenda & Event Editor */}
          <section className={`rounded-xl p-5 flex flex-col gap-5 border transition-colors duration-200 ${
            theme === 'dark' ? 'bg-slate-900/30 border-slate-900' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className={`border-b pb-3 flex items-center justify-between ${theme === 'dark' ? 'border-slate-900' : 'border-slate-100'}`}>
              <div>
                <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Day Details</h3>
                <p className={`text-base font-bold mt-0.5 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{formattedSelectedDate}</p>
              </div>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg transition-all"
                  title="Add event"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Form for creation or editing (If expanded) */}
            {showAddForm && (
              <form onSubmit={handleCreateOrUpdateEvent} className={`border p-4 rounded-xl space-y-4 ${
                theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`flex items-center justify-between border-b pb-2 mb-2 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {editingEvent ? 'Edit Event' : 'New Event'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-205 text-slate-500 hover:text-slate-800'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label htmlFor="eventTitle" className={`block text-xs font-semibold uppercase mb-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    Event Title
                  </label>
                  <input
                    id="eventTitle"
                    name="eventTitle"
                    type="text"
                    required
                    placeholder="e.g. Dentists appointment"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className={`w-full border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                      theme === 'dark' 
                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-650' 
                        : 'bg-white border-slate-300 text-slate-950 placeholder-slate-400'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="eventTime" className={`block text-xs font-semibold uppercase mb-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    Time
                  </label>
                  <div className="relative">
                    <input
                      id="eventTime"
                      name="eventTime"
                      type="time"
                      required
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      className={`w-full border rounded-lg py-2 px-3 pl-9 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                        theme === 'dark'
                          ? 'bg-slate-950 border-slate-800 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-950'
                      }`}
                    />
                    <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg transition-all"
                  >
                    {editingEvent ? 'Update' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className={`text-sm font-medium py-2 px-3 rounded-lg transition-all ${
                      theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Events List for selected day */}
            <div className="flex-1 overflow-y-auto space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className={`h-full flex flex-col items-center justify-center text-center p-6 border border-dashed rounded-xl ${
                  theme === 'dark' ? 'text-slate-600 border-slate-900' : 'text-slate-400 border-slate-200'
                }`}>
                  <CalendarIcon className="w-10 h-10 mb-2 opacity-30" />
                  <span className="text-sm">No events scheduled</span>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold mt-2 underline"
                  >
                    Create one now
                  </button>
                </div>
              ) : (
                selectedDayEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`border rounded-xl p-3 flex items-start justify-between group transition-all ${
                      event.notified
                        ? (theme === 'dark' ? 'bg-slate-900/10 border-slate-900/60 opacity-60' : 'bg-slate-100/50 border-slate-200 opacity-65')
                        : (theme === 'dark' ? 'bg-slate-900/50 border-slate-900 hover:border-slate-800' : 'bg-slate-50 border-slate-200 hover:border-slate-305 shadow-sm')
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'} ${event.notified ? 'line-through text-slate-500' : ''}`}>
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{event.time}</span>
                        {event.notified && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${theme === 'dark' ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-500'}`}>
                            Notified
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(event)}
                        className={`p-1 rounded transition-all ${
                          theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-950'
                        }`}
                        title="Edit event"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className={`p-1 rounded transition-all ${
                          theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-red-400' : 'hover:bg-slate-200 text-slate-500 hover:text-red-600'
                        }`}
                        title="Delete event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Todo List Card */}
          <section className={`rounded-xl p-5 flex flex-col gap-4 border transition-colors duration-200 ${
            theme === 'dark' ? 'bg-slate-900/30 border-slate-900' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className={`border-b pb-3 flex items-center justify-between ${theme === 'dark' ? 'border-slate-900' : 'border-slate-100'}`}>
              <div>
                <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Todo List</h3>
                <p className={`text-xs ${theme === 'dark' ? 'text-slate-550' : 'text-slate-450'} mt-0.5`}>Tasks for this day</p>
              </div>
            </div>

            {/* Todo Input form */}
            <form onSubmit={handleAddTodo} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Add a new task..."
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                className={`flex-1 border rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-650' 
                    : 'bg-white border-slate-300 text-slate-950 placeholder-slate-400'
                }`}
              />
              <button
                type="submit"
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg transition-all"
                title="Add task"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            </form>

            {/* Todo List Container */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px]">
              {todos.length === 0 ? (
                <div className={`py-8 flex flex-col items-center justify-center text-center border border-dashed rounded-xl ${
                  theme === 'dark' ? 'text-slate-600 border-slate-900/60' : 'text-slate-400 border-slate-200'
                }`}>
                  <span className="text-xs font-medium">No tasks scheduled for today</span>
                </div>
              ) : (
                todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`border rounded-xl p-3 flex items-center justify-between group transition-all ${
                      todo.completed
                        ? (theme === 'dark' ? 'bg-slate-900/10 border-slate-900/60 opacity-60' : 'bg-slate-100/50 border-slate-200 opacity-65')
                        : (theme === 'dark' ? 'bg-slate-900/50 border-slate-900 hover:border-slate-800' : 'bg-slate-50 border-slate-200 hover:border-slate-305 shadow-sm')
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleTodo(todo.id, todo.completed)}
                        className={`w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer ${
                          theme === 'dark' ? 'border-slate-800 bg-slate-950 text-indigo-500' : 'border-slate-300 text-indigo-600'
                        }`}
                      />
                      <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'} ${todo.completed ? 'line-through text-slate-500 font-normal' : ''}`}>
                        {todo.title}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity transition-all ${
                        theme === 'dark' ? 'hover:bg-slate-800 text-slate-400 hover:text-red-400' : 'hover:bg-slate-200 text-slate-500 hover:text-red-600'
                      }`}
                      title="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Verification Success Modal */}
      {showVerificationSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md border rounded-2xl shadow-2xl p-8 text-center transition-all duration-300 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-950 shadow-xl'
          }`}>
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400 mx-auto mb-5 shadow-lg shadow-emerald-500/10">
              <Bell className="w-8 h-8" />
            </div>
            <h2 className={`text-2xl font-bold tracking-tight mb-3 ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>
              Welcome to Schedule Notifier! 🎉
            </h2>
            <p className={`text-sm mb-6 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Thank you for registering in **Schedule Notifier**. Your email has been verified successfully. Your account is now active and ready to use.
            </p>
            <button
              onClick={() => {
                setShowVerificationSuccess(false);
                setAuthMode('login');
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium py-3 rounded-lg shadow-lg shadow-indigo-600/20 transition-all duration-150"
            >
              Proceed to Sign In
            </button>
          </div>
        </div>
      )}

      {/* Verification Error Modal */}
      {verificationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-md border rounded-2xl shadow-2xl p-8 text-center transition-all duration-300 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-950 shadow-xl'
          }`}>
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-400 mx-auto mb-5 shadow-lg shadow-red-500/10">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className={`text-2xl font-bold tracking-tight mb-3 ${theme === 'dark' ? 'text-white' : 'text-slate-950'}`}>
              Verification Failed
            </h2>
            <p className={`text-sm mb-6 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              {verificationError || "The verification link is invalid or has expired. Please try registering again."}
            </p>
            <button
              onClick={() => setVerificationError('')}
              className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-medium py-3 rounded-lg transition-all duration-150"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme={theme === 'dark' ? 'dark' : 'light'} />
    </div>
  );
}
