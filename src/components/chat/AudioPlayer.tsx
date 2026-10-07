import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  url: string;
  originalName?: string;
  isMe?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  url,
  originalName = 'Voice message',
  isMe = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isReady, setIsReady] = useState(false);

  // Waveform bar heights (pseudo-random visual distribution for professional voice note aesthetic)
  const waveBars = [
    30, 45, 75, 60, 90, 40, 85, 95, 70, 50, 80, 100,
    65, 85, 45, 90, 75, 55, 70, 95, 60, 40, 65, 35
  ];

  const formatDuration = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsReady(true);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && (!duration || duration === 0)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('play', () => setIsPlaying(true));

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      role="region"
      aria-label="Voice message audio player"
      className={`flex items-center gap-3 p-2.5 rounded-2xl max-w-sm select-none transition-colors ${
        isMe
          ? 'bg-black/25 text-white'
          : 'bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-900 dark:text-neutral-100 border border-neutral-200/80 dark:border-neutral-700/60'
      }`}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play / Pause Toggle Button */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
          isMe
            ? 'bg-white text-indigo-700 hover:bg-neutral-100 active:scale-95 shadow-sm'
            : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 shadow-sm'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Timers */}
      <div className="flex-1 min-w-[130px] flex flex-col justify-center gap-1.5">
        <div
          role="slider"
          aria-label="Audio playback seek scrubber"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
          onClick={handleSeek}
          className="flex items-center gap-0.5 sm:gap-1 h-7 cursor-pointer group py-1"
        >
          {waveBars.map((h, i) => {
            const barRatio = (i / waveBars.length) * 100;
            const isFilled = barRatio <= progressPercent;
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={`w-1 rounded-full transition-colors ${
                  isMe
                    ? isFilled
                      ? 'bg-white'
                      : 'bg-white/35 group-hover:bg-white/50'
                    : isFilled
                    ? 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-neutral-300 dark:bg-neutral-600 group-hover:bg-neutral-400 dark:group-hover:bg-neutral-500'
                }`}
              />
            );
          })}
        </div>

        {/* Counter & Action */}
        <div className="flex items-center justify-between text-[10px] tabular-nums font-medium opacity-85">
          <span>{formatDuration(currentTime)}</span>
          <div className="flex items-center gap-1">
            <Volume2 className="w-3 h-3 opacity-60" aria-hidden="true" />
            <span>{formatDuration(duration || 0)}</span>
          </div>
        </div>
      </div>

      {/* Download Action */}
      <a
        href={url}
        download={originalName}
        aria-label={`Download voice note ${originalName}`}
        className={`p-1.5 rounded-lg opacity-70 hover:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shrink-0 ${
          isMe ? 'hover:bg-white/20' : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
        }`}
        title="Download audio"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
      </a>
    </div>
  );
};
