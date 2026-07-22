/*
 * Storyteller session verification gate.
 * This is a client-side automation deterrent, not a replacement for server authorization or RLS.
 */
(() => {
  'use strict';

  const SESSION_KEY = 'storyteller.humanVerified.v1';
  const MINIMUM_WAIT_MS = 5000;
  const MAX_FAILURES = 3;
  // Conservative thresholds: one unusual signal can never fail a legitimate user.
  const BEHAVIOR_CONFIG = Object.freeze({
    startingScore: 100,
    passingScore: 60,
    maximumSamples: 240,
    minimumPointerSamples: 8,
    minimumInteractionMs: 5000,
    immediatePointerMs: 12,
    pointerPauseMs: 140,
    minimumPointerPathPx: 80,
    straightPathRatio: .995,
    minimumSpeedVariation: .08,
    minimumAccelerationVariation: .06,
    minimumAccelerationSamples: 4,
    minimumDirectionChanges: 2,
    directionChangeRadians: .12,
    minimumPointerTimingVariation: .025,
    minimumPointerTimingIntervals: 9,
    minimumKeyIntervals: 8,
    minimumKeyAverageMs: 28,
    minimumKeyVariation: .045,
    minimumScrollIntervals: 5,
    minimumScrollTimingVariation: .025,
    minimumScrollDistanceVariation: .02,
    maximumFocusChanges: 4,
    maximumHiddenChanges: 2,
  });

  const coefficientOfVariation = values => {
    if (values.length < 2) return 0;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (!average) return 0;
    const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
    return Math.sqrt(variance) / average;
  };

  // Collects ephemeral geometry and timing only while the verification gate exists.
  // Samples remain in memory and are never stored, logged, fingerprinted, or transmitted.
  function createBehaviorAnalyzer(gate) {
    const config = BEHAVIOR_CONFIG;
    const controller = new AbortController();
    const options = { passive: true, signal: controller.signal };
    const startedAt = performance.now();
    const state = {
      active: true,
      firstInteractionAt: null,
      firstPointerAt: null,
      pointers: [],
      keyTimes: [],
      scrollTimes: [],
      scrollDistances: [],
      focusChanges: 0,
      hiddenChanges: 0,
    };

    const markInteraction = time => {
      if (state.firstInteractionAt === null) state.firstInteractionAt = time;
    };
    const addLimited = (collection, value) => {
      if (collection.length < config.maximumSamples) collection.push(value);
    };

    const collectPointer = event => {
      if (!state.active || !event.isTrusted || event.isPrimary === false) return;
      const time = performance.now();
      markInteraction(time);
      if (state.firstPointerAt === null) state.firstPointerAt = time;
      addLimited(state.pointers, { x: event.clientX, y: event.clientY, time });
    };
    const collectKey = event => {
      if (!state.active || !event.isTrusted || event.repeat || event.key.length !== 1) return;
      const time = performance.now();
      markInteraction(time);
      addLimited(state.keyTimes, time);
    };
    const collectScroll = event => {
      if (!state.active || !event.isTrusted) return;
      const time = performance.now();
      markInteraction(time);
      addLimited(state.scrollTimes, time);
      addLimited(state.scrollDistances, Math.abs(event.deltaY || event.deltaX || 0));
    };
    const collectFocusChange = () => {
      if (!state.active) return;
      state.focusChanges += 1;
      if (document.hidden) state.hiddenChanges += 1;
    };

    gate.addEventListener('pointermove', collectPointer, options);
    gate.addEventListener('pointerdown', collectPointer, options);
    gate.addEventListener('keydown', collectKey, options);
    gate.addEventListener('wheel', collectScroll, options);
    document.addEventListener('visibilitychange', collectFocusChange, options);
    window.addEventListener('blur', collectFocusChange, options);

    const pointerPenalty = () => {
      const points = state.pointers;
      if (points.length < config.minimumPointerSamples) return { value: 0, present: false };
      const speeds = [];
      const accelerations = [];
      const directions = [];
      const intervals = [];
      let pathLength = 0;
      let pauses = 0;

      for (let index = 1; index < points.length; index += 1) {
        const dx = points[index].x - points[index - 1].x;
        const dy = points[index].y - points[index - 1].y;
        const distance = Math.hypot(dx, dy);
        const elapsed = Math.max(.1, points[index].time - points[index - 1].time);
        pathLength += distance;
        intervals.push(elapsed);
        speeds.push(distance / elapsed);
        if (elapsed >= config.pointerPauseMs) pauses += 1;
        if (distance > 1) directions.push(Math.atan2(dy, dx));
      }
      for (let index = 1; index < speeds.length; index += 1) {
        accelerations.push(Math.abs(speeds[index] - speeds[index - 1]));
      }

      let directionChanges = 0;
      for (let index = 1; index < directions.length; index += 1) {
        const change = Math.abs(Math.atan2(
          Math.sin(directions[index] - directions[index - 1]),
          Math.cos(directions[index] - directions[index - 1])
        ));
        if (change > config.directionChangeRadians) directionChanges += 1;
      }

      const directDistance = Math.hypot(points.at(-1).x - points[0].x, points.at(-1).y - points[0].y);
      const pathRatio = pathLength ? directDistance / pathLength : 1;
      let value = 0;
      // Long perfectly straight paths lack the curves produced by a hand.
      if (pathLength >= config.minimumPointerPathPx && pathRatio >= config.straightPathRatio) value += 7;
      // Natural movement contains speed changes, acceleration, deceleration, and pauses.
      if (coefficientOfVariation(speeds) < config.minimumSpeedVariation) value += 7;
      if (accelerations.length >= config.minimumAccelerationSamples && coefficientOfVariation(accelerations) < config.minimumAccelerationVariation) value += 6;
      if (pathLength >= config.minimumPointerPathPx && directionChanges < config.minimumDirectionChanges && pauses === 0) value += 5;
      // Perfectly uniform browser event spacing can indicate pointer playback.
      if (intervals.length >= config.minimumPointerTimingIntervals && coefficientOfVariation(intervals) < config.minimumPointerTimingVariation) value += 5;
      return { value: Math.min(25, value), present: true };
    };

    const keyboardPenalty = () => {
      const intervals = state.keyTimes.slice(1).map((time, index) => time - state.keyTimes[index]);
      if (intervals.length < config.minimumKeyIntervals) return { value: 0, present: false };
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      let value = 0;
      // Extremely fast and near-identical timings are combined, not treated as one decisive signal.
      if (average < config.minimumKeyAverageMs) value += 16;
      if (coefficientOfVariation(intervals) < config.minimumKeyVariation) value += 14;
      return { value: Math.min(30, value), present: true };
    };

    const scrollPenalty = () => {
      const intervals = state.scrollTimes.slice(1).map((time, index) => time - state.scrollTimes[index]);
      if (intervals.length < config.minimumScrollIntervals) return 0;
      const uniformTiming = coefficientOfVariation(intervals) < config.minimumScrollTimingVariation;
      const uniformDistance = coefficientOfVariation(state.scrollDistances) < config.minimumScrollDistanceVariation;
      return uniformTiming && uniformDistance ? 8 : 0;
    };

    return {
      passes() {
        if (!state.active) return false;
        const now = performance.now();
        const pointer = pointerPenalty();
        const keyboard = keyboardPenalty();
        let score = config.startingScore - pointer.value - keyboard.value - scrollPenalty();
        // Session observations are capped so no single signal can cause rejection.
        if (now - startedAt < config.minimumInteractionMs) score -= 10;
        if (state.firstInteractionAt === null) score -= 15;
        if (state.firstPointerAt !== null && state.firstPointerAt - startedAt < config.immediatePointerMs) score -= 5;
        if (state.focusChanges > config.maximumFocusChanges || state.hiddenChanges > config.maximumHiddenChanges) score -= 8;
        // Keyboard-only and touch-only users remain valid; this applies only if both are absent.
        if (matchMedia('(pointer:fine)').matches && !pointer.present && !keyboard.present) score -= 10;
        return Math.max(0, Math.min(config.startingScore, score)) >= config.passingScore;
      },
      stop() {
        if (!state.active) return;
        state.active = false;
        controller.abort();
        state.pointers.length = 0;
        state.keyTimes.length = 0;
        state.scrollTimes.length = 0;
        state.scrollDistances.length = 0;
      },
    };
  }

  // Eight fragments per group create 512 unique challenges, each 50-55 characters.
  const OPENINGS = Object.freeze([
    'Quiet readers seek',
    'Patient minds find',
    'Kind writers share',
    'Calm travelers see',
    'Open windows frame',
    'Soft mornings wake',
    'Warm lanterns glow',
    'Old stories return',
  ]);

  const MIDDLES = Object.freeze([
    'under moonlight',
    'beside old roads',
    'through soft rain',
    'among tall trees',
    'before sunrise',
    'where winds rise',
    'as bells echo now',
    'while rivers turn',
  ]);

  const ENDINGS = Object.freeze([
    'and wonder stays',
    'before dawn comes',
    'where hopes grow',
    'as stars appear',
    'and dreams begin',
    'while earth rests',
    'where voices meet',
    'and light returns',
  ]);

  const SENTENCES = Object.freeze(OPENINGS.flatMap(opening =>
    MIDDLES.flatMap(middle =>
      ENDINGS.map(ending => `${opening} ${middle} ${ending}.`)
    )
  ));
  const randomInteger = maximum => {
    if (crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return values[0] % maximum;
    }
    return Math.floor(Math.random() * maximum);
  };

  const randomToken = (length = 10) => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length }, () => alphabet[randomInteger(alphabet.length)]).join('');
  };

  const shuffle = values => {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = randomInteger(index + 1);
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  };

  const sessionVerified = () => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'yes';
    } catch {
      return false;
    }
  };

  const saveSessionVerification = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, 'yes');
    } catch {
      // The overlay still unlocks when storage is unavailable, but a refresh challenges again.
    }
  };

  function startVerification() {
    const mount = document.querySelector('[data-human-mount]');
    if (!mount || sessionVerified()) {
      mount?.remove();
      return;
    }

    const instance = randomToken();
    const id = purpose => `verify-${purpose}-${instance}-${randomToken(5)}`;
    const randomClass = () => `verify-${randomToken(12)}`;
    const element = (tag, attribute, text = '') => {
      const node = document.createElement(tag);
      node.className = randomClass();
      if (attribute) node.setAttribute(attribute, '');
      if (text) node.textContent = text;
      return node;
    };

    const gate = element('section', 'data-human-gate');
    const card = element('form', 'data-human-card');
    const heading = element('header', 'data-human-heading');
    const sentenceWrap = element('div', 'data-human-sentence-wrap');
    const sentenceDisplay = element('div', 'data-human-sentence');
    const inputWrap = element('label', 'data-human-label', 'Type the sentence exactly');
    const input = element('input', 'data-human-input');
    const progress = element('div', 'data-human-progress');
    const track = element('span', 'data-human-track');
    const bar = element('i', 'data-human-bar');
    const progressText = element('span', 'data-human-progress-text', '0 / 0');
    const controls = element('div', 'data-human-controls');
    const button = element('button', '', 'Ready in 5s');
    const status = element('span', 'data-human-status');
    const note = element('p', 'data-human-note', 'This lightweight check runs only in your browser and uses no verification service.');
    const decoyOne = element('input', 'data-human-decoy');
    const decoyTwo = element('span', 'data-human-decoy', randomToken(18));

    const titleId = id('title');
    const descriptionId = id('description');
    const sentenceId = id('sentence');
    const inputId = id('input');
    const statusId = id('status');

    gate.id = id('gate');
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', titleId);
    gate.setAttribute('aria-describedby', `${descriptionId} ${statusId}`);

    card.id = id('form');
    card.autocomplete = 'off';
    heading.innerHTML = `<span class="eyebrow">A brief pause</span><h2 id="${titleId}">Made for human hands.</h2><p id="${descriptionId}">Type the line below naturally to enter Storyteller.</p>`;

    sentenceDisplay.id = sentenceId;
    sentenceDisplay.setAttribute('role', 'text');
    sentenceDisplay.setAttribute('aria-label', 'Sentence to type');
    sentenceDisplay.draggable = false;
    sentenceWrap.append(sentenceDisplay);

    input.id = inputId;
    input.name = id('field');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocorrect = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', `${sentenceId} ${statusId}`);
    input.setAttribute('data-lpignore', 'true');
    input.setAttribute('data-1p-ignore', 'true');
    input.setAttribute('inputmode', 'text');
    input.tabIndex = 1;
    inputWrap.htmlFor = inputId;
    inputWrap.append(input);

    track.append(bar);
    progress.append(track, progressText);

    button.type = 'submit';
    button.className = `${randomClass()} btn primary`;
    button.disabled = true;
    button.tabIndex = 2;
    status.id = statusId;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    controls.append(button, status);

    decoyOne.type = 'text';
    decoyOne.tabIndex = -1;
    decoyOne.autocomplete = 'off';
    decoyOne.setAttribute('aria-hidden', 'true');
    decoyTwo.setAttribute('aria-hidden', 'true');

    // DOM order and identifiers vary per load; CSS order preserves a consistent accessible design.
    shuffle([heading, sentenceWrap, inputWrap, progress, controls, note, decoyOne, decoyTwo])
      .forEach(node => card.append(node));
    gate.append(card);
    mount.replaceChildren(gate);

    const protectedNodes = [document.querySelector('#header'), document.querySelector('#app')].filter(Boolean);
    protectedNodes.forEach(node => { node.inert = true; });
    document.body.classList.add('verification-locked');

    let sentence = '';
    let previousSentence = '';
    let characterNodes = [];
    let challengeStarted = 0;
    let failures = 0;
    let trustedCharacters = 0;
    let typingTimes = [];
    let countdownTimer = null;
    const behaviorAnalyzer = createBehaviorAnalyzer(gate);
    const gateObserver = new MutationObserver(() => {
      if (!gate.isConnected) stopBehaviorAnalysis();
    });
    const stopBehaviorAnalysis = () => {
      behaviorAnalyzer.stop();
      gateObserver.disconnect();
    };
    gateObserver.observe(document.body, { childList: true, subtree: true });

    const blockTransfer = event => event.preventDefault();
    ['copy', 'cut', 'paste', 'drop', 'dragstart'].forEach(type => {
      gate.addEventListener(type, blockTransfer);
    });
    sentenceDisplay.addEventListener('contextmenu', blockTransfer);
    input.addEventListener('contextmenu', blockTransfer);

    const chooseSentence = () => {
      let candidate = SENTENCES[randomInteger(SENTENCES.length)];
      while (candidate === previousSentence) {
        candidate = SENTENCES[randomInteger(SENTENCES.length)];
      }
      previousSentence = candidate;
      return candidate;
    };

    const updateCharacterProgress = () => {
      const value = input.value;
      let matchingPrefix = 0;
      while (matchingPrefix < value.length && value[matchingPrefix] === sentence[matchingPrefix]) {
        matchingPrefix += 1;
      }

      characterNodes.forEach((node, index) => {
        node.classList.toggle('is-matched', index < matchingPrefix);
        node.classList.toggle('is-current', index === matchingPrefix && value.length === matchingPrefix);
        node.classList.toggle('is-wrong', index === matchingPrefix && value.length > matchingPrefix);
      });

      const percent = Math.min(100, matchingPrefix / sentence.length * 100);
      bar.style.width = `${percent}%`;
      progressText.textContent = `${matchingPrefix} / ${sentence.length}`;
      refreshButton();
    };

    const refreshButton = () => {
      const remaining = Math.max(0, MINIMUM_WAIT_MS - (performance.now() - challengeStarted));
      if (remaining > 0) {
        button.disabled = true;
        button.textContent = `Ready in ${Math.ceil(remaining / 1000)}s`;
        return;
      }
      button.textContent = 'Verify';
      button.disabled = input.value.length === 0;
    };

    const newChallenge = (message = '') => {
      clearInterval(countdownTimer);
      sentence = chooseSentence();
      challengeStarted = performance.now();
      trustedCharacters = 0;
      typingTimes = [];
      input.value = '';
      input.maxLength = sentence.length;
      status.textContent = message;
      status.classList.toggle('is-error', Boolean(message));

      characterNodes = Array.from(sentence, character => {
        const span = document.createElement('span');
        span.className = randomClass();
        span.textContent = character;
        span.draggable = false;
        span.setAttribute('aria-hidden', 'true');
        return span;
      });
      sentenceDisplay.replaceChildren(...characterNodes);
      sentenceDisplay.setAttribute('aria-label', sentence);
      updateCharacterProgress();
      countdownTimer = setInterval(refreshButton, 200);
      input.focus({ preventScroll: true });
    };

    const rhythmLooksHuman = () => {
      if (trustedCharacters < Math.ceil(sentence.length * .7) || typingTimes.length < 8) return false;
      const intervals = typingTimes.slice(1).map((time, index) => time - typingTimes[index]);
      if (!intervals.length) return false;
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      if (average < 24) return false;
      const variance = intervals.reduce((sum, value) => sum + ((value - average) ** 2), 0) / intervals.length;
      const deviation = Math.sqrt(variance);
      const uniqueRhythms = new Set(intervals.map(value => Math.round(value / 3))).size;
      return deviation >= 2.5 && uniqueRhythms >= 3;
    };

    const fail = () => {
      failures += 1;
      const message = 'Verification failed. Please try again.';
      if (failures >= MAX_FAILURES) {
        failures = 0;
        newChallenge(message);
      } else {
        status.textContent = message;
        status.classList.add('is-error');
        input.select();
      }
    };

    input.addEventListener('beforeinput', event => {
      if (['insertFromPaste', 'insertFromDrop', 'insertReplacementText'].includes(event.inputType)) {
        event.preventDefault();
        return;
      }
      if (event.isTrusted && event.inputType.startsWith('insert') && event.data) {
        const now = performance.now();
        for (let index = 0; index < event.data.length; index += 1) typingTimes.push(now + index * .01);
        trustedCharacters += event.data.length;
      }
    });

    input.addEventListener('input', event => {
      if (!event.isTrusted) {
        trustedCharacters = 0;
        typingTimes = [];
      }
      status.textContent = '';
      status.classList.remove('is-error');
      updateCharacterProgress();
    });

    card.addEventListener('submit', event => {
      event.preventDefault();
      const waitedLongEnough = performance.now() - challengeStarted >= MINIMUM_WAIT_MS;
      if (!waitedLongEnough || input.value !== sentence || !rhythmLooksHuman() || !behaviorAnalyzer.passes()) {
        fail();
        return;
      }

      clearInterval(countdownTimer);
      stopBehaviorAnalysis();
      saveSessionVerification();
      gate.classList.add('is-leaving');
      gate.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        protectedNodes.forEach(node => { node.inert = false; });
        document.body.classList.remove('verification-locked');
        mount.remove();
        document.querySelector('#app a, #app button, #header a, #header button')?.focus({ preventScroll: true });
      }, 460);
    });

    gate.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [input, button].filter(node => !node.disabled);
      if (!focusable.length) return;
      const current = focusable.indexOf(document.activeElement);
      if (event.shiftKey && current <= 0) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && current === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    });

    newChallenge();
    requestAnimationFrame(() => gate.classList.add('is-visible'));
  }

  if (document.readyState === 'complete') startVerification();
  else window.addEventListener('load', startVerification, { once: true });
})();
