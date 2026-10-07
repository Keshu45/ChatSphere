import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 4000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, message, type, duration };

      setToasts(prev => [...prev.slice(-4), newToast]); // Keep max 5 active

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  const success = useCallback((message: string, duration?: number) => {
    showToast(message, 'success', duration);
  }, [showToast]);

  const error = useCallback((message: string, duration?: number) => {
    showToast(message, 'error', duration);
  }, [showToast]);

  const info = useCallback((message: string, duration?: number) => {
    showToast(message, 'info', duration);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, success, error, info }}>
      {children}
      {/* Toast Notification Container */}
      <aside
        aria-label="System notifications"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2 sm:p-0"
      >
        {toasts.map(toast => {
          const isError = toast.type === 'error';
          const isSuccess = toast.type === 'success';

          return (
            <div
              key={toast.id}
              role={isError ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border text-xs font-medium transition-all animate-fade-in ${
                isError
                  ? 'bg-red-950/90 text-red-100 border-red-800/80 dark:bg-red-950/90 dark:text-red-100 dark:border-red-800/80'
                  : isSuccess
                  ? 'bg-emerald-950/90 text-emerald-100 border-emerald-800/80 dark:bg-emerald-950/90 dark:text-emerald-100 dark:border-emerald-800/80'
                  : 'bg-neutral-900/95 text-neutral-100 border-neutral-700/80 dark:bg-neutral-900/95 dark:text-neutral-100 dark:border-neutral-700/80'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isError && <AlertCircle className="w-4 h-4 text-red-400" aria-hidden="true" />}
                {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
                {!isError && !isSuccess && <Info className="w-4 h-4 text-indigo-400" aria-hidden="true" />}
              </div>
              <div className="flex-1 break-words leading-relaxed">{toast.message}</div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity p-0.5 rounded focus-visible:ring-1 focus-visible:ring-white"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
