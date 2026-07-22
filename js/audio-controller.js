/* Local sound controller: low-volume theme music and generated button feedback. */
(() => {
  'use strict';

  const MUSIC_VOLUME = 0.045;
  const CLICK_VOLUME = 0.028;
  const CLICK_FREQUENCY = 520;
  const CLICK_DURATION_SECONDS = 0.045;
  const STORAGE_KEY = 'storyteller.audioMuted';

  const audio = document.querySelector('#themeAudio');
  const toggle = document.querySelector('#audioToggle');
  if (!audio || !toggle) return;

  const volumeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15 9.5a4 4 0 0 1 0 5"></path><path d="M17.7 6.8a8 8 0 0 1 0 10.4"></path></svg>';
  const mutedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="m16 10 5 5"></path><path d="m21 10-5 5"></path></svg>';

  let started = false;
  let context = null;
  let muted = false;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    muted = false;
  }

  audio.loop = true;
  audio.volume = MUSIC_VOLUME;
  audio.muted = muted;

  const render = () => {
    toggle.innerHTML = muted ? mutedIcon : volumeIcon;
    toggle.classList.toggle('active', !muted);
    toggle.setAttribute('aria-pressed', String(!muted));
    toggle.setAttribute('aria-label', muted ? 'Unmute music and sounds' : 'Mute music and sounds');
    toggle.title = muted ? 'Sound off' : 'Sound on';
  };

  const startMusic = () => {
    if (started || muted) return;
    started = true;
    audio.play().catch(() => { started = false; });
  };

  const audioContext = () => {
    if (context) return context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    return context;
  };

  const clickSound = () => {
    if (muted) return;
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const start = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(CLICK_FREQUENCY, start);
    oscillator.frequency.exponentialRampToValueAtTime(CLICK_FREQUENCY * .72, start + CLICK_DURATION_SECONDS);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(CLICK_VOLUME, start + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, start + CLICK_DURATION_SECONDS);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + CLICK_DURATION_SECONDS + .01);
  };

  const activateAudio = event => {
    if (!event.isTrusted) return;
    startMusic();
  };
  document.addEventListener('pointerdown', activateAudio, { passive: true });
  document.addEventListener('keydown', activateAudio, { passive: true });

  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const control = event.target.closest('button, .btn, .chip, .icon-btn, summary, [role="button"], [role="link"]');
    if (control && !control.matches(':disabled, [aria-disabled="true"]')) clickSound();
  });

  toggle.addEventListener('click', () => {
    muted = !muted;
    audio.muted = muted;
    try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch { /* Preference stays in memory. */ }
    if (muted) audio.pause();
    else {
      started = false;
      startMusic();
    }
    render();
  });

  render();
})();