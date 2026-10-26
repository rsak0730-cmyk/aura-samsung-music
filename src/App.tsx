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
  // ZERO fake tracks - Starts 100% empty
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

      {/* Liquid Glass Background */}
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