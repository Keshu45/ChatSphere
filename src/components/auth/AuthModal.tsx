import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Check, AlertCircle, Sparkles, CornerDownRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChatSphereLogo } from '../ui/ChatSphereLogo';
import { api } from '../../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  canClose?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, canClose = true }) => {
  const { login, register, quickSwitchUser } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Input states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Validation touch tracking
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, canClose]);

  if (!isOpen) return null;

  // Validation helpers
  const isUsernameShort = touched.username && username.length > 0 && username.length < 3;
  const isEmailInvalid = touched.email && email.length > 0 && (!email.includes('@') || !email.includes('.'));
  const isPasswordShort = touched.password && password.length > 0 && password.length < 8;
  const isPasswordMismatch = touched.confirmPassword && confirmPassword.length > 0 && confirmPassword !== password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const cleanIdentifier = loginIdentifier.trim();
        if (!cleanIdentifier) {
          throw new Error('Please enter your username or email');
        }
        if (!password) {
          throw new Error('Please enter your password');
        }

        await login(cleanIdentifier, password);
        toast.success('Signed in successfully');
        onClose();
      } else if (mode === 'register') {
        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (cleanUsername.length < 3 || cleanUsername.length > 30) {
          throw new Error('Username must be between 3 and 30 characters');
        }
        if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
          throw new Error('Username can only contain letters, numbers, and underscores');
        }
        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
          throw new Error('Please enter a valid email address');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }

        await register(cleanUsername, cleanEmail, password);
        toast.success(`Welcome @${cleanUsername}! Account created successfully.`);
        onClose();
      } else if (mode === 'forgot') {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          throw new Error('Please enter a valid email address');
        }
        const res = await api.auth.forgotPassword(cleanEmail);
        setSuccessMsg(res.message || 'Password reset link sent to your email');
        toast.success('Password reset instructions generated');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = async (demoUsername: string) => {
    setError(null);
    setIsLoading(true);
    try {
      await quickSwitchUser(demoUsername);
      toast.success(`Signed in as demo user @${demoUsername}`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: 'login' | 'register' | 'forgot') => {
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
    setTouched({});
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-xs p-4 animate-fade-in"
      onClick={() => {
        if (canClose) onClose();
      }}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/70">
          <div className="flex items-center gap-2.5">
            <ChatSphereLogo size="sm" showWordmark={true} />
            <span className="text-neutral-300 dark:text-neutral-700">|</span>
            <h3 id="auth-modal-title" className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Password Recovery'}
            </h3>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Tab Switcher */}
        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 p-1.5 bg-neutral-100/80 dark:bg-neutral-950/80 border-b border-neutral-200/70 dark:border-neutral-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 text-center rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 text-center rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate={false}>
          {error && (
            <div
              id="auth-error-message"
              role="alert"
              aria-live="assertive"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5 animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                {mode === 'login' && error.toLowerCase().includes('invalid credentials') && (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    Don&apos;t have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className="font-semibold underline cursor-pointer hover:text-rose-800 dark:hover:text-rose-200"
                    >
                      Click here to Create Account
                    </button>
                  </p>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5 animate-fade-in"
            >
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Login Identifier (Sign In Mode) */}
          {mode === 'login' && (
            <div>
              <label htmlFor="auth-credential-input" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Username or Email
              </label>
              <input
                id="auth-credential-input"
                type="text"
                required
                value={loginIdentifier}
                onChange={e => setLoginIdentifier(e.target.value)}
                placeholder="e.g. alex_rivera or user@example.com"
                aria-describedby={error ? 'auth-error-message' : undefined}
                className="w-full bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                autoFocus
              />
            </div>
          )}

          {/* Register: Username */}
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-credential-input" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Username
              </label>
              <input
                id="auth-credential-input"
                type="text"
                required
                value={username}
                onChange={e => {
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                  setTouched(prev => ({ ...prev, username: true }));
                }}
                onBlur={() => setTouched(prev => ({ ...prev, username: true }))}
                placeholder="e.g. janesmith"
                aria-describedby={error ? 'auth-error-message' : undefined}
                className={`w-full bg-neutral-50 dark:bg-neutral-950 border rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 transition-all ${
                  isUsernameShort
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                    : 'border-neutral-200 dark:border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500/20'
                }`}
                autoFocus
              />
              {isUsernameShort ? (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-rose-500 animate-fade-in">
                  <CornerDownRight className="w-3 h-3 shrink-0" />
                  <span>Username must have at least 3 characters</span>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1.5">
                  3–30 characters, letters, numbers, and underscores
                </p>
              )}
            </div>
          )}

          {/* Register or Forgot: Email */}
          {(mode === 'register' || mode === 'forgot') && (
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={e => {
                  setEmail(e.target.value.trim().toLowerCase());
                  setTouched(prev => ({ ...prev, email: true }));
                }}
                onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                placeholder="user@example.com"
                aria-describedby={error ? 'auth-error-message' : undefined}
                className={`w-full bg-neutral-50 dark:bg-neutral-950 border rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 transition-all ${
                  isEmailInvalid
                    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                    : 'border-neutral-200 dark:border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500/20'
                }`}
                autoFocus={mode === 'forgot'}
              />
              {isEmailInvalid && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-rose-500 animate-fade-in">
                  <CornerDownRight className="w-3 h-3 shrink-0" />
                  <span>Please enter a valid email (e.g. name@example.com)</span>
                </div>
              )}
            </div>
          )}

          {/* Password Input */}
          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-password" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer focus-visible:outline-none"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setTouched(prev => ({ ...prev, password: true }));
                  }}
                  onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                  placeholder="••••••••"
                  aria-describedby={error ? 'auth-error-message' : undefined}
                  className={`w-full bg-neutral-50 dark:bg-neutral-950 border rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 transition-all ${
                    isPasswordShort && mode === 'register'
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <>
                  {isPasswordShort ? (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-rose-500 animate-fade-in">
                      <CornerDownRight className="w-3 h-3 shrink-0" />
                      <span>Password must be at least 8 characters ({password.length}/8)</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1.5">
                      At least 8 characters
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Confirm Password (Register mode) */}
          {mode === 'register' && (
            <div>
              <label htmlFor="reg-confirm-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="reg-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    setTouched(prev => ({ ...prev, confirmPassword: true }));
                  }}
                  onBlur={() => setTouched(prev => ({ ...prev, confirmPassword: true }))}
                  placeholder="••••••••"
                  aria-describedby={error ? 'auth-error-message' : undefined}
                  className={`w-full bg-neutral-50 dark:bg-neutral-950 border rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 transition-all ${
                    isPasswordMismatch
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500/20'
                  }`}
                />
              </div>
              {isPasswordMismatch && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-rose-500 animate-fade-in">
                  <CornerDownRight className="w-3 h-3 shrink-0" />
                  <span>Passwords do not match</span>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
            </button>
          </div>

          {/* Switch helper links */}
          <div className="text-center text-xs text-neutral-500 dark:text-neutral-400 pt-1">
            {mode === 'login' ? (
              <p>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Create one
                </button>
              </p>
            ) : mode === 'register' ? (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-neutral-600 dark:text-neutral-300 hover:underline cursor-pointer"
              >
                &larr; Back to Sign In
              </button>
            )}
          </div>

          {/* Quick Demo 1-Click Testing */}
          {mode === 'login' && import.meta.env.VITE_DEMO_MODE !== 'false' && (
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 block mb-2 text-center">
                Quick Demo Sign In (1-Click):
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemo('alex_rivera')}
                  disabled={isLoading}
                  className="py-2 px-2.5 text-[11px] font-medium rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  Alex Rivera
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('sam_chen')}
                  disabled={isLoading}
                  className="py-2 px-2.5 text-[11px] font-medium rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                  Sam Chen
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
