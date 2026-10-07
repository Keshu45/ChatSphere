import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Smile, ThumbsUp, Heart, Sparkles, Coffee, Cat, Activity } from 'lucide-react';

export interface EmojiItem {
  char: string;
  name: string;
  category: string;
  keywords: string[];
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const EMOJI_CATEGORIES = [
  { id: 'quick', label: 'Quick', icon: Sparkles },
  { id: 'smileys', label: 'Smileys', icon: Smile },
  { id: 'gestures', label: 'Gestures', icon: ThumbsUp },
  { id: 'hearts', label: 'Hearts', icon: Heart },
  { id: 'nature', label: 'Nature', icon: Cat },
  { id: 'food', label: 'Food', icon: Coffee },
  { id: 'objects', label: 'Objects', icon: Activity },
];

const EMOJI_DATABASE: EmojiItem[] = [
  // Quick / Frequently Used
  { char: '👍', name: 'thumbs up', category: 'quick', keywords: ['yes', 'approve', 'like', 'good', 'ok', '+1'] },
  { char: '❤️', name: 'red heart', category: 'quick', keywords: ['love', 'like', 'heart'] },
  { char: '🔥', name: 'fire', category: 'quick', keywords: ['hot', 'lit', 'flame', 'awesome'] },
  { char: '😂', name: 'face with tears of joy', category: 'quick', keywords: ['laugh', 'lol', 'haha', 'funny', 'crying'] },
  { char: '🎉', name: 'party popper', category: 'quick', keywords: ['celebrate', 'congrats', 'party', 'tada'] },
  { char: '✨', name: 'sparkles', category: 'quick', keywords: ['shine', 'magic', 'clean', 'new', 'star'] },
  { char: '🚀', name: 'rocket', category: 'quick', keywords: ['launch', 'ship', 'fast', 'blast', 'space'] },
  { char: '👀', name: 'eyes', category: 'quick', keywords: ['look', 'see', 'watch', 'peek', 'interested'] },
  { char: '💡', name: 'light bulb', category: 'quick', keywords: ['idea', 'bright', 'smart', 'think'] },
  { char: '💯', name: 'hundred points', category: 'quick', keywords: ['100', 'perfect', 'score', 'keep it 100'] },
  { char: '🙌', name: 'raising hands', category: 'quick', keywords: ['celebrate', 'hooray', 'yay', 'praise'] },
  { char: '✅', name: 'check mark button', category: 'quick', keywords: ['yes', 'done', 'complete', 'correct'] },
  { char: '👏', name: 'clapping hands', category: 'quick', keywords: ['applause', 'bravo', 'congrats'] },
  { char: '🥳', name: 'partying face', category: 'quick', keywords: ['celebrate', 'birthday', 'party', 'hat'] },
  { char: '😍', name: 'smiling face with heart-eyes', category: 'quick', keywords: ['love', 'crush', 'adore', 'heart'] },
  { char: '🙏', name: 'folded hands', category: 'quick', keywords: ['please', 'thank you', 'pray', 'namaste', 'hope'] },

  // Smileys & Emotion
  { char: '😀', name: 'grinning face', category: 'smileys', keywords: ['smile', 'happy', 'grin'] },
  { char: '😃', name: 'grinning face with big eyes', category: 'smileys', keywords: ['happy', 'joy', 'smile'] },
  { char: '😄', name: 'grinning face with smiling eyes', category: 'smileys', keywords: ['happy', 'joy', 'laugh'] },
  { char: '😁', name: 'beaming face with smiling eyes', category: 'smileys', keywords: ['grin', 'teeth', 'happy'] },
  { char: '😆', name: 'grinning squinting face', category: 'smileys', keywords: ['haha', 'laugh', 'lol'] },
  { char: '😅', name: 'grinning face with sweat', category: 'smileys', keywords: ['sweat', 'relief', 'nervous'] },
  { char: '🤣', name: 'rolling on the floor laughing', category: 'smileys', keywords: ['rofl', 'lol', 'laugh', 'hilarious'] },
  { char: '🙂', name: 'slightly smiling face', category: 'smileys', keywords: ['smile', 'happy', 'calm'] },
  { char: '🙃', name: 'upside-down face', category: 'smileys', keywords: ['silly', 'sarcasm', 'irony'] },
  { char: '😉', name: 'winking face', category: 'smileys', keywords: ['wink', 'flirt', 'joke'] },
  { char: '😊', name: 'smiling face with smiling eyes', category: 'smileys', keywords: ['blush', 'proud', 'happy'] },
  { char: '😇', name: 'smiling face with halo', category: 'smileys', keywords: ['angel', 'innocent', 'good'] },
  { char: '🥰', name: 'smiling face with hearts', category: 'smileys', keywords: ['love', 'crush', 'warm'] },
  { char: '🤩', name: 'star-struck', category: 'smileys', keywords: ['star', 'eyes', 'wow', 'excited'] },
  { char: '😘', name: 'face blowing a kiss', category: 'smileys', keywords: ['kiss', 'love', 'flirt'] },
  { char: '😋', name: 'face savoring food', category: 'smileys', keywords: ['yummy', 'delicious', 'tasty'] },
  { char: '😛', name: 'face with tongue', category: 'smileys', keywords: ['tongue', 'playful', 'silly'] },
  { char: '😜', name: 'winking face with tongue', category: 'smileys', keywords: ['joke', 'crazy', 'party'] },
  { char: '🤪', name: 'zany face', category: 'smileys', keywords: ['crazy', 'wild', 'goofy'] },
  { char: '😎', name: 'smiling face with sunglasses', category: 'smileys', keywords: ['cool', 'shades', 'awesome'] },
  { char: '🤓', name: 'nerd face', category: 'smileys', keywords: ['geek', 'smart', 'glasses'] },
  { char: '🧐', name: 'face with monocle', category: 'smileys', keywords: ['curious', 'inspect', 'hm'] },
  { char: '🤔', name: 'thinking face', category: 'smileys', keywords: ['think', 'wonder', 'hmm', 'curious'] },
  { char: '🤐', name: 'zipper-mouth face', category: 'smileys', keywords: ['secret', 'quiet', 'hush'] },
  { char: '🤨', name: 'face with raised eyebrow', category: 'smileys', keywords: ['skeptical', 'doubt', 'suspicious'] },
  { char: '😐', name: 'neutral face', category: 'smileys', keywords: ['meh', 'straight face', 'blank'] },
  { char: '😏', name: 'smirking face', category: 'smileys', keywords: ['smirk', 'flirt', 'sly'] },
  { char: '😒', name: 'unamused face', category: 'smileys', keywords: ['bored', 'unimpressed', 'meh'] },
  { char: '🙄', name: 'face with rolling eyes', category: 'smileys', keywords: ['eye roll', 'whatever', 'annoyed'] },
  { char: '😬', name: 'grimacing face', category: 'smileys', keywords: ['awkward', 'nervous', 'yikes'] },
  { char: '😌', name: 'relieved face', category: 'smileys', keywords: ['peace', 'relief', 'calm'] },
  { char: '😔', name: 'pensive face', category: 'smileys', keywords: ['sad', 'thoughtful', 'down'] },
  { char: '😴', name: 'sleeping face', category: 'smileys', keywords: ['sleep', 'tired', 'zzz', 'night'] },
  { char: '🤯', name: 'exploding head', category: 'smileys', keywords: ['mind blown', 'shocked', 'omg'] },
  { char: '🥺', name: 'pleading face', category: 'smileys', keywords: ['puppy eyes', 'begging', 'cute', 'please'] },
  { char: '😢', name: 'crying face', category: 'smileys', keywords: ['tear', 'sad', 'cry'] },
  { char: '😭', name: 'loudly crying face', category: 'smileys', keywords: ['sob', 'crying', 'sad', 'heartbroken'] },
  { char: '😱', name: 'face screaming in fear', category: 'smileys', keywords: ['scared', 'shocked', 'horror'] },
  { char: '😡', name: 'enraged face', category: 'smileys', keywords: ['angry', 'mad', 'furious', 'red'] },
  { char: '💩', name: 'pile of poo', category: 'smileys', keywords: ['poop', 'crap', 'funny'] },

  // Gestures & People
  { char: '👋', name: 'waving hand', category: 'gestures', keywords: ['wave', 'hello', 'hi', 'bye'] },
  { char: '✋', name: 'raised hand', category: 'gestures', keywords: ['high five', 'stop', 'hand'] },
  { char: '👌', name: 'OK hand', category: 'gestures', keywords: ['ok', 'perfect', 'fine'] },
  { char: '🤌', name: 'pinched fingers', category: 'gestures', keywords: ['italian', 'gesture', 'what'] },
  { char: '✌️', name: 'victory hand', category: 'gestures', keywords: ['peace', 'two', 'v'] },
  { char: '🤞', name: 'crossed fingers', category: 'gestures', keywords: ['luck', 'hope', 'wish'] },
  { char: '🤟', name: 'love-you gesture', category: 'gestures', keywords: ['ily', 'rock', 'love'] },
  { char: '🤘', name: 'sign of the horns', category: 'gestures', keywords: ['rock on', 'metal', 'horns'] },
  { char: '🤙', name: 'call me hand', category: 'gestures', keywords: ['shaka', 'phone', 'hang loose'] },
  { char: '👈', name: 'backhand index pointing left', category: 'gestures', keywords: ['point', 'left'] },
  { char: '👉', name: 'backhand index pointing right', category: 'gestures', keywords: ['point', 'right'] },
  { char: '👆', name: 'backhand index pointing up', category: 'gestures', keywords: ['point', 'up', 'above'] },
  { char: '👇', name: 'backhand index pointing down', category: 'gestures', keywords: ['point', 'down', 'below'] },
  { char: '👎', name: 'thumbs down', category: 'gestures', keywords: ['dislike', 'no', 'bad', '-1'] },
  { char: '✊', name: 'raised fist', category: 'gestures', keywords: ['power', 'fist', 'solidarity'] },
  { char: '👊', name: 'oncoming fist', category: 'gestures', keywords: ['fist bump', 'punch'] },
  { char: '🤝', name: 'handshake', category: 'gestures', keywords: ['deal', 'agree', 'meeting', 'partnership'] },
  { char: '💪', name: 'flexed biceps', category: 'gestures', keywords: ['strong', 'muscle', 'workout', 'power'] },

  // Hearts & Symbols
  { char: '🧡', name: 'orange heart', category: 'hearts', keywords: ['love', 'orange'] },
  { char: '💛', name: 'yellow heart', category: 'hearts', keywords: ['friendship', 'yellow', 'love'] },
  { char: '💚', name: 'green heart', category: 'hearts', keywords: ['nature', 'green', 'love'] },
  { char: '💙', name: 'blue heart', category: 'hearts', keywords: ['calm', 'blue', 'love'] },
  { char: '💜', name: 'purple heart', category: 'hearts', keywords: ['purple', 'love', 'bts'] },
  { char: '🖤', name: 'black heart', category: 'hearts', keywords: ['black', 'dark', 'love'] },
  { char: '🤍', name: 'white heart', category: 'hearts', keywords: ['white', 'pure', 'peace'] },
  { char: '💔', name: 'broken heart', category: 'hearts', keywords: ['breakup', 'heartbroken', 'sad'] },
  { char: '💖', name: 'sparkling heart', category: 'hearts', keywords: ['sparkle', 'love', 'special'] },
  { char: '💘', name: 'heart with arrow', category: 'hearts', keywords: ['cupid', 'crush', 'fall in love'] },
  { char: '💝', name: 'heart with ribbon', category: 'hearts', keywords: ['gift', 'present', 'love'] },
  { char: '⭐', name: 'star', category: 'hearts', keywords: ['star', 'yellow', 'favorite'] },
  { char: '🌟', name: 'glowing star', category: 'hearts', keywords: ['shine', 'gold', 'sparkle'] },
  { char: '⚡', name: 'high voltage', category: 'hearts', keywords: ['lightning', 'zap', 'fast', 'energy'] },

  // Animals & Nature
  { char: '🐶', name: 'dog face', category: 'nature', keywords: ['pup', 'dog', 'pet', 'animal'] },
  { char: '🐱', name: 'cat face', category: 'nature', keywords: ['kitty', 'cat', 'meow', 'pet'] },
  { char: '🐭', name: 'mouse face', category: 'nature', keywords: ['mouse', 'rodent'] },
  { char: '🐰', name: 'rabbit face', category: 'nature', keywords: ['bunny', 'rabbit', 'cute'] },
  { char: '🦊', name: 'fox', category: 'nature', keywords: ['fox', 'clever'] },
  { char: '🐻', name: 'bear', category: 'nature', keywords: ['bear', 'animal'] },
  { char: '🐼', name: 'panda', category: 'nature', keywords: ['panda', 'cute', 'bamboo'] },
  { char: '🦁', name: 'lion', category: 'nature', keywords: ['lion', 'king', 'safari'] },
  { char: '🐯', name: 'tiger face', category: 'nature', keywords: ['tiger', 'wild', 'cat'] },
  { char: '🐵', name: 'monkey face', category: 'nature', keywords: ['monkey', 'ape', 'cute'] },
  { char: '🦄', name: 'unicorn', category: 'nature', keywords: ['magic', 'fantasy', 'horse'] },
  { char: '🌸', name: 'cherry blossom', category: 'nature', keywords: ['flower', 'pink', 'spring', 'sakura'] },
  { char: '🌹', name: 'rose', category: 'nature', keywords: ['flower', 'red', 'romance'] },
  { char: '🌻', name: 'sunflower', category: 'nature', keywords: ['flower', 'sun', 'yellow'] },
  { char: '🍀', name: 'four leaf clover', category: 'nature', keywords: ['lucky', 'luck', 'irish', 'green'] },
  { char: '🌈', name: 'rainbow', category: 'nature', keywords: ['colors', 'sky', 'pride'] },
  { char: '☀️', name: 'sun', category: 'nature', keywords: ['sunny', 'weather', 'warm', 'bright'] },
  { char: '🌙', name: 'crescent moon', category: 'nature', keywords: ['night', 'sleep', 'moon'] },

  // Food & Drink
  { char: '☕', name: 'hot beverage', category: 'food', keywords: ['coffee', 'tea', 'cafe', 'morning'] },
  { char: '🍕', name: 'pizza', category: 'food', keywords: ['slice', 'cheese', 'dinner', 'fast food'] },
  { char: '🍔', name: 'hamburger', category: 'food', keywords: ['burger', 'beef', 'fast food'] },
  { char: '🍟', name: 'french fries', category: 'food', keywords: ['fries', 'potato', 'snack'] },
  { char: '🌮', name: 'taco', category: 'food', keywords: ['mexican', 'food'] },
  { char: '🍜', name: 'steaming bowl', category: 'food', keywords: ['ramen', 'noodles', 'soup'] },
  { char: '🍣', name: 'sushi', category: 'food', keywords: ['japanese', 'fish', 'rice'] },
  { char: '🍦', name: 'soft ice cream', category: 'food', keywords: ['dessert', 'sweet', 'summer'] },
  { char: '🍩', name: 'doughnut', category: 'food', keywords: ['donut', 'sweet', 'dessert'] },
  { char: '🍪', name: 'cookie', category: 'food', keywords: ['chocolate chip', 'biscuit', 'sweet'] },
  { char: '🎂', name: 'birthday cake', category: 'food', keywords: ['celebrate', 'party', 'dessert'] },
  { char: '🍺', name: 'beer mug', category: 'food', keywords: ['drink', 'cheers', 'alcohol', 'pub'] },
  { char: '🍻', name: 'clinking beer mugs', category: 'food', keywords: ['cheers', 'toast', 'celebrate'] },
  { char: '🍷', name: 'wine glass', category: 'food', keywords: ['red wine', 'drink', 'dinner'] },

  // Activities & Objects
  { char: '🎯', name: 'bullseye', category: 'objects', keywords: ['target', 'goal', 'hit', 'direct'] },
  { char: '🎮', name: 'video game', category: 'objects', keywords: ['controller', 'gaming', 'play'] },
  { char: '🏆', name: 'trophy', category: 'objects', keywords: ['win', 'prize', 'champion', 'first'] },
  { char: '🥇', name: '1st place medal', category: 'objects', keywords: ['gold', 'winner', 'first'] },
  { char: '💻', name: 'laptop', category: 'objects', keywords: ['computer', 'work', 'code', 'tech'] },
  { char: '📱', name: 'mobile phone', category: 'objects', keywords: ['iphone', 'smartphone', 'cell'] },
  { char: '🎧', name: 'headphone', category: 'objects', keywords: ['music', 'audio', 'sound', 'listen'] },
  { char: '📷', name: 'camera', category: 'objects', keywords: ['photo', 'picture', 'shot'] },
  { char: '📚', name: 'books', category: 'objects', keywords: ['study', 'read', 'library', 'school'] },
  { char: '💰', name: 'money bag', category: 'objects', keywords: ['cash', 'rich', 'dollar', 'wealth'] },
  { char: '🎁', name: 'wrapped gift', category: 'objects', keywords: ['present', 'birthday', 'surprise'] },
  { char: '🔔', name: 'bell', category: 'objects', keywords: ['notification', 'ring', 'alert'] },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose, isOpen }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('quick');
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  // Filter emojis based on query or category
  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query) {
      return EMOJI_DATABASE.filter(emoji =>
        emoji.name.toLowerCase().includes(query) ||
        emoji.char.includes(query) ||
        emoji.keywords.some(k => k.toLowerCase().includes(query))
      );
    }
    return EMOJI_DATABASE.filter(emoji => emoji.category === activeCategory);
  }, [search, activeCategory]);

  if (!isOpen) return null;

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Emoji picker"
      aria-modal="false"
      className="absolute bottom-full mb-3 left-0 sm:left-4 z-50 w-72 sm:w-80 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in select-none"
      style={{ maxHeight: '380px' }}
    >
      {/* Header & Search */}
      <div className="p-2.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/90 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            aria-label="Search emojis"
            className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emoji picker"
          className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Tabs (shown when not searching) */}
      {!search && (
        <div
          role="tablist"
          aria-label="Emoji categories"
          className="flex items-center justify-between px-2 py-1.5 bg-neutral-50/50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800 overflow-x-auto no-scrollbar"
        >
          {EMOJI_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={cat.label}
                onClick={() => setActiveCategory(cat.id)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
                title={cat.label}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid Container */}
      <div
        role="region"
        aria-label="Emojis list"
        className="p-2 overflow-y-auto flex-1 max-h-60 grid grid-cols-7 sm:grid-cols-8 gap-1 content-start scroll-smooth"
      >
        {filteredEmojis.length > 0 ? (
          filteredEmojis.map(emoji => (
            <button
              key={`${emoji.char}-${emoji.name}`}
              type="button"
              onClick={() => onSelect(emoji.char)}
              aria-label={`Insert emoji ${emoji.char}`}
              title={emoji.name}
              className="w-8 h-8 flex items-center justify-center text-lg sm:text-xl rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-90 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
            >
              {emoji.char}
            </button>
          ))
        ) : (
          <div className="col-span-full py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
            No emojis found for &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      {/* Footer Info / Category Label */}
      <div className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-950/50 border-t border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
        <span>{search ? `${filteredEmojis.length} results` : EMOJI_CATEGORIES.find(c => c.id === activeCategory)?.label || 'Emojis'}</span>
        <span className="opacity-75">Click to insert</span>
      </div>
    </div>
  );
};
