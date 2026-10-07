import React from 'react';

interface TypingIndicatorProps {
  usernames: string[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ usernames }) => {
  if (!usernames || usernames.length === 0) return null;

  let text = '';
  if (usernames.length === 1) {
    text = `${usernames[0]} is typing...`;
  } else if (usernames.length === 2) {
    text = `${usernames[0]} and ${usernames[1]} are typing...`;
  } else {
    text = `${usernames[0]}, ${usernames[1]} and ${usernames.length - 2} others are typing...`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-2 px-4 py-1.5 text-xs text-neutral-400 select-none animate-fade-in"
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" />
      </div>
      <span className="font-normal italic">{text}</span>
    </div>
  );
};
