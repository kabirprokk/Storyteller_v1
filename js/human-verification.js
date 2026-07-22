/*
 * Storyteller session verification gate.
 * This is a client-side automation deterrent, not a replacement for server authorization or RLS.
 */
(() => {
  'use strict';

  const SESSION_KEY = 'storyteller.humanVerified.v1';
  const MINIMUM_WAIT_MS = 5000;
  const MAX_FAILURES = 3;

  // Eight fragments in each group create 8 x 8 x 8 = 512 unique 18-20 word sentences.
  const OPENINGS = Object.freeze([
    'The quiet traveler follows moonlit roads',
    'A patient reader gathers forgotten stories',
    'Every curious writer notices hidden details',
    'The gentle morning carries thoughtful voices',
    'One careful visitor watches changing shadows',
    'A bright lantern reveals winding pathways',
    'The distant river remembers ancient journeys',
    'Each open window welcomes honest wonder',
  ]);

  const MIDDLES = Object.freeze([
    'while patient lanterns guide distant footsteps',
    'as warm breezes move through silent gardens',
    'when careful hands preserve meaningful moments',
    'before golden sunlight reaches sleeping rooftops',
    'while small discoveries inspire generous conversations',
    'as steady rain awakens peaceful city streets',
    'when kind strangers exchange remarkable ideas',
    'before evening colors settle across quiet fields',
  ]);

  const ENDINGS = Object.freeze([
    'near the valley before morning arrives',
    'beside old books beneath a silver sky',
    'among tall trees where patient birds listen',
    'through the village after distant bells fade',
    'beyond the bridge where new paths begin',
    'inside the library as the daylight softens',
    'around the harbor while calm waters shimmer',
    'under bright stars until the horizon glows',
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
      const message = 'Verification failed. Try again.';
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
      if (!waitedLongEnough || input.value !== sentence || !rhythmLooksHuman()) {
        fail();
        return;
      }

      clearInterval(countdownTimer);
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
