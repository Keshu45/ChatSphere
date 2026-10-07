import React from 'react';

export interface ChatSphereLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  withGlow?: boolean;
  className?: string;
}

export const ChatSphereLogo: React.FC<ChatSphereLogoProps> = ({
  size = 'md',
  showWordmark = true,
  withGlow = false,
  className = '',
}) => {
  const iconSizes = {
    xs: 'w-5 h-5',
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-14 h-14',
  };

  const textSizes = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Dynamic Geometric Sphere & Conversation Node */}
      <div className={`relative shrink-0 ${iconSizes[size]} flex items-center justify-center`}>
        {withGlow && (
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-600/35 via-violet-500/25 to-cyan-400/35 blur-md pointer-events-none -z-10 animate-pulse" />
        )}
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-xs"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="cs-gradient-primary" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#4F46E5" />     {/* Indigo-600 */}
              <stop offset="50%" stopColor="#7C3AED" />    {/* Violet-600 */}
              <stop offset="100%" stopColor="#06B6D4" />   {/* Cyan-500 */}
            </linearGradient>
            <linearGradient id="cs-gradient-secondary" x1="44" y1="8" x2="8" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />  {/* Sky-400 */}
              <stop offset="100%" stopColor="#4338CA" stopOpacity="0.85" />{/* Indigo-700 */}
            </linearGradient>
            <radialGradient id="cs-sphere-ambient" cx="45%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#A5B4FC" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Ambient Glow Aura */}
          <circle cx="24" cy="24" r="21" fill="url(#cs-sphere-ambient)" />

          {/* Precision Orbital Ring 1: Longitudinal Meridian */}
          <ellipse
            cx="24"
            cy="24"
            rx="19"
            ry="9"
            transform="rotate(-25 24 24)"
            stroke="url(#cs-gradient-primary)"
            strokeWidth="2.75"
            strokeLinecap="round"
          />

          {/* Precision Orbital Ring 2: Equatorial Chat Loop with Signal Pulses */}
          <ellipse
            cx="24"
            cy="24"
            rx="19"
            ry="8.5"
            transform="rotate(38 24 24)"
            stroke="url(#cs-gradient-secondary)"
            strokeWidth="2.5"
            strokeDasharray="14 3.5 6 3.5"
            strokeLinecap="round"
          />

          {/* Speech Bubble Node tail (harmonized with sphere curvature) */}
          <path
            d="M17.5 28 L12.5 36.5 L22.5 32.5 Z"
            fill="url(#cs-gradient-primary)"
          />

          {/* Central Communication Core Sphere */}
          <circle
            cx="24"
            cy="24"
            r="10.5"
            fill="url(#cs-gradient-primary)"
          />

          {/* Inner Light Specular Highlight on Core */}
          <ellipse cx="21" cy="20.5" rx="5" ry="2.75" fill="#FFFFFF" fillOpacity="0.35" />

          {/* Satellite Sync Node */}
          <circle cx="39" cy="14" r="3.25" fill="#38BDF8" />
          <circle cx="39" cy="14" r="1.5" fill="#FFFFFF" />
        </svg>
      </div>

      {showWordmark && (
        <div className="flex items-baseline tracking-tight font-sans">
          <span className={`${textSizes[size]} font-bold text-neutral-900 dark:text-neutral-50`}>
            Chat
          </span>
          <span
            className={`${textSizes[size]} font-extrabold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 dark:from-indigo-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent ml-0.5`}
          >
            Sphere
          </span>
        </div>
      )}
    </div>
  );
};
