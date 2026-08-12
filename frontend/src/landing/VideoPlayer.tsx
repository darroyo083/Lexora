import { useEffect, useRef, useState } from 'react';
import { Expand, Pause, Play, Volume2, VolumeX } from 'lucide-react';

function formatTime(value: number): string {
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play(); else video.pause();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setPlaying(!video.paused);
      setCurrentTime(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setMuted(video.muted);
    };
    for (const event of ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange']) video.addEventListener(event, sync);
    sync();
    return () => {
      for (const event of ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange']) video.removeEventListener(event, sync);
    };
  }, []);

  return (
    <div className="lexora-player" onKeyDown={(event) => {
      const video = videoRef.current;
      if (!video || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      if (event.key === ' ') { event.preventDefault(); void togglePlay(); }
      if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
      if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      if (event.key.toLowerCase() === 'm') video.muted = !video.muted;
    }} tabIndex={0} aria-label="Lexora product walkthrough player">
      <video ref={videoRef} preload="metadata" playsInline poster="/release/lexora-demo-poster.png"
        aria-label="Lexora product walkthrough, 66 seconds" width="1920" height="1080"
        onClick={() => void togglePlay()}>
        <source src="/release/lexora-demo.mp4" type="video/mp4" />
        Your browser does not support embedded video.
      </video>
      <div className="player-controls">
        <button type="button" onClick={() => void togglePlay()} aria-label={playing ? 'Pause video' : 'Play video'}>
          {playing ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
        </button>
        <label className="player-progress"><span className="sr-only">Video position</span><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} aria-label="Video position" onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} /></label>
        <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <button type="button" onClick={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} aria-label={muted ? 'Unmute video' : 'Mute video'}>
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => void videoRef.current?.requestFullscreen()} aria-label="Enter fullscreen">
          <Expand size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
