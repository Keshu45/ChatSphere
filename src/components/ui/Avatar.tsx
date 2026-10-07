import React, { useState } from 'react';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showStatus?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  size = 'md',
  isOnline = false,
  showStatus = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  }[size];

  const statusSizeClasses = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-3.5 h-3.5',
  }[size];

  // Derive stable fallback color from name with proper light/dark contrast
  const colors = [
    'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-700/50',
    'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700/50',
    'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-200 border-sky-200 dark:border-sky-700/50',
    'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-700/50',
    'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 border-purple-200 dark:border-purple-700/50',
    'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200 border-rose-200 dark:border-rose-700/50',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  const colorClass = colors[Math.abs(hash) % colors.length];

  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  return (
    <div className={`relative inline-flex shrink-0 ${sizeClasses} ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
          className="w-full h-full rounded-full object-cover border border-neutral-200 dark:border-neutral-800 shadow-2xs"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center font-semibold border ${colorClass} select-none shadow-2xs`}
        >
          {getInitials(name)}
        </div>
      )}

      {showStatus && (
        <span
          role="status"
          aria-label={isOnline ? `${name} is online` : `${name} is offline`}
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white dark:ring-neutral-950 transition-colors ${statusSizeClasses} ${
            isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-neutral-400 dark:bg-neutral-600'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        >
          <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
        </span>
      )}
    </div>
  );
};
