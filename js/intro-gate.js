(() => {
  'use strict';

  const INTRO_KEY = 'storyteller.introSeen.v1';
  const done = () => {
    try { sessionStorage.setItem(INTRO_KEY, 'yes'); } catch {}
    window.STORYTELLER_INTRO_PENDING = false;
    window.dispatchEvent(new CustomEvent('storyteller:intro-complete'));
  };
  const seen = () => {
    try { return sessionStorage.getItem(INTRO_KEY) === 'yes'; } catch { return false; }
  };

  if (seen()) {
    window.STORYTELLER_INTRO_PENDING = false;
    return;
  }

  window.STORYTELLER_INTRO_PENDING = true;

  const start = () => {
    const overlay = document.createElement('section');
    overlay.className = 'intro-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Storyteller intro video');
    overlay.innerHTML = `
      <video class="intro-video" src="assets/StoryTeller-intro.mp4" autoplay muted playsinline preload="auto"></video>
      <button class="intro-skip" type="button">Skip intro</button>
      <div class="intro-end" hidden>
        <button class="btn primary intro-start" type="button">Get Started</button>
      </div>
    `;
    document.body.append(overlay);
    document.body.classList.add('intro-locked');

    const video = overlay.querySelector('video');
    const skip = overlay.querySelector('.intro-skip');
    const end = overlay.querySelector('.intro-end');
    const startButton = overlay.querySelector('.intro-start');

    const finish = () => {
      overlay.classList.add('is-leaving');
      document.body.classList.remove('intro-locked');
      setTimeout(() => overlay.remove(), 360);
      done();
    };

    let startShown = false;
    const showStart = () => {
      if (startShown) return;
      startShown = true;
      video.pause();
      end.hidden = false;
      startButton.focus({ preventScroll: true });
    };

    skip.addEventListener('click', finish);
    startButton.addEventListener('click', finish);
    video.addEventListener('ended', showStart, { once: true });
    video.play().catch(() => {});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
