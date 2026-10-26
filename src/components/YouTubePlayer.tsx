// src/components/YouTubePlayer.tsx
import React, { useState } from 'react';
import { Search, Tv, Flame, Coffee, Dumbbell, Sparkles, Music2, Play, ExternalLink } from 'lucide-react';

interface YouTubePlayerProps {
  dominantColor: string;
}

interface VideoEntry {
  id: string;
  title: string;
  channel: string;
  category: string;
}

// Curated verified videos across popular music genres (including regional & Indian hits)
const CURATED_MUSIC: VideoEntry[] = [
  { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio - Beats to Relax/Study to', channel: 'Lofi Girl', category: 'Lofi & Chill' },
  { id: '4xDzrJKXOOY', title: 'Synthwave Radio - Chill synth / retro beats', channel: 'Lofi Girl', category: 'Synthwave' },
  { id: '2S24Ks2S35w', title: 'Kalyanji Anandji Greatest Hits - Retro Classics', channel: 'Classic Bollywood', category: 'Bollywood & Retro' },
  { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channel: 'Luis Fonsi', category: 'Trending Hits' },
  { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', channel: 'Ed Sheeran', category: 'Trending Hits' },
  { id: '7wtfhZwyrcc', title: 'Workout Motivation Music Mix 2026', channel: 'Fitness Club', category: 'Workout' },
  { id: 'mNEUkkoGEoY', title: 'Arijit Singh Ultimate Love Mashup', channel: 'Bollywood Hits', category: 'Bollywood & Retro' },
  { id: '4Tr0otuiQuU', title: 'Beethoven - Für Elise & Classical Masterpieces', channel: 'Classical Music', category: 'Classical' },
];

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ dominantColor }) => {
  const [selectedVideoId, setSelectedVideoId] = useState('jfKfPfyJRdk');
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [customSearchActive, setCustomSearchActive] = useState(false);

  const categories = ['All', 'Bollywood & Retro', 'Trending Hits', 'Lofi & Chill', 'Workout', 'Synthwave', 'Classical'];

  // Handle Search Input or Direct YouTube Link
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    // Check if the user pasted a direct YouTube link or an 11-character video ID
    const match = query.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) {
      setSelectedVideoId(match[1]);
      setCustomSearchActive(false);
      return;
    }

    if (query.length === 11 && !query.includes(' ')) {
      setSelectedVideoId(query);
      setCustomSearchActive(false);
      return;
    }

    // Filter matching songs or enable search mode
    setCustomSearchActive(true);
  };

  const filteredList = CURATED_MUSIC.filter((item) => {
    const matchesCat = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = !searchInput || 
      item.title.toLowerCase().includes(searchInput.toLowerCase()) || 
      item.channel.toLowerCase().includes(searchInput.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="w-full h-full flex flex-col rounded-3xl overflow-hidden glass-modal border border-white/10 shadow-2xl">
      {/* Top Search & Header */}
      <div className="px-5 py-3 bg-neutral-900/95 border-b border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center text-red-500 border border-red-500/30">
            <Tv className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide">YouTube Music Player</h3>
            <p className="text-[10px] text-white/40">Real-Time Streams • No Sign-in Required</p>
          </div>
        </div>

        {/* Search Bar (Accepts song names or YouTube links) */}
        <form onSubmit={handleSearch} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
          <input
            type="text"
            placeholder="Search songs, artist, or paste YouTube link..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white/10 rounded-full py-1.5 pl-8 pr-4 text-xs placeholder-white/40 border border-white/15 focus:outline-none focus:border-red-500 text-white"
          />
        </form>
      </div>

      {/* Category Filter Chips */}
      <div className="flex space-x-2 px-5 py-2 overflow-x-auto no-scrollbar bg-white/[0.02] border-b border-white/5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setCustomSearchActive(false);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition border ${
              activeCategory === cat
                ? 'bg-red-500/20 border-red-400 text-red-300'
                : 'glass-panel text-white/60 hover:text-white border-white/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Video Embed Frame (Always Working - No deprecated search playlists) */}
      <div className="w-full aspect-video md:h-72 bg-black relative">
        <iframe
          key={selectedVideoId}
          src={`https://www.youtube-nocookie.com/embed/${selectedVideoId}?autoplay=1&controls=1&rel=0&modestbranding=1`}
          className="w-full h-full border-0"
          title="YouTube Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Song Selection List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 no-scrollbar bg-black/40">
        <div className="flex justify-between items-center text-xs text-white/50 px-1 pb-1">
          <span>Available Music Streams ({filteredList.length})</span>
          {searchInput && (
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchInput)}`}
              target="_blank"
              rel="noreferrer"
              className="text-red-400 flex items-center gap-1 hover:underline text-[11px]"
            >
              Open "{searchInput}" in YouTube <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {filteredList.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedVideoId(item.id)}
            className={`flex items-center justify-between p-2.5 rounded-2xl border cursor-pointer transition ${
              selectedVideoId === item.id
                ? 'bg-red-600/20 border-red-400/40 text-red-300'
                : 'glass-panel hover:bg-white/[0.08] text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <img
                src={`https://img.youtube.com/vi/${item.id}/hqdefault.jpg`}
                alt={item.title}
                className="w-14 h-10 object-cover rounded-xl"
              />
              <div>
                <h4 className="text-xs font-bold truncate max-w-[200px] md:max-w-md">{item.title}</h4>
                <p className="text-[10px] text-white/50">{item.channel} • {item.category}</p>
              </div>
            </div>
            <button className="p-2 rounded-full bg-white/10 hover:bg-red-500/20">
              <Play className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};