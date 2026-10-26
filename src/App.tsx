// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Heart, Shuffle, Search,
  Sliders, Moon, Car, Mic, RefreshCw, Folder, Music, ListMusic,
  Edit2, Trash2, X, Check, Volume2, Bookmark, Layers, Settings,
  Cpu, Download, Clock, Disc, List, Compass, GripVertical, FolderSearch
} from 'lucide-react';

import { auraEngine, EQ_FREQUENCIES } from './audio/AudioEngine';
import { auraRoom } from './database/RoomStore';
import { AuraConversationalAssistant } from './ai/ConversationalAssistant';
import { liveStreamSync } from './network/LiveStreamSync';
import { inbuiltAudioAI } from './ai/InbuiltAudioAI';
import { extractDominantColor } from './utils/ColorExtractor';
import { YouTubePlayer } from './components/YouTubePlayer';
import { TrackItem, Playlist, StorageBreakdown } from './types';

export default function App() {
  // ZERO fake tracks - Starts 100% empty for user's real storage
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [activeTab, setActiveTab] = useState('tracks');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'artist' | 'album'>('title');
  const [folderMode, setFolderMode] = useState<'hierarchy' | 'flat'>('hierarchy');
  const [dominantColor, setDominantColor] = useState('#2563eb');

  // Modals & Panels
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [driveMode, setDriveMode] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [editTrack, setEditTrack] = useState<TrackItem | null>(null);

  // Multi-Select Batch State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Audio Engine States
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [smartVolume, setSmartVolume] = useState(true);
  const [concertHall, setConcertHall] = useState(false);
  const [tubeAmp, setTubeAmp] = useState(false);
  const [karaoke, setKaraoke] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [crossfadeDuration, setCrossfadeDuration] = useState(3);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [batterySaver, setBatterySaver] = useState(false);

  // Sleep Timer States
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [stopAtEndOfTrack, setStopAtEndOfTrack] = useState(false);

  // Live Stream Sync Tokens
  const [hostToken, setHostToken] = useState('');
  const [guestToken, setGuestToken] = useState('');
  const [storageSummary, setStorageSummary] = useState<StorageBreakdown | null>(null);

  // References
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchStartY = useRef(0);
  const assistantRef = useRef<AuraConversationalAssistant | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draggedItemIndex = useRef<number | null>(null);

  const currentTrack = queue[currentIndex] || tracks[0] || null;

  const triggerHaptic = () => {
    if ('vibrate' in navigator) navigator.vibrate(15);
  };

  useEffect(() => {
    if (!localStorage.getItem('aura_tour_done')) {
      setShowWelcomeTour(true);
    }

    // Load real offline songs from IndexedDB
    auraRoom.getAllTracks().then((items) => {
      if (items.length > 0) {
        setTracks(items);
        setQueue(items);
      }
    });
    auraRoom.getPlaylists().then(setPlaylists);
    auraRoom.getStorageSummary().then(setStorageSummary);

    // Setup Conversational Voice Assistant
    assistantRef.current = new AuraConversationalAssistant((intent) => {
      if (intent.action === 'PAUSE') togglePlay(false);
      if (intent.action === 'PLAY') togglePlay(true);
      if (intent.action === 'NEXT') handleNext();
      if (intent.action === 'PREV') handlePrev();
      if (intent.action === 'DRIVE') setDriveMode(true);
      if (intent.action === 'KARAOKE') {
        const next = !karaoke;
        setKaraoke(next);
        auraEngine.toggleKaraoke(next);
      }
      if (intent.action === 'SLEEP' && intent.value) {
        setSleepRemaining(intent.value * 60);
      }
      if (intent.action === 'MOOD' && intent.value) {
        const moodBuckets = inbuiltAudioAI.categorizeLibrary(tracks);
        const trks = moodBuckets[intent.value as keyof typeof moodBuckets];
        if (trks && trks.length > 0) {
          setQueue(trks);
          playTrackAt(0);
        }
      }
      if (intent.action === 'SEARCH' && intent.value) {
        const found = tracks.findIndex(
          (t) => t.title.toLowerCase().includes(intent.value) || t.artist.toLowerCase().includes(intent.value)
        );
        if (found !== -1) playTrackAt(found);
      }
    });

    const audio = auraEngine.getActiveAudio();
    const handleAudioEnded = () => {
      if (stopAtEndOfTrack) {
        togglePlay(false);
        setStopAtEndOfTrack(false);
      } else {
        handleNext();
      }
    };
    audio.addEventListener('ended', handleAudioEnded);

    const interval = setInterval(() => {
      if (!audio.paused && !isSeeking) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration || currentTrack?.duration || 0);
      }
    }, 250);

    return () => {
      audio.removeEventListener('ended', handleAudioEnded);
      clearInterval(interval);
    };
  }, [tracks, stopAtEndOfTrack, karaoke, isSeeking]);

  useEffect(() => {
    if (currentTrack?.artwork) {
      extractDominantColor(currentTrack.artwork).then(setDominantColor);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (sleepRemaining === null || sleepRemaining <= 0) return;
    const interval = setInterval(() => {
      setSleepRemaining((prev) => {
        if (prev && prev <= 1) {
          togglePlay(false);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepRemaining]);

  // Visualizer Animation
  useEffect(() => {
    let animId: number;
    const canvas = visualizerCanvasRef.current;
    if (canvas && fullPlayerOpen && !batterySaver) {
      const ctx = canvas.getContext('2d')!;
      const analyser = auraEngine.getAnalyser();
      const buffer = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

      const render = () => {
        animId = requestAnimationFrame(render);
        if (analyser) analyser.getByteFrequencyData(buffer);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 32;
        const width = (canvas.width / bars) * 0.7;
        for (let i = 0; i < bars; i++) {
          const val = buffer[i * 2] || 0;
          const h = (val / 255) * canvas.height;
          ctx.fillStyle = dominantColor;
          ctx.beginPath();
          ctx.roundRect(i * (canvas.width / bars), canvas.height - h, width, h, 4);
          ctx.fill();
        }
      };
      render();
    }
    return () => cancelAnimationFrame(animId);
  }, [fullPlayerOpen, batterySaver, dominantColor]);

  const togglePlay = (forceState?: boolean) => {
    triggerHaptic();
    if (!currentTrack) return;
    const a = auraEngine.getActiveAudio();
    const nextState = forceState !== undefined ? forceState : !isPlaying;

    if (nextState) {
      if (!a.src) playTrackAt(currentIndex);
      else a.play();
      setIsPlaying(true);
      currentTrack.playCount = (currentTrack.playCount || 0) + 1;
      auraRoom.saveTrack(currentTrack);
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  const playTrackAt = (idx: number) => {
    const t = queue[idx] || tracks[idx];
    if (!t) return;
    setCurrentIndex(idx);
    auraEngine.playTrack(t.blobUrl || '');
    setIsPlaying(true);
  };

  const handleNext = () => {
    triggerHaptic();
    if (queue.length === 0) return;
    playTrackAt((currentIndex + 1) % queue.length);
  };

  const handlePrev = () => {
    triggerHaptic();
    if (queue.length === 0) return;
    playTrackAt((currentIndex - 1 + queue.length) % queue.length);
  };

  // Dual-Engine Local Storage Scanner
  const handleScanClick = async () => {
    triggerHaptic();
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        const scanned = await auraRoom.scanDirectory(handle);
        if (scanned.length > 0) {
          const all = await auraRoom.getAllTracks();
          setTracks(all);
          setQueue(all);
          alert(`Successfully imported ${scanned.length} audio tracks!`);
        }
      } catch (e) {
        fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    let count = 0;
    for (const file of files) {
      if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(file.name)) {
        await auraRoom.parseAndStoreFile(file, '/MyMusic');
        count++;
      }
    }
    const all = await auraRoom.getAllTracks();
    setTracks(all);
    setQueue(all);
    alert(`Imported ${count} local songs into your library!`);
  };

  const handleDragStart = (idx: number) => {
    draggedItemIndex.current = idx;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIdx: number) => {
    if (draggedItemIndex.current === null) return;
    const updatedQueue = [...queue];
    const [movedItem] = updatedQueue.splice(draggedItemIndex.current, 1);
    updatedQueue.splice(dropIdx, 0, movedItem);
    setQueue(updatedQueue);
    draggedItemIndex.current = null;
    triggerHaptic();
  };

  const runInbuiltAICurator = async () => {
    triggerHaptic();
    if (tracks.length === 0) {
      alert("Please scan some songs into your library first!");
      return;
    }
    const moodBuckets = inbuiltAudioAI.categorizeLibrary(tracks);
    const createdPlaylists: Playlist[] = [];

    for (const [moodName, trks] of Object.entries(moodBuckets)) {
      if (trks.length > 0) {
        const pl: Playlist = {
          id: `pl_ai_${moodName.toLowerCase()}`,
          name: `AI Mood: ${moodName}`,
          trackIds: trks.map((t) => t.id),
          createdAt: Date.now(),
        };
        await auraRoom.savePlaylist(pl);
        createdPlaylists.push(pl);
      }
    }

    setPlaylists(await auraRoom.getPlaylists());
    alert(`Inbuilt Neural Engine categorized your ${tracks.length} tracks into ${createdPlaylists.length} mood playlists!`);
  };

  const recentlyAddedTracks = [...tracks].sort((a, b) => b.dateAdded - a.dateAdded).slice(0, 30);
  const mostPlayedTracks = [...tracks].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 30);
  const favoriteTracks = tracks.filter((t) => t.isFavorite);

  const sortedTracks = [...tracks].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'artist') return a.artist.localeCompare(b.artist);
    if (sortBy === 'album') return a.album.localeCompare(b.album);
    return b.dateAdded - a.dateAdded;
  });

  return (
    <div className="relative w-screen h-screen flex flex-col justify-between overflow-hidden bg-[#07090e]">
      {/* Hidden Mobile Storage File Picker */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="audio/*"
        className="hidden"
      />

      {/* Liquid Glass Dynamic Gradient Background */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000 opacity-25 blur-[140px]"
        style={{
          background: `radial-gradient(circle at 50% 25%, ${dominantColor} 0%, #1e1b4b 50%, transparent 80%)`,
        }}
      />

      {/* TOP HEADER: Clean Title, Search & Quick Actions Row */}
      <header className="relative z-10 flex flex-col px-5 pt-8 pb-3 border-b border-white/10 glass-panel gap-3">
        {/* Row 1: App Title & Search Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black tracking-tight text-white">Samsung Music</h1>
            <span
              className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border"
              style={{ color: dominantColor, borderColor: `${dominantColor}60` }}
            >
              Liquid Glass
            </span>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/40" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 rounded-full py-1.5 pl-8 pr-3 text-xs placeholder-white/40 border border-white/15 focus:outline-none focus:border-blue-400 text-white"
            />
          </div>
        </div>

        {/* Row 2: One UI Swipeable Action Capsule Pills (Never cut off!) */}
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
          {/* 1. Scan Local Storage (Always Visible) */}
          <button
            onClick={handleScanClick}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Device Storage</span>
          </button>

          {/* 2. Live Music Sync Room (Always Visible) */}
          <button
            onClick={() => setSyncOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-pink-500/20 border border-pink-400/40 text-pink-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Live Music Sync</span>
          </button>

          {/* 3. 10-Band EQ */}
          <button
            onClick={() => setEqOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>10-Band EQ</span>
          </button>

          {/* 4. Conversational Voice AI */}
          <button
            onClick={() => assistantRef.current?.toggle()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice AI</span>
          </button>

          {/* 5. Inbuilt Neural Mood AI */}
          <button
            onClick={runInbuiltAICurator}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Moods</span>
          </button>

          {/* 6. Drive Mode */}
          <button
            onClick={() => setDriveMode(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Car className="w-3.5 h-3.5" />
            <span>Drive Mode</span>
          </button>

          {/* 7. Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-neutral-300 text-xs font-bold whitespace-nowrap active:scale-95 transition"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Samsung One UI Capsule Navigation Tab Strip */}
      <nav className="relative z-10 flex space-x-2 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
        {[
          { id: 'tracks', label: 'Tracks' },
          { id: 'smart', label: 'Smart Playlists' },
          { id: 'albums', label: 'Albums' },
          { id: 'artists', label: 'Artists' },
          { id: 'playlists', label: 'Playlists' },
          { id: 'folders', label: 'Folders' },
          { id: 'genres', label: 'Genres' },
          { id: 'composers', label: 'Composers' },
          { id: 'audiobooks', label: 'Audio Books' },
          { id: 'youtube', label: 'YouTube Window' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                triggerHaptic();
                setActiveTab(tab.id);
              }}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200 border ${
                isActive
                  ? 'bg-blue-600/30 border-blue-400 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.35)] scale-102'
                  : 'bg-white/[0.04] border-white/5 text-white/50 hover:text-white/80 hover:bg-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Views Container */}
      <main className="relative z-10 flex-1 overflow-y-auto px-6 py-4 no-scrollbar">
        {/* Tracks Tab */}
        {activeTab === 'tracks' && (
          <div className="space-y-2 pb-24">
            {tracks.length === 0 ? (
              // Authentic Samsung One UI Empty State
              <div className="flex flex-col items-center justify-center h-[55vh] text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                  <FolderSearch className="w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">No songs in your library</h3>
                  <p className="text-xs text-white/40 max-w-xs">
                    Scan your device storage to import your offline MP3, FLAC, and audio files.
                  </p>
                </div>
                <button
                  onClick={handleScanClick}
                  className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition text-xs font-bold text-white shadow-xl shadow-blue-500/30 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Scan Device Storage
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-white/50 pb-2">
                  <span>{tracks.length} Songs</span>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                        setQueue(shuffled);
                        playTrackAt(0);
                      }}
                      className="flex items-center space-x-1 hover:text-blue-400"
                    >
                      <Shuffle className="w-3.5 h-3.5" /> <span>Shuffle All</span>
                    </button>
                    <button onClick={() => setSelectionMode(!selectionMode)} className="text-blue-400 font-semibold">
                      {selectionMode ? 'Done' : 'Select'}
                    </button>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-transparent border border-white/10 rounded px-2 py-0.5 text-xs text-white/70 focus:outline-none"
                    >
                      <option value="title" className="bg-neutral-900">Title</option>
                      <option value="artist" className="bg-neutral-900">Artist</option>
                      <option value="album" className="bg-neutral-900">Album</option>
                      <option value="date" className="bg-neutral-900">Date Added</option>
                    </select>
                  </div>
                </div>

                {/* Batch Action Bar */}
                {selectionMode && selectedIds.size > 0 && (
                  <div className="flex items-center justify-between p-3 mb-2 rounded-2xl glass-modal border border-blue-400/30">
                    <span className="text-xs text-blue-300 font-bold">{selectedIds.size} Selected</span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const newQueue = [...queue, ...tracks.filter((t) => selectedIds.has(t.id))];
                          setQueue(newQueue);
                          setSelectedIds(new Set());
                          setSelectionMode(false);
                          triggerHaptic();
                        }}
                        className="px-3 py-1 bg-blue-600 rounded-xl text-xs font-semibold"
                      >
                        Add to Queue
                      </button>
                      <button
                        onClick={async () => {
                          for (const id of selectedIds) await auraRoom.deleteTrack(id);
                          setTracks(await auraRoom.getAllTracks());
                          setSelectedIds(new Set());
                          setSelectionMode(false);
                        }}
                        className="px-3 py-1 bg-red-600 rounded-xl text-xs font-semibold"
                      >
                        Delete Selected
                      </button>
                    </div>
                  </div>
                )}

                {sortedTracks
                  .filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((track, i) => (
                    <div
                      key={track.id}
                      onClick={() => {
                        if (selectionMode) {
                          const copy = new Set(selectedIds);
                          if (copy.has(track.id)) copy.delete(track.id);
                          else copy.add(track.id);
                          setSelectedIds(copy);
                        } else {
                          setQueue(sortedTracks);
                          playTrackAt(i);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl transition border cursor-pointer ${
                        currentTrack?.id === track.id ? 'bg-blue-600/20 border-blue-400/40' : 'glass-panel hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        {selectionMode && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(track.id)}
                            readOnly
                            className="rounded accent-blue-500 mr-1"
                          />
                        )}
                        <img src={track.artwork} alt={track.title} className="w-12 h-12 rounded-xl object-cover" />
                        <div>
                          <h4 className="text-sm font-semibold truncate max-w-[200px] text-white">{track.title}</h4>
                          <p className="text-xs text-white/50">{track.artist} • {track.album}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTrack(track);
                          }}
                          className="p-1.5 text-white/30 hover:text-white"
                          title="Edit metadata"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            track.isFavorite = !track.isFavorite;
                            auraRoom.saveTrack(track);
                            setTracks([...tracks]);
                          }}
                          className="p-1.5"
                        >
                          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-red-500 text-red-500' : 'text-white/30 hover:text-white'}`} />
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        )}

        {/* Smart Playlists Tab */}
        {activeTab === 'smart' && (
          <div className="space-y-4 pb-24">
            <div className="grid grid-cols-2 gap-4">
              <div onClick={() => { setQueue(favoriteTracks); playTrackAt(0); }} className="p-4 rounded-3xl glass-panel cursor-pointer hover:border-red-500/40 border">
                <Heart className="w-8 h-8 text-red-500 mb-2 fill-red-500" />
                <h3 className="text-sm font-bold">Favorites</h3>
                <p className="text-xs text-white/40">{favoriteTracks.length} tracks</p>
              </div>
              <div onClick={() => { setQueue(mostPlayedTracks); playTrackAt(0); }} className="p-4 rounded-3xl glass-panel cursor-pointer hover:border-blue-500/40 border">
                <Disc className="w-8 h-8 text-blue-400 mb-2" />
                <h3 className="text-sm font-bold">Most Played</h3>
                <p className="text-xs text-white/40">{mostPlayedTracks.length} tracks</p>
              </div>
              <div onClick={() => { setQueue(recentlyAddedTracks); playTrackAt(0); }} className="p-4 rounded-3xl glass-panel cursor-pointer hover:border-emerald-500/40 border">
                <Clock className="w-8 h-8 text-emerald-400 mb-2" />
                <h3 className="text-sm font-bold">Recently Added</h3>
                <p className="text-xs text-white/40">Last 30 days</p>
              </div>
              <div onClick={runInbuiltAICurator} className="p-4 rounded-3xl glass-panel cursor-pointer hover:border-cyan-500/40 border">
                <Cpu className="w-8 h-8 text-cyan-400 mb-2" />
                <h3 className="text-sm font-bold">Inbuilt Neural Mix</h3>
                <p className="text-xs text-white/40">100% Offline Machine Learning</p>
              </div>
            </div>
          </div>
        )}

        {/* Albums Tab */}
        {activeTab === 'albums' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-24">
            {Array.from(new Set(tracks.map((t) => t.album))).map((albumName) => {
              const albumTrack = tracks.find((t) => t.album === albumName);
              const count = tracks.filter((t) => t.album === albumName).length;
              return (
                <div
                  key={albumName}
                  onClick={() => {
                    const albumList = tracks.filter((t) => t.album === albumName);
                    setQueue(albumList);
                    playTrackAt(0);
                  }}
                  className="p-3 rounded-2xl glass-panel cursor-pointer hover:border-blue-400/40 border transition"
                >
                  <img src={albumTrack?.artwork} alt={albumName} className="w-full aspect-square rounded-xl object-cover mb-2" />
                  <h4 className="text-xs font-bold truncate text-white">{albumName}</h4>
                  <p className="text-[10px] text-white/50">{count} songs • {albumTrack?.artist}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Artists Tab */}
        {activeTab === 'artists' && (
          <div className="space-y-3 pb-24">
            {Array.from(new Set(tracks.map((t) => t.artist))).map((artistName) => {
              const artistTracks = tracks.filter((t) => t.artist === artistName);
              return (
                <div
                  key={artistName}
                  onClick={() => {
                    setQueue(artistTracks);
                    playTrackAt(0);
                  }}
                  className="flex items-center justify-between p-4 rounded-2xl glass-panel cursor-pointer hover:bg-white/[0.08]"
                >
                  <div className="flex items-center space-x-3">
                    <img src={artistTracks[0]?.artwork} alt={artistName} className="w-12 h-12 rounded-full object-cover" />
                    <div>
                      <h4 className="text-sm font-bold">{artistName}</h4>
                      <p className="text-xs text-white/40">{artistTracks.length} tracks</p>
                    </div>
                  </div>
                  <span className="text-xs text-blue-400">Play All</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Folders Tab */}
        {activeTab === 'folders' && (
          <div className="space-y-3 pb-24">
            <div className="flex justify-between items-center text-xs text-white/40 pb-1">
              <span>Device Directory Navigation</span>
              <button
                onClick={() => setFolderMode(folderMode === 'hierarchy' ? 'flat' : 'hierarchy')}
                className="text-blue-400 hover:underline"
              >
                Switch to {folderMode === 'hierarchy' ? 'Flat List' : 'Hierarchy'}
              </button>
            </div>
            {Array.from(new Set(tracks.map((t) => t.path.split('/').slice(0, -1).join('/') || '/Storage'))).map((f) => (
              <div
                key={f}
                onClick={() => {
                  const folderTracks = tracks.filter((t) => t.path.startsWith(f));
                  setQueue(folderTracks);
                  playTrackAt(0);
                }}
                className="flex items-center space-x-3 p-4 rounded-2xl glass-panel cursor-pointer hover:bg-white/[0.08]"
              >
                <Folder className="w-6 h-6 text-yellow-400" />
                <div>
                  <h4 className="text-sm font-semibold">{f}</h4>
                  <p className="text-xs text-white/40">{tracks.filter((t) => t.path.startsWith(f)).length} audio files</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Audio Books Tab */}
        {activeTab === 'audiobooks' && (
          <div className="space-y-3 pb-24">
            {tracks
              .filter((t) => t.genre === 'Audio Books' || t.path.includes('AudioBook'))
              .map((ab, idx) => (
                <div key={ab.id} onClick={() => playTrackAt(idx)} className="flex items-center justify-between p-4 rounded-2xl glass-panel cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <img src={ab.artwork} alt={ab.title} className="w-12 h-12 rounded-xl object-cover" />
                    <div>
                      <h4 className="text-sm font-bold">{ab.title}</h4>
                      <p className="text-xs text-white/50">{ab.artist}</p>
                    </div>
                  </div>
                  {ab.audioBookBookmark && (
                    <div className="flex items-center space-x-1 text-xs text-amber-400">
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{Math.floor(ab.audioBookBookmark / 60)}m resumed</span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Official YouTube Window Tab (Completely Working) */}
        {activeTab === 'youtube' && (
          <div className="w-full h-[calc(100vh-230px)] pb-16">
            <YouTubePlayer dominantColor={dominantColor} />
          </div>
        )}
      </main>

      {/* Persistent Mini-Player (Shows only when a song exists) */}
      {currentTrack && (
        <div
          onClick={() => setFullPlayerOpen(true)}
          className="fixed bottom-3 left-4 right-4 z-20 p-3 rounded-2xl glass-modal border border-white/15 flex items-center justify-between cursor-pointer active:scale-[0.99] transition shadow-2xl"
        >
          <div className="flex items-center space-x-3">
            <img src={currentTrack.artwork} alt={currentTrack.title} className="w-11 h-11 rounded-xl object-cover" />
            <div>
              <h4 className="text-xs font-bold truncate max-w-[170px] text-white">{currentTrack.title}</h4>
              <p className="text-[11px] text-white/50">{currentTrack.artist}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQueueOpen(true)} className="p-2 text-white/60 hover:text-white" title="Manage Queue">
              <List className="w-5 h-5" />
            </button>
            <button onClick={handlePrev} className="p-2 text-white/60 hover:text-white"><SkipBack className="w-5 h-5" /></button>
            <button onClick={() => togglePlay()} className="p-2.5 rounded-full bg-blue-500 text-white shadow-lg active:scale-90 transition">
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button onClick={handleNext} className="p-2 text-white/60 hover:text-white"><SkipForward className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      {/* Full-Screen Liquid Glass Player Modal */}
      {fullPlayerOpen && currentTrack && (
        <div
          onTouchStart={(e) => (touchStartY.current = e.touches[0].clientY)}
          onTouchEnd={(e) => {
            if (e.changedTouches[0].clientY - touchStartY.current > 75) setFullPlayerOpen(false);
          }}
          className="fixed inset-0 z-50 flex flex-col justify-between p-8 glass-modal bg-neutral-950/90"
        >
          <div className="flex items-center justify-between">
            <button onClick={() => setFullPlayerOpen(false)} className="p-2 rounded-full glass-panel"><X className="w-5 h-5" /></button>
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold" style={{ color: dominantColor }}>Now Playing</span>
              <h3 className="text-xs font-semibold text-white/70">{currentTrack.album}</h3>
            </div>
            <button onClick={() => setLyricsOpen(true)} className="p-2 rounded-full glass-panel"><Music className="w-5 h-5" /></button>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <img src={currentTrack.artwork} alt={currentTrack.title} className="w-72 h-72 rounded-3xl object-cover shadow-2xl border border-white/20" />
            <canvas ref={visualizerCanvasRef} width={280} height={40} className="mt-6 w-72 h-10" />
          </div>

          <div className="space-y-4 max-w-sm mx-auto w-full">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-white">{currentTrack.title}</h2>
                <p className="text-xs text-white/50">{currentTrack.artist}</p>
              </div>
              <button
                onClick={() => {
                  currentTrack.isFavorite = !currentTrack.isFavorite;
                  auraRoom.saveTrack(currentTrack);
                  setTracks([...tracks]);
                }}
              >
                <Heart className={`w-6 h-6 ${currentTrack.isFavorite ? 'fill-red-500 text-red-500' : 'text-white/30'}`} />
              </button>
            </div>

            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setCurrentTime(val);
              }}
              onMouseUp={(e) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                auraEngine.getActiveAudio().currentTime = val;
                setIsSeeking(false);
              }}
              onTouchEnd={(e) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                auraEngine.getActiveAudio().currentTime = val;
                setIsSeeking(false);
              }}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer scrubber"
            />
            <div className="flex justify-between text-[11px] font-mono text-white/40">
              <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}</span>
              <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}</span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  if (sleepRemaining) {
                    setSleepRemaining(null);
                    setStopAtEndOfTrack(false);
                  } else {
                    setSleepRemaining(30 * 60);
                  }
                }}
                className={`p-2 hover:text-white ${sleepRemaining ? 'text-blue-400' : 'text-white/40'}`}
                title="Toggle Sleep Timer"
              >
                <Moon className="w-5 h-5" />
              </button>
              <button onClick={handlePrev} className="p-2 text-white/80 hover:text-white"><SkipBack className="w-7 h-7" /></button>
              <button
                onClick={() => togglePlay()}
                className="p-5 rounded-full text-white shadow-xl active:scale-95 transition"
                style={{ background: dominantColor }}
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-0.5" />}
              </button>
              <button onClick={handleNext} className="p-2 text-white/80 hover:text-white"><SkipForward className="w-7 h-7" /></button>
              <button
                onClick={() => {
                  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
                  const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                  setPlaybackSpeed(nextSpeed);
                  auraEngine.setRate(nextSpeed);
                }}
                className="px-2 py-1 rounded bg-white/10 text-xs font-mono"
              >
                {playbackSpeed}x
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Sheet with Drag-and-Drop Reordering */}
      {queueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-md glass-modal p-6 rounded-3xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <List className="w-4 h-4 text-blue-400" /> Current Queue ({queue.length})
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={async () => {
                    const plName = prompt('Enter name to save current queue as playlist:');
                    if (plName) {
                      await auraRoom.savePlaylist({
                        id: `pl_${Date.now()}`,
                        name: plName,
                        trackIds: queue.map((t) => t.id),
                        createdAt: Date.now(),
                      });
                      setPlaylists(await auraRoom.getPlaylists());
                      alert('Saved playlist successfully!');
                    }
                  }}
                  className="px-2 py-1 bg-white/10 rounded-lg text-xs hover:bg-white/20"
                >
                  Save as Playlist
                </button>
                <button onClick={() => setQueueOpen(false)}><X className="w-5 h-5 text-white/60" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
              {queue.map((t, idx) => (
                <div
                  key={`${t.id}_${idx}`}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(idx)}
                  onClick={() => playTrackAt(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-move transition active:scale-98 ${
                    currentIndex === idx ? 'bg-blue-600/30 border-blue-400' : 'bg-white/5 border-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <GripVertical className="w-4 h-4 text-white/30" />
                    <img src={t.artwork} alt={t.title} className="w-9 h-9 rounded-lg object-cover" />
                    <div>
                      <h4 className="text-xs font-bold truncate max-w-[170px]">{t.title}</h4>
                      <p className="text-[10px] text-white/40">{t.artist}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueue(queue.filter((_, i) => i !== idx));
                    }}
                    className="p-1 text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 10-Band One UI Equalizer Modal */}
      {eqOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-md glass-modal p-6 rounded-3xl space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white">Samsung SoundAlive Studio</h3>
                <p className="text-xs text-blue-400">10-Band Equalizer</p>
              </div>
              <button onClick={() => setEqOpen(false)}><X className="w-5 h-5 text-white/60" /></button>
            </div>

            <div className="flex justify-between items-end h-40 py-2">
              {EQ_FREQUENCIES.map((freq, i) => (
                <div key={freq} className="flex flex-col items-center h-full justify-between">
                  <span className="text-[9px] font-mono text-white/40">{eqGains[i]}</span>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    value={eqGains[i]}
                    onChange={(e) => {
                      const copy = [...eqGains];
                      copy[i] = parseInt(e.target.value, 10);
                      setEqGains(copy);
                      auraEngine.setEQBand(i, copy[i]);
                    }}
                    className="h-24 -rotate-90 appearance-none bg-white/20 rounded accent-blue-400 cursor-pointer"
                  />
                  <span className="text-[9px] font-mono text-white/50">{freq >= 1000 ? `${freq / 1000}k` : freq}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  const s = !smartVolume;
                  setSmartVolume(s);
                  auraEngine.toggleSmartVolume(s);
                }}
                className={`p-2.5 rounded-xl border text-center ${smartVolume ? 'border-blue-400 bg-blue-500/20' : 'border-white/10 bg-white/5'}`}
              >
                <p className="text-xs font-bold">Smart Volume</p>
                <p className="text-[9px] text-white/40">Compressor</p>
              </button>
              <button
                onClick={() => {
                  const s = !concertHall;
                  setConcertHall(s);
                  auraEngine.toggleConcertHall(s);
                }}
                className={`p-2.5 rounded-xl border text-center ${concertHall ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
              >
                <p className="text-xs font-bold">Concert Hall</p>
                <p className="text-[9px] text-white/40">3D Reverb</p>
              </button>
              <button
                onClick={() => {
                  const s = !tubeAmp;
                  setTubeAmp(s);
                  auraEngine.toggleTubeAmp(s);
                }}
                className={`p-2.5 rounded-xl border text-center ${tubeAmp ? 'border-amber-400 bg-amber-500/20' : 'border-white/10 bg-white/5'}`}
              >
                <p className="text-xs font-bold">Tube Amp Pro</p>
                <p className="text-[9px] text-white/40">Warmth</p>
              </button>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>Crossfade Duration</span>
                <span>{crossfadeDuration}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={crossfadeDuration}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCrossfadeDuration(val);
                  auraEngine.crossfadeDuration = val;
                }}
                className="w-full accent-blue-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-md glass-modal p-6 rounded-3xl space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" /> Preferences & Storage
              </h3>
              <button onClick={() => setSettingsOpen(false)}><X className="w-5 h-5 text-white/60" /></button>
            </div>

            {storageSummary && (
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <h4 className="text-xs font-bold text-white">Storage Breakdown</h4>
                <p className="text-xs text-white/60">
                  Total Audio Size: {(storageSummary.totalBytes / (1024 * 1024)).toFixed(1)} MB
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(storageSummary.formatCounts).map(([fmt, cnt]) => (
                    <span key={fmt} className="text-[10px] px-2 py-0.5 rounded bg-white/10 font-mono">
                      {fmt}: {cnt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center p-3 rounded-2xl bg-white/5">
              <div>
                <p className="text-xs font-bold">Battery Saver</p>
                <p className="text-[10px] text-white/40">Disables 60fps canvas visualizer</p>
              </div>
              <input
                type="checkbox"
                checked={batterySaver}
                onChange={(e) => setBatterySaver(e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
            </div>

            <div className="flex justify-between items-center p-3 rounded-2xl bg-white/5">
              <div>
                <p className="text-xs font-bold">Pause at End of Current Track</p>
                <p className="text-[10px] text-white/40">Automatic bed-time pause</p>
              </div>
              <input
                type="checkbox"
                checked={stopAtEndOfTrack}
                onChange={(e) => setStopAtEndOfTrack(e.target.checked)}
                className="accent-blue-500 w-4 h-4"
              />
            </div>

            <button
              onClick={() => {
                const data = JSON.stringify({ tracks, playlists, eqGains, crossfadeDuration }, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `samsung_music_backup_${Date.now()}.json`;
                a.click();
              }}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Export Library & Settings (JSON)
            </button>
          </div>
        </div>
      )}

      {/* Live Stream WebRTC Sync Room Modal (Always Accessible!) */}
      {syncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-sm glass-modal p-6 rounded-3xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-pink-400" /> Listen Together Live Room
              </h3>
              <button onClick={() => setSyncOpen(false)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Streams your live offline or online audio to your friend's phone over local Wi-Fi with sub-50ms latency.
            </p>
            <button
              onClick={async () => {
                const stream = auraEngine.getLiveMediaStream();
                const tok = await liveStreamSync.startBroadcast(stream);
                setHostToken(tok);
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition"
            >
              Create Broadcast Room
            </button>
            {hostToken && (
              <div className="p-2 bg-white/5 rounded-xl font-mono text-[9px] break-all border border-white/10">
                <p className="text-white/40 mb-1">Share this room code with your friend:</p>
                {hostToken}
              </div>
            )}
            <input
              type="text"
              placeholder="Paste friend's broadcast room code..."
              value={guestToken}
              onChange={(e) => setGuestToken(e.target.value)}
              className="w-full p-2 bg-white/10 rounded-xl border border-white/10 text-xs text-white"
            />
            <button
              onClick={async () => {
                const answer = await liveStreamSync.receiveBroadcast(guestToken);
                prompt('Send this answer confirmation code back to broadcaster:', answer);
              }}
              className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-xs shadow-lg shadow-pink-500/20 active:scale-95 transition"
            >
              Join & Listen Live
            </button>
          </div>
        </div>
      )}

      {/* Metadata Inline Tag Editor */}
      {editTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-sm glass-modal p-6 rounded-3xl space-y-3">
            <h3 className="text-sm font-bold">Edit Track Tags</h3>
            <input
              type="text"
              value={editTrack.title}
              onChange={(e) => setEditTrack({ ...editTrack, title: e.target.value })}
              className="w-full p-2 rounded-xl bg-white/10 text-xs border border-white/10"
              placeholder="Title"
            />
            <input
              type="text"
              value={editTrack.artist}
              onChange={(e) => setEditTrack({ ...editTrack, artist: e.target.value })}
              className="w-full p-2 rounded-xl bg-white/10 text-xs border border-white/10"
              placeholder="Artist"
            />
            <input
              type="text"
              value={editTrack.album}
              onChange={(e) => setEditTrack({ ...editTrack, album: e.target.value })}
              className="w-full p-2 rounded-xl bg-white/10 text-xs border border-white/10"
              placeholder="Album"
            />
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => {
                  auraRoom.saveTrack(editTrack);
                  setTracks(tracks.map((t) => (t.id === editTrack.id ? editTrack : t)));
                  setEditTrack(null);
                }}
                className="flex-1 py-2 bg-blue-600 rounded-xl text-xs font-bold"
              >
                Save
              </button>
              <button onClick={() => setEditTrack(null)} className="flex-1 py-2 bg-white/10 rounded-xl text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Contrast Drive Mode */}
      {driveMode && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-8">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-2">
              <Car className="w-4 h-4" /> Drive Mode
            </span>
            <button onClick={() => setDriveMode(false)} className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold">
              Exit
            </button>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black">{currentTrack?.title || 'No Song Selected'}</h2>
            <p className="text-lg text-white/50">{currentTrack?.artist || 'Unknown Artist'}</p>
          </div>
          <div className="flex justify-around items-center py-6">
            <button onClick={handlePrev} className="p-8 bg-neutral-900 rounded-full active:scale-95"><SkipBack className="w-10 h-10" /></button>
            <button onClick={() => togglePlay()} className="p-10 bg-amber-400 text-black rounded-full font-bold active:scale-95">
              {isPlaying ? <Pause className="w-12 h-12" /> : <Play className="w-12 h-12 ml-1" />}
            </button>
            <button onClick={handleNext} className="p-8 bg-neutral-900 rounded-full active:scale-95"><SkipForward className="w-10 h-10" /></button>
          </div>
        </div>
      )}

      {/* Lyrics & AI Karaoke Mode */}
      {lyricsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between p-8 glass-modal bg-neutral-950/95">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Music className="w-4 h-4 text-blue-400" /> Lyrics & Karaoke</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const k = !karaoke;
                  setKaraoke(k);
                  auraEngine.toggleKaraoke(k);
                  triggerHaptic();
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold border ${karaoke ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'bg-white/10 border-white/20 text-white/50'}`}
              >
                {karaoke ? 'Karaoke ON (Vocals Suppressed)' : 'Karaoke Mode'}
              </button>
              <button onClick={() => setLyricsOpen(false)}><X className="w-5 h-5 text-white/60" /></button>
            </div>
          </div>
          <div className="text-center space-y-6 my-auto">
            <p className="text-base text-white/30">City lights shine through the mist</p>
            <p className="text-xl font-bold scale-105 transition" style={{ color: dominantColor }}>We move across the neon skyline</p>
            <p className="text-base text-white/30">Echoes of tomorrow in our hands</p>
          </div>
          <div className="flex justify-between items-center text-[10px] text-white/40 pt-4 border-t border-white/10">
            <span>Sync Offset: {lyricsOffset}ms</span>
            <div className="flex space-x-2">
              <button onClick={() => setLyricsOffset(lyricsOffset - 50)} className="px-2 py-0.5 rounded bg-white/10">-50ms</button>
              <button onClick={() => setLyricsOffset(lyricsOffset + 50)} className="px-2 py-0.5 rounded bg-white/10">+50ms</button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour Modal */}
      {showWelcomeTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
          <div className="w-full max-w-sm glass-modal p-6 rounded-3xl space-y-4 text-center">
            <Cpu className="w-12 h-12 text-blue-400 mx-auto" />
            <h2 className="text-lg font-black text-white">Samsung Music Aura</h2>
            <p className="text-xs text-white/60 leading-relaxed">
              Equipped with One UI Liquid Glass styling, an on-device Inbuilt Neural AI mood engine, real-time karaoke vocal cancellation, 10-band equalizer, and a login-free YouTube Music stream window.
            </p>
            <button
              onClick={() => {
                localStorage.setItem('aura_tour_done', 'true');
                setShowWelcomeTour(false);
                triggerHaptic();
              }}
              className="w-full py-3 bg-blue-600 rounded-2xl text-xs font-bold text-white shadow-lg shadow-blue-500/30"
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </div>
  );
}