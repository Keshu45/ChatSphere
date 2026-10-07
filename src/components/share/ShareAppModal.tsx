import React, { useState } from 'react';
import { X, Copy, Check, Share2, Send, ExternalLink, QrCode } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ChatSphereLogo } from '../ui/ChatSphereLogo';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SHORT_URL = (import.meta.env.VITE_SHARE_URL as string) || 'https://tinyurl.com/Chatsphere';
export const FULL_URL = (import.meta.env.VITE_APP_URL as string) || 'https://ais-dev-hhutx3hva3x6a34i6sdvo6-299490919093.asia-southeast1.run.app';

export const ShareAppModal: React.FC<ShareAppModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedCurrent, setCopiedCurrent] = useState(false);

  const shareUrl = (import.meta.env.VITE_SHARE_URL as string) || SHORT_URL;
  const currentUrl = (import.meta.env.VITE_APP_URL as string) || (typeof window !== 'undefined' && window.location.origin.startsWith('http') ? window.location.origin : FULL_URL);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyShort = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    toast.success(`Share link copied! (${shareUrl})`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCurrent = () => {
    navigator.clipboard?.writeText(currentUrl);
    setCopiedCurrent(true);
    toast.success('Direct app link copied!');
    setTimeout(() => setCopiedCurrent(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Chat with me on ChatSphere: ${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ChatSphere - Real-Time Team & Friends Chat',
          text: 'Join me on ChatSphere to chat in real-time!',
          url: shareUrl,
        });
        toast.success('Shared successfully!');
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyShort();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-app-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <ChatSphereLogo size="sm" showWordmark={true} />
            <span className="text-neutral-300 dark:text-neutral-700">|</span>
            <h3 id="share-app-modal-title" className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              Share App Link
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog (Esc)"
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1">
              Short Link with ChatSphere name:
            </span>
            <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl p-2">
              <span className="flex-1 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold truncate select-all">
                {shareUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyShort}
                aria-label="Copy short link"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Quick Share Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-all shadow-xs active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              WhatsApp Share
            </button>

            {typeof navigator !== 'undefined' && 'share' in navigator ? (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-800 dark:bg-neutral-700 hover:bg-neutral-700 text-white text-xs font-semibold cursor-pointer transition-all shadow-xs active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share via App
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCopyCurrent}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold cursor-pointer transition-all active:scale-95"
              >
                {copiedCurrent ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCurrent ? 'Link Copied' : 'Copy Direct Link'}
              </button>
            )}
          </div>

          {/* Helpful Information Box */}
          <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <span>🚀</span> Friends can join instantly without installing!
            </p>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
              When your friend opens this short link, they can register in seconds and you can chat with them immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
