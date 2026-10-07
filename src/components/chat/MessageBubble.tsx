import React, { useState } from 'react';
import { Message, SafeUser } from '../../types/chat';
import { Avatar } from '../ui/Avatar';
import { ReceiptCheckmarks } from './ReceiptCheckmarks';
import { AudioPlayer } from './AudioPlayer';
import { Reply, Edit2, Trash2, Download, FileText, X } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  currentUser: SafeUser | null;
  isGroup: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
}

const renderInlineFormatting = (text: string, keyPrefix: string): React.ReactNode => {
  const inlineRegex = /(`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      elements.push(text.slice(lastIdx, m.index));
    }
    if (m[2] !== undefined) {
      elements.push(
        <code
          key={`${keyPrefix}-code-${m.index}`}
          className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-xs"
        >
          {m[2]}
        </code>
      );
    } else if (m[3] !== undefined) {
      elements.push(
        <strong key={`${keyPrefix}-bold-${m.index}`} className="font-bold">
          {m[3]}
        </strong>
      );
    } else if (m[4] !== undefined) {
      elements.push(
        <em key={`${keyPrefix}-italic-${m.index}`} className="italic">
          {m[4]}
        </em>
      );
    }
    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < text.length) {
    elements.push(text.slice(lastIdx));
  }

  return elements.length === 1 ? elements[0] : <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
};

const renderFormattedContent = (content: string): React.ReactNode => {
  if (!content.includes('*') && !content.includes('`')) {
    return content;
  }

  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderInlineFormatting(content.slice(lastIndex, match.index), `text-${lastIndex}`));
    }
    const codeContent = match[1].replace(/^\n+|\n+$/g, '');
    parts.push(
      <pre
        key={`block-${match.index}`}
        className="my-1.5 p-2 rounded-lg bg-black/10 dark:bg-black/30 font-mono text-xs overflow-x-auto whitespace-pre leading-normal border border-black/5 dark:border-white/5"
      >
        <code>{codeContent}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(renderInlineFormatting(content.slice(lastIndex), `text-${lastIndex}`));
  }

  return parts;
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUser,
  isGroup,
  onReply,
  onEdit,
  onDelete,
}) => {
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const isMe = message.senderId === currentUser?.id;
  const isDeleted = Boolean(message.deletedAt);

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      role="article"
      aria-label={`Message from ${message.sender?.username || (isMe ? 'you' : 'user')}`}
      className={`group relative flex gap-2.5 my-1.5 px-2 py-0.5 rounded-xl transition-colors hover:bg-neutral-200/40 dark:hover:bg-neutral-900/30 ${
        isMe ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Sender Avatar */}
      <Avatar
        name={message.sender?.username || 'user'}
        src={message.sender?.avatar}
        size="sm"
        className="mt-0.5 shrink-0"
      />

      {/* Bubble Container */}
      <div className={`relative flex flex-col max-w-[85%] sm:max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'}`}>
        {/* Sender Name in Group Chat */}
        {isGroup && !isMe && message.sender && (
          <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-0.5 px-1 truncate max-w-full">
            {message.sender.username}
          </span>
        )}

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3.5 py-2 shadow-2xs text-sm border max-w-full transition-all ${
            isMe
              ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 dark:from-indigo-600 dark:to-indigo-700 border-indigo-500/30 text-white rounded-tr-xs shadow-indigo-500/5'
              : 'bg-white border-neutral-200/90 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-100 rounded-tl-xs shadow-neutral-900/5'
          } ${isDeleted ? 'opacity-70 italic border-dashed border-neutral-300 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/50 text-neutral-500 dark:text-neutral-400' : ''}`}
        >
          {/* Reply Context Banner */}
          {message.replyTo && (
            <div
              className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs border-l-2 max-w-full overflow-hidden ${
                isMe
                  ? 'border-white/80 bg-black/20 text-indigo-100'
                  : 'border-indigo-500 bg-neutral-100 dark:bg-neutral-950/60 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <div className="font-semibold mb-0.5 truncate">{message.replyTo.senderUsername}</div>
              <div className="line-clamp-1 truncate opacity-90">{message.replyTo.text}</div>
            </div>
          )}

          {/* Attachments (Viewportsafe & Never Overflows) */}
          {message.attachments && message.attachments.length > 0 && !isDeleted && (
            <div className="mb-2 space-y-2 max-w-full">
              {message.attachments.map((att) => {
                const isImg = att.mimeType.startsWith('image/');
                const isAudio = att.mimeType.startsWith('audio/');

                if (isImg) {
                  return (
                    <div key={att.id} className="overflow-hidden rounded-lg max-w-full sm:max-w-sm">
                      <img
                        src={att.url}
                        alt={att.originalName}
                        tabIndex={0}
                        role="button"
                        aria-label={`View enlarged image: ${att.originalName}`}
                        className="cursor-pointer max-h-60 sm:max-h-72 object-cover w-full rounded-lg hover:opacity-95 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                        onClick={() => setImageModalUrl(att.url)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setImageModalUrl(att.url);
                          }
                        }}
                      />
                    </div>
                  );
                }

                if (isAudio) {
                  return (
                    <div key={att.id} className="max-w-full my-1">
                      <AudioPlayer url={att.url} originalName={att.originalName} isMe={isMe} />
                    </div>
                  );
                }

                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-100/80 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 max-w-full"
                  >
                    <FileText className="w-5 h-5 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-900 dark:text-neutral-200 truncate">{att.originalName}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">{formatFileSize(att.size)}</p>
                    </div>
                    <a
                      href={att.url}
                      download={att.originalName}
                      aria-label={`Download file ${att.originalName}`}
                      className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0"
                      title="Download file"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {/* Text Message Content (Full Word Wrapping Safe) */}
          <div className="whitespace-pre-wrap break-words leading-relaxed select-text overflow-hidden">
            {isDeleted ? (
              <span className="italic text-neutral-400 dark:text-neutral-500">{message.text}</span>
            ) : (
              renderFormattedContent(message.text)
            )}
          </div>

          {/* Metadata Footer: timestamp, edited status, receipts */}
          <div
            className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] select-none ${
              isMe ? 'text-indigo-200/90 dark:text-indigo-200/80' : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            {message.editedAt && (
              <span className="text-[10px] opacity-75" title={`Edited on ${new Date(message.editedAt).toLocaleString()}`}>
                (edited)
              </span>
            )}
            <time dateTime={message.createdAt} className="tabular-nums">
              {formatTime(message.createdAt)}
            </time>
            {isMe && !isDeleted && (
              <ReceiptCheckmarks status={message.status} className="ml-0.5 shrink-0" />
            )}
          </div>
        </div>

        {/* Floating Action Toolbar */}
        {!isDeleted && (
          <div
            role="toolbar"
            aria-label="Message actions"
            className={`absolute -top-3.5 ${
              isMe ? 'right-2' : 'left-2 sm:left-auto sm:right-2'
            } z-10 flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-white/95 dark:bg-neutral-900/95 border border-neutral-200/90 dark:border-neutral-800 shadow-md backdrop-blur-md opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-150 select-none scale-95 group-hover:scale-100 group-focus-within:scale-100`}
          >
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label="Reply to message"
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(message.text)}
              aria-label="Copy message text"
              className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
              title="Copy text"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            {isMe && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(message)}
                  aria-label="Edit message"
                  className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                  title="Edit"
                >
                  <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  aria-label="Delete message"
                  className="p-1 rounded-md text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Enlarged Image Modal */}
      {imageModalUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged image view"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Escape') setImageModalUrl(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setImageModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setImageModalUrl(null)}
              aria-label="Close image preview (Esc)"
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <img
              src={imageModalUrl}
              alt="Enlarged preview"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
