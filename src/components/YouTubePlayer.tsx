import React, { useState } from 'react';
import { Search, Tv, Flame, Coffee, Dumbbell, Sparkles, Music2 } from 'lucide-react';

interface YouTubePlayerProps {
  dominantColor: string;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = () => {
  const [activeQuery, setActiveQuery] = useState('trending music');
  const [searchInput, setSearchInput] = useState('');

  const quickGenres = [
    { label: 'Trending', query: 'popular music hits', icon: Flame },
    { label: 'Lofi & Chill', query: 'lofi hip hop radio chill beats', icon: Coffee },
    { label: 'Workout', query: 'high energy workout music', icon: Dumbbell },
    { label: 'Synthwave', query: 'synthwave electronic music', icon: Sparkles },
    { label: 'Classical', query: 'classical piano orchestra', icon: Music2 },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveQuery(searchInput.trim());
    }
  };

  return (
    <div className="w-full h-full flex flex-col rounded-3xl overflow-hidden glass-modal border border-white/10 shadow-2xl">
      <div className="px-5 py-3 bg-neutral-900/90 border-b border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center text-red-500 border border-red-500/30">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide">YouTube Music Stream</h3>
            <p className="text-[10px] text-white/40">Official Embed • No Sign-in Required</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
          <input
            type="text"
            placeholder="Search YouTube tracks..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/10 rounded-full py-1.5 pl-8 pr-4 text-xs placeholder-white/40 border border-white/15 focus:outline-none focus:border-red-500 text-white"
          />
        </form>
      </div>

      <div className="flex space-x-2 px-5 py-2.5 overflow-x-auto no-scrollbar bg-white/[0.02] border-b border-white/5">
        {quickGenres.map((genre) => {
          const Icon = genre.icon;
          const isActive = activeQuery === genre.query;
          return (
            <button
              key={genre.label}
              onClick={() => setActiveQuery(genre.query)}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition border ${
                isActive
                  ? 'bg-red-500/20 border-red-400 text-red-300'
                  : 'glass-panel text-white/60 hover:text-white border-white/5'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{genre.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 w-full bg-black relative">
        <iframe
          key={activeQuery}
          src={`https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(
            activeQuery
          )}&autoplay=0&controls=1&rel=0&modestbranding=1`}
          className="w-full h-full border-0"
          title="Official YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
};