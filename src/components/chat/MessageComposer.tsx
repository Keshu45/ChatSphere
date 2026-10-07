import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, X, Image as ImageIcon, Loader2, Mic, MicOff, Radio, Trash2, Bold, Italic, Code } from 'lucide-react';
import { Message, MessageAttachment } from '../../types/chat';
import { api } from '../../lib/api';
import { sound } from '../../lib/sound';
import { EmojiPicker } from './EmojiPicker';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';

interface MessageComposerProps {
  conversationId: string;
  replyingTo: Message | null;
  editingMessage: Message | null;
  onSendMessage: (text: string, attachments?: MessageAttachment[]) => Promise<void>;
  onEditMessage: (messageId: string, newText: string) => Promise<void>;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🎉', '🚀', '👋', '😂', '✨', '🙌', '💯', '🤔', '👀', '💡', '✅', '⚡', '☕'];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  conversationId,
  replyingTo,
  editingMessage,
  onSendMessage,
  onEditMessage,
  onCancelReply,
  onCancelEdit,
}) => {
  const { emitTypingStart, emitTypingStop } = useSocket();
  const toast = useToast();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Audio voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Voice Input (SpeechRecognition API) state
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingActiveRef = useRef(false);

  // If entering edit mode, populate text
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [text]);

  const handleTyping = useCallback(() => {
    if (!isTypingActiveRef.current) {
      isTypingActiveRef.current = true;
      emitTypingStart(conversationId);
    }

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      isTypingActiveRef.current = false;
      emitTypingStop(conversationId);
    }, 2000);
  }, [conversationId, emitTypingStart, emitTypingStop]);

  const stopTypingNow = useCallback(() => {
    if (isTypingActiveRef.current) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      isTypingActiveRef.current = false;
      emitTypingStop(conversationId);
    }
  }, [conversationId, emitTypingStop]);

  // Keyboard shortcut listener (Escape to cancel edit/reply/emoji/recording/voice input)
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isListening) {
          stopVoiceInput();
        } else if (isRecording) {
          cancelRecording();
        } else if (showEmojiPicker) {
          setShowEmojiPicker(false);
        } else if (editingMessage) {
          onCancelEdit();
        } else if (replyingTo) {
          onCancelReply();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [showEmojiPicker, editingMessage, replyingTo, isRecording, isListening, onCancelEdit, onCancelReply]);

  // Cleanup recording & speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds maximum upload size (10MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const res = await api.uploads.upload({
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            base64Data,
          });
          setAttachments(prev => [...prev, res.attachment]);
          toast.success('File uploaded successfully');
        } catch (uploadErr: any) {
          toast.error(`Upload failed: ${uploadErr.message}`);
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file from disk');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploading(false);
      toast.error(`File processing error: ${err.message}`);
    }
  };

  // Audio Voice Recording Handlers
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Microphone recording is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error('Could not access microphone. Please allow microphone permission.');
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recordedMime = recorder.mimeType || 'audio/webm';

    recorder.onstop = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });
      audioChunksRef.current = [];
      setIsRecording(false);

      if (audioBlob.size === 0) {
        toast.error('Voice recording was empty');
        return;
      }

      setIsSending(true);
      try {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Data = (reader.result as string).split(',')[1];
            const ext = recordedMime.includes('ogg') ? 'ogg' : recordedMime.includes('mp4') ? 'mp4' : 'webm';
            const originalName = `voice_note_${Date.now()}.${ext}`;

            const res = await api.uploads.upload({
              originalName,
              mimeType: recordedMime.split(';')[0],
              size: audioBlob.size,
              base64Data,
            });

            const voiceDurationStr = `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;
            await onSendMessage(`🎤 Voice message (${voiceDurationStr})`, [res.attachment]);
            sound.playSent();
          } catch (err: any) {
            toast.error(`Failed to send voice message: ${err.message}`);
          } finally {
            setIsSending(false);
            setRecordingSeconds(0);
          }
        };
      } catch (err: any) {
        setIsSending(false);
        toast.error(`Recording error: ${err.message}`);
      }
    };

    recorder.stop();
  };

  // Voice Input (SpeechRecognition API) handlers
  const startVoiceInput = () => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

      baseTextRef.current = text;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const base = baseTextRef.current;
        const separator = base && !base.endsWith(' ') ? ' ' : '';
        const newText = `${base}${separator}${transcript}`.trimStart();
        setText(newText);
        handleTyping();

        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          toast.error(`Speech recognition: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err: any) {
      toast.error(`Could not start speech recognition: ${err.message}`);
      setIsListening(false);
    }
  };

  const stopVoiceInput = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  const handleSubmit = async () => {
    const textToSend = text.trim();
    const attachmentsToSend = [...attachments];

    if (!textToSend && attachmentsToSend.length === 0) return;

    if (isListening) {
      stopVoiceInput();
    }

    stopTypingNow();

    // Instant optimistic clearing for zero-delay UX
    setText('');
    setAttachments([]);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (editingMessage) {
        setIsSending(true);
        await onEditMessage(editingMessage.id, textToSend);
      } else {
        sound.playSent();
        await onSendMessage(textToSend, attachmentsToSend);
      }
    } catch (err: any) {
      toast.error(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const applyFormatting = (type: 'bold' | 'italic' | 'code') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = text.slice(start, end);

    let prefix = '';
    let suffix = '';
    let placeholder = '';

    if (type === 'bold') {
      prefix = '**';
      suffix = '**';
      placeholder = 'bold text';
    } else if (type === 'italic') {
      prefix = '*';
      suffix = '*';
      placeholder = 'italic text';
    } else if (type === 'code') {
      if (selected.includes('\n')) {
        prefix = '```\n';
        suffix = '\n```';
        placeholder = 'code snippet';
      } else {
        prefix = '`';
        suffix = '`';
        placeholder = 'code';
      }
    }

    const contentToWrap = selected || placeholder;
    const replacement = `${prefix}${contentToWrap}${suffix}`;
    const newText = text.slice(0, start) + replacement + text.slice(end);
    setText(newText);
    handleTyping();

    setTimeout(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + placeholder.length);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      applyFormatting('bold');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      applyFormatting('italic');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'e' || e.key === '`')) {
      e.preventDefault();
      applyFormatting('code');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const addEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? text.length;
      const end = textarea.selectionEnd ?? text.length;
      const newText = text.substring(0, start) + emoji + text.substring(end);
      setText(newText);
      handleTyping();
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText(prev => prev + emoji);
      handleTyping();
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="relative border-t border-neutral-200/80 dark:border-neutral-800/80 bg-white/95 dark:bg-neutral-950/95 px-3 py-1.5 sm:px-4 sm:py-2 backdrop-blur-md shrink-0 z-20 transition-colors">
      {/* Replying Context Banner */}
      {replyingTo && (
        <div className="mb-1.5 flex items-center justify-between p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800 text-xs animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1 h-6 rounded-full bg-indigo-500 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <span className="text-neutral-500 dark:text-neutral-400">Replying to </span>
              <strong className="text-neutral-900 dark:text-neutral-200 font-semibold">{replyingTo.sender?.username || 'user'}</strong>
              <p className="text-neutral-500 dark:text-neutral-400 truncate max-w-xs sm:max-w-md">{replyingTo.text}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply (Esc)"
            className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="mb-1.5 flex items-center justify-between p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-1 h-6 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
            <div>
              <strong className="text-amber-800 dark:text-amber-300 font-semibold">Editing message</strong>
              <p className="text-amber-700/80 dark:text-amber-400/80 text-[11px]">Press Escape to cancel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancel editing (Esc)"
            className="p-1 text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 rounded focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Uploaded Attachments Preview Badges */}
      {attachments.length > 0 && (
        <div role="list" aria-label="Attached files" className="mb-1.5 flex flex-wrap gap-1.5 animate-fade-in">
          {attachments.map((att, idx) => (
            <div
              key={att.id || idx}
              role="listitem"
              className="flex items-center gap-1.5 p-1 pl-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200"
            >
              {att.mimeType.startsWith('image/') ? (
                <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
              ) : (
                <Paperclip className="w-3.5 h-3.5 text-neutral-500 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate max-w-[140px] sm:max-w-[200px] text-xs">{att.originalName}</span>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                aria-label={`Remove attachment ${att.originalName}`}
                className="p-0.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded focus-visible:ring-1 focus-visible:ring-indigo-500 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Box with Refined Focus State & Subtle Ring Elevation */}
      <div className="message-composer-container flex flex-col bg-neutral-100/90 dark:bg-neutral-900/80 hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-neutral-200/90 dark:border-neutral-800/80 rounded-xl p-1 sm:p-1.5 outline-none focus-within:outline-none focus-within:bg-white dark:focus-within:bg-neutral-900 focus-within:border-indigo-500/50 dark:focus-within:border-indigo-400/50 focus-within:shadow-[0_0_0_2px_rgba(99,102,241,0.2)] transition-all duration-200">
        {/* Formatting Toolbar - Slim compact header */}
        {!isRecording && (
          <div
            role="toolbar"
            aria-label="Formatting toolbar"
            className="flex items-center gap-0.5 px-0.5 pb-0.5 mb-0.5 border-b border-neutral-200/50 dark:border-neutral-800/50 text-neutral-500 dark:text-neutral-400 select-none text-[11px]"
          >
            <button
              type="button"
              onClick={() => applyFormatting('bold')}
              aria-label="Bold text"
              title="Bold (**text** or Ctrl+B)"
              className="p-1 rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
            >
              <Bold className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('italic')}
              aria-label="Italic text"
              title="Italic (*text* or Ctrl+I)"
              className="p-1 rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
            >
              <Italic className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting('code')}
              aria-label="Code snippet"
              title="Code snippet (`code` or Ctrl+E)"
              className="p-1 rounded-md hover:bg-neutral-200/60 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors focus-visible:ring-1 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer"
            >
              <Code className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Input Controls Row */}
        <div className="flex items-end gap-1 sm:gap-1.5 w-full">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            id="file-upload-input"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading || isSending || isRecording}
            accept="image/*,audio/*,.pdf,.txt,.md,.json,.zip"
            aria-label="Upload file attachment"
          />

        {/* Attachment Button */}
        {!isRecording && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isSending}
            aria-label="Attach image or file"
            className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none disabled:opacity-50 cursor-pointer shrink-0"
            title="Attach image or file (max 10MB)"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" aria-hidden="true" />
            ) : (
              <Paperclip className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Emoji Button & Rich Picker Component */}
        {!isRecording && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'}
              aria-expanded={showEmojiPicker}
              className={`p-1.5 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer ${
                showEmojiPicker
                  ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
              }`}
              title="Emoji"
            >
              <Smile className="w-4 h-4" aria-hidden="true" />
            </button>

            <EmojiPicker
              isOpen={showEmojiPicker}
              onSelect={addEmoji}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        {/* Voice Input (Speech-to-Text) Button */}
        {!isRecording && (
          <button
            type="button"
            onClick={toggleVoiceInput}
            aria-label="Voice Input"
            aria-pressed={isListening}
            className={`p-1.5 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer shrink-0 ${
              isListening
                ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-500/40 animate-pulse'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800'
            }`}
            title={isListening ? 'Stop Voice Input' : 'Voice Input (Speech to text)'}
          >
            {isListening ? (
              <MicOff className="w-4 h-4 text-white" aria-hidden="true" />
            ) : (
              <Mic className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Dynamic Multiline Textarea OR Live Audio Recording View */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between gap-2 px-2.5 py-1 bg-rose-50/60 dark:bg-rose-950/20 rounded-lg border border-rose-200/60 dark:border-rose-900/40 animate-fade-in min-h-[32px]">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600" />
              </span>
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Recording
              </span>
              <span className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-200 tabular-nums">
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>

            {/* Simulated Live Audio Waveform Bars */}
            <div className="hidden sm:flex items-center gap-1 h-4">
              {[35, 65, 95, 55, 80, 45, 100, 70, 40].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className="w-0.5 bg-rose-500 rounded-full animate-pulse"
                />
              ))}
            </div>

            {/* Cancel Recording Action */}
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="Cancel voice recording (Esc)"
              className="p-1 text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-100/70 dark:hover:bg-rose-900/40 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none cursor-pointer"
              title="Cancel recording (Esc)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex-1 relative flex items-center min-w-0">
            <textarea
              ref={textareaRef}
              id="message-composer-textarea"
              value={text}
              onChange={e => {
                setText(e.target.value);
                handleTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening... Speak to transcribe...' : editingMessage ? 'Edit your message...' : 'Type a message...'}
              rows={1}
              aria-label="Type message content"
              className="w-full bg-transparent text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 resize-none py-1 px-1 pr-16 border-0 outline-none focus:outline-none focus:ring-0 min-h-[30px] max-h-28 overflow-y-auto leading-relaxed"
            />
            {isListening && (
              <div className="absolute right-1.5 top-1 flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 pointer-events-none animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                Listening
              </div>
            )}
          </div>
        )}

        {/* Action Controls: Send vs Voice Recording */}
        {isRecording ? (
          <button
            type="button"
            onClick={stopAndSendRecording}
            disabled={isSending}
            aria-label="Send message"
            className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0"
            title="Send voice note"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        ) : text.trim() || attachments.length > 0 ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={editingMessage ? isSending : false}
            aria-label={editingMessage ? 'Save edited message' : 'Send message'}
            className="p-1.5 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer active:scale-95"
            title={editingMessage ? 'Save changes' : 'Send message'}
          >
            {editingMessage && isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={isSending || isUploading || isListening}
            aria-label="Record voice message"
            className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none cursor-pointer active:scale-95 shrink-0"
            title="Record voice note"
          >
            <Radio className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        </div>
      </div>
    </div>
  );
};
