"use client";

import { useEffect, useState, useRef } from "react";

interface Voice {
  id: string;
  name: string;
  category: string;
  gender: string | null;
  accent: string | null;
  age: string | null;
  useCase: string | null;
  previewUrl: string;
}

interface VoiceSelectorProps {
  value: string;
  onChange: (voiceId: string) => void;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "male" | "female">("all");
  const [useCustom, setUseCustom] = useState(false);
  const [customId, setCustomId] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/voices")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Failed to load voices");
          setLoading(false);
          return;
        }
        if (Array.isArray(data)) {
          setVoices(data);
          if (!initializedRef.current && value) {
            const isKnownVoice = data.some((v: Voice) => v.id === value);
            if (!isKnownVoice) {
              setUseCustom(true);
              setCustomId(value);
            }
            initializedRef.current = true;
          }
        } else {
          setError(data.error || "Unexpected response");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Network error loading voices");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePlay(voice: Voice) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingId === voice.id) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(voice.id);
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const filtered = voices.filter((v) => {
    if (filter === "all") return true;
    return v.gender?.toLowerCase() === filter;
  });

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-center">
        <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full" />
        <span className="ml-2 text-sm text-gray-400">Loading voices...</span>
      </div>
    );
  }

  if (error || voices.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-gray-500">
          {error || "No voices available. Check your ElevenLabs API key."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => { setUseCustom(false); if (customId) { setCustomId(""); } }}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              !useCustom ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            Browse Voices
          </button>
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={`px-3 py-1 text-xs rounded-md transition-all ${
              useCustom ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            Custom Voice ID
          </button>
        </div>
      </div>

      {useCustom ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <label className="block text-xs text-gray-400 mb-1.5">
            Paste your ElevenLabs Voice ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => { if (customId.trim()) onChange(customId.trim()); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                customId.trim() && value === customId.trim()
                  ? "bg-violet-600 text-white"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {value === customId.trim() && customId.trim() ? "Selected" : "Use"}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            Find your voice ID in ElevenLabs → Voices → click a voice → copy the ID from the URL or settings.
          </p>
        </div>
      ) : (
        <>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 bg-white/5 rounded-lg p-1 w-fit">
        {(["all", "male", "female"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-md transition-all capitalize ${
              filter === f
                ? "bg-violet-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Voice grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
        {filtered.map((voice) => (
          <div
            key={voice.id}
            onClick={() => onChange(voice.id)}
            className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
              value === voice.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30"
                : "border-white/5 bg-white/[0.02] hover:border-white/15"
            }`}
          >
            {/* Play button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePlay(voice);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                playingId === voice.id
                  ? "bg-violet-600 text-white"
                  : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white"
              }`}
            >
              {playingId === voice.id ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Voice info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {voice.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {voice.gender && (
                  <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded capitalize">
                    {voice.gender}
                  </span>
                )}
                {voice.accent && (
                  <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded capitalize">
                    {voice.accent}
                  </span>
                )}
                {voice.age && (
                  <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded capitalize">
                    {voice.age}
                  </span>
                )}
              </div>
            </div>

            {/* Selected indicator */}
            {value === voice.id && (
              <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          No {filter} voices found
        </p>
      )}
        </>
      )}
    </div>
  );
}
