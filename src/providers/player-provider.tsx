"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Track } from "@prisma/client";

export interface PlayerContextValue {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  setQueue: (tracks: Track[], startAt?: number) => void;
  playTrack: (track: Track, nextQueue?: Track[]) => void;
  togglePlayback: () => void;
  seek: (time: number) => void;
  playNext: () => void;
  playPrevious: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function getStoredPlayerState() {
  if (typeof window === "undefined") {
    return {
      queue: [] as Track[],
      currentTrack: null as Track | null,
      progress: 0,
    };
  }

  try {
    const rawState = window.localStorage.getItem("music-hub-player");
    if (!rawState) {
      return {
        queue: [] as Track[],
        currentTrack: null as Track | null,
        progress: 0,
      };
    }

    return JSON.parse(rawState) as {
      queue: Track[];
      currentTrack: Track | null;
      progress: number;
    };
  } catch {
    return {
      queue: [] as Track[],
      currentTrack: null as Track | null,
      progress: 0,
    };
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const initialState = getStoredPlayerState();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueueState] = useState<Track[]>(initialState.queue);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(initialState.currentTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(initialState.progress);
  const [duration, setDuration] = useState(0);

  // رفرنس برای دسترسی همیشگی به آخرین صف و ترک بدون نیاز به بازسازی Audio
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  async function playTrackInternal(track: Track) {
    if (!audioRef.current) return;
    try {
      if (audioRef.current.src !== track.fileUrl) {
        audioRef.current.src = track.fileUrl;
      }
      setCurrentTrack(track);
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("Audio playback error:", error);
      setIsPlaying(false);
    }
  }

  // ساخت یکتای شیء صوتی در هنگام لود برنامه
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const q = queueRef.current;
      const cur = currentTrackRef.current;
      const index = q.findIndex((track) => track.id === cur?.id);
      const nextTrack = q[index + 1];
      if (nextTrack) {
        void playTrackInternal(nextTrack);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // ذخیره وضعیت در localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "music-hub-player",
        JSON.stringify({
          queue,
          currentTrack,
          progress,
        }),
      );
    }
  }, [queue, currentTrack, progress]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentTrack,
      isPlaying,
      progress,
      duration,
      setQueue(tracks, startAt = 0) {
        setQueueState(tracks);
        const track = tracks[startAt];
        if (track) {
          void playTrackInternal(track);
        }
      },
      playTrack(track, nextQueue) {
        if (nextQueue) {
          setQueueState(nextQueue);
        } else if (!queue.some((item) => item.id === track.id)) {
          setQueueState([track]);
        }
        void playTrackInternal(track);
      },
      togglePlayback() {
        if (!audioRef.current) return;
        if (audioRef.current.paused) {
          audioRef.current.play().catch(console.error);
        } else {
          audioRef.current.pause();
        }
      },
      seek(time) {
        if (!audioRef.current) return;
        audioRef.current.currentTime = time;
        setProgress(time);
      },
      playNext() {
        const index = queue.findIndex((track) => track.id === currentTrack?.id);
        const nextTrack = queue[index + 1];
        if (nextTrack) {
          void playTrackInternal(nextTrack);
        }
      },
      playPrevious() {
        const index = queue.findIndex((track) => track.id === currentTrack?.id);
        const previousTrack = queue[index - 1];
        if (previousTrack) {
          void playTrackInternal(previousTrack);
        }
      },
    }),
    [currentTrack, duration, isPlaying, progress, queue],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
