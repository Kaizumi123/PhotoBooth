/* Shared page shell: loading state, landing decoration, and offline cache. */
window.addEventListener('DOMContentLoaded', () => {
  const feedbackForm = document.querySelector('.feedback-form');
  const feedbackStatus = document.querySelector('.feedback-status');
  if (feedbackForm && feedbackStatus) {
    feedbackForm.addEventListener('submit', async event => {
      event.preventDefault();
      const submitButton = feedbackForm.querySelector('[type="submit"]');
      const buttonText = submitButton?.innerHTML;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending…';
      }
      feedbackStatus.textContent = 'Sending your feedback…';
      try {
        const body = new URLSearchParams(new FormData(feedbackForm));
        const response = await fetch(location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        if (!response.ok) throw new Error(`Feedback submission failed (${response.status})`);
        feedbackForm.reset();
        feedbackStatus.textContent = 'Thank you! Your feedback was sent.';
      } catch (error) {
        console.error('Feedback could not be submitted:', error);
        feedbackStatus.textContent = 'Sorry, feedback could not be sent. Please try again later.';
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML = buttonText || 'Send feedback';
        }
      }
    });
  }

  const landing = document.getElementById('landing');
  const navigation = document.getElementById('main-nav');
  const colorPicker = document.getElementById('landing-color');
  const colorValue = document.getElementById('landing-color-value');
  const textColorPicker = document.getElementById('landing-text-color');
  const textColorValue = document.getElementById('landing-text-color-value');
  const themeSettings = document.getElementById('theme-settings');
  const studioDate = document.getElementById('studio-current-date');
  const defaultLandingColor = '#d95d91';
  let currentLandingColor = defaultLandingColor;
  let customLandingTextColor = '';

  function updateLandingForeground() {
    const red = parseInt(currentLandingColor.slice(1, 3), 16);
    const green = parseInt(currentLandingColor.slice(3, 5), 16);
    const blue = parseInt(currentLandingColor.slice(5, 7), 16);
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
    const foreground = customLandingTextColor || (brightness > 160 ? '#30242a' : '#fffafc');
    landing?.style.setProperty('--landing-foreground', foreground);
    navigation?.style.setProperty('--landing-foreground', foreground);
    if (textColorPicker) textColorPicker.value = foreground;
    if (textColorValue) textColorValue.textContent = customLandingTextColor ? foreground.toUpperCase() : 'Auto';
  }

  function setLandingColor(value, persist = true) {
    if (!/^#[\da-f]{6}$/i.test(value)) return;
    const color = value.toLowerCase();
    currentLandingColor = color;
    if (landing) {
      landing.style.setProperty('--landing-bg', color);
    }
    navigation?.style.setProperty('--landing-bg', color);
    updateLandingForeground();
    if (colorPicker) colorPicker.value = color;
    if (colorValue) colorValue.textContent = color.toUpperCase();
    if (persist) {
      try { localStorage.setItem('sb_landing_color', color); } catch (_) {}
    }
  }

  let savedLandingColor = defaultLandingColor;
  try { savedLandingColor = localStorage.getItem('sb_landing_color') || defaultLandingColor; } catch (_) {}
  try {
    const savedTextColor = localStorage.getItem('sb_landing_text_color');
    if (savedTextColor && /^#[\da-f]{6}$/i.test(savedTextColor)) customLandingTextColor = savedTextColor.toLowerCase();
  } catch (_) {}
  setLandingColor(savedLandingColor, false);
  colorPicker?.addEventListener('input', () => setLandingColor(colorPicker.value));
  textColorPicker?.addEventListener('input', () => {
    if (!/^#[\da-f]{6}$/i.test(textColorPicker.value)) return;
    customLandingTextColor = textColorPicker.value.toLowerCase();
    updateLandingForeground();
    try { localStorage.setItem('sb_landing_text_color', customLandingTextColor); } catch (_) {}
  });
  document.getElementById('landing-text-auto')?.addEventListener('click', () => {
    customLandingTextColor = '';
    try { localStorage.removeItem('sb_landing_text_color'); } catch (_) {}
    updateLandingForeground();
  });
  document.querySelectorAll('[data-theme-preset]').forEach(button => {
    button.addEventListener('click', () => setLandingColor(button.dataset.themePreset));
  });
  document.getElementById('theme-reset')?.addEventListener('click', () => {
    customLandingTextColor = '';
    try { localStorage.removeItem('sb_landing_text_color'); } catch (_) {}
    setLandingColor(defaultLandingColor);
    if (themeSettings) themeSettings.open = false;
  });

  initHelpAssistant();

  function updateStudioDate() {
    if (!studioDate) return;
    const now = new Date();
    const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    studioDate.dateTime = localDate;
    studioDate.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(now);
  }
  updateStudioDate();
  window.setInterval(updateStudioDate, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateStudioDate();
  });

  const year = document.getElementById('copyright-year');
  if (year) year.textContent = String(new Date().getFullYear());

  const preloader = document.getElementById('preloader');
  if (preloader) setTimeout(() => preloader.classList.add('done'), 420);

  const particles = document.getElementById('particles');
  if (particles) {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 24; index++) {
      const particle = document.createElement('span');
      particle.className = 'particle';
      particle.setAttribute('aria-hidden', 'true');
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 8}s`;
      particle.style.animationDuration = `${6 + Math.random() * 8}s`;
      fragment.appendChild(particle);
    }
    particles.replaceChildren(fragment);
  }

  const burger = document.getElementById('nav-burger');
  const menu = document.getElementById('nav-mobile-menu');
  if (burger && menu) {
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') !== 'true';
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('open', open);
      menu.setAttribute('aria-hidden', String(!open));
    });
    menu.addEventListener('click', event => {
      if (!(event.target instanceof Element) || !event.target.closest('a')) return;
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
    });
  }

  if (!('serviceWorker' in navigator)) return;
  const isLocalDevelopment = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  if (isLocalDevelopment) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      const appRegistrations = registrations.filter(registration =>
        [registration.active, registration.waiting, registration.installing].some(worker =>
          worker && new URL(worker.scriptURL).pathname.endsWith('/sw.js')
        )
      );
      return Promise.all(appRegistrations.map(registration => registration.unregister()));
    }).then(() => caches.keys()).then(keys =>
      Promise.all(keys.filter(key => key.startsWith('snapbooth-')).map(key => caches.delete(key)))
    ).catch(error => console.warn('Could not clear the local SnapBooth cache:', error));
  } else if (location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js?v=20261017.70').catch(error => {
      console.warn('SnapBooth offline cache could not be updated:', error);
    });
  }
});

function initHelpAssistant() {
  const localOnly = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const root = document.createElement('section');
  root.className = 'help-assistant';
  root.setAttribute('aria-label', 'SnapBooth help assistant');
  root.innerHTML = `
    <button class="assistant-launcher" type="button" aria-expanded="false" aria-controls="assistant-panel">
      <span aria-hidden="true">✦</span><span>Ask for help</span>
    </button>
    <div class="assistant-panel" id="assistant-panel" hidden>
      <header class="assistant-header">
        <div><span class="assistant-mark" aria-hidden="true">✦</span><span><strong>SnapBooth helper</strong><small>Here to help you get unstuck</small></span></div>
        <button class="assistant-close" type="button" aria-label="Close help assistant">×</button>
      </header>
      <div class="assistant-messages" role="log" aria-live="polite" aria-relevant="additions">
        <p class="assistant-message assistant-message-bot">Hi! Ask me about camera access, filters, photo effects, or saving your pictures.</p>
      </div>
      <div class="assistant-suggestions" aria-label="Suggested questions">
        <button type="button">My camera won’t start</button>
        <button type="button">How do I save a photo?</button>
      </div>
      <form class="assistant-form">
        <label class="sr-only" for="assistant-question">Ask a question</label>
        <input id="assistant-question" name="question" maxlength="1000" placeholder="Type your question…" autocomplete="off" required />
        <button type="submit" aria-label="Send question">↑</button>
      </form>
      <p class="assistant-privacy">Please don’t share private or sensitive information.</p>
    </div>`;
  document.body.appendChild(root);

  const launcher = root.querySelector('.assistant-launcher');
  const panel = root.querySelector('.assistant-panel');
  const close = root.querySelector('.assistant-close');
  const messages = root.querySelector('.assistant-messages');
  const form = root.querySelector('.assistant-form');
  const input = root.querySelector('#assistant-question');
  const send = form.querySelector('button[type="submit"]');
  const history = [];

  if (localOnly) {
    root.querySelector('.assistant-header small').textContent = 'Local AI · configure a key for any question';
    messages.querySelector('.assistant-message-bot').textContent = 'I can answer general questions when the local AI server has a key. Without one, I can still help with common booth issues.';
    root.querySelector('.assistant-privacy').textContent = 'With a local key, questions are sent to OpenAI through this computer.';
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  }
  function addMessage(text, role) {
    const message = document.createElement('p');
    message.className = `assistant-message ${role === 'user' ? 'assistant-message-user' : 'assistant-message-bot'}`;
    message.textContent = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }
  function addTypingIndicator() {
    const indicator = document.createElement('p');
    indicator.className = 'assistant-message assistant-message-bot assistant-typing';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-label', 'Assistant is typing');
    indicator.innerHTML = '<span>Typing</span><span class="assistant-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    messages.appendChild(indicator);
    messages.scrollTop = messages.scrollHeight;
    return indicator;
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  root.querySelectorAll('.assistant-suggestions button').forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.textContent;
      form.requestSubmit();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      launcher.focus();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || send.disabled) return;
    addMessage(question, 'user');
    history.push({ role: 'user', content: question });
    input.value = '';
    input.disabled = true;
    send.disabled = true;
    send.textContent = '…';
    const typingStartedAt = performance.now();
    const typingIndicator = addTypingIndicator();
    try {
      let reply = '';
      try {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-12) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.reply !== 'string') {
          if (!localOnly) throw new Error(typeof result.error === 'string' ? result.error : 'The assistant is unavailable. Please try again shortly.');
          reply = response.status === 502 && typeof result.error === 'string'
            ? result.error
            : localBoothReply(question);
        } else {
          reply = result.reply;
        }
      } catch (error) {
        if (!localOnly) throw error;
        reply = localBoothReply(question);
      }
      const typingDelay = Math.max(0, 450 - (performance.now() - typingStartedAt));
      if (typingDelay) await new Promise(resolve => setTimeout(resolve, typingDelay));
      typingIndicator.remove();
      history.push({ role: 'assistant', content: reply });
      addMessage(reply, 'assistant');
    } catch (error) {
      typingIndicator.remove();
      addMessage(error.message || 'I can’t reach the assistant right now. Please try again shortly.', 'assistant');
    } finally {
      typingIndicator.remove();
      input.disabled = false;
      send.disabled = false;
      send.textContent = '↑';
      input.focus();
    }
  });
}

function localBoothReply(question) {
  const text = question.toLowerCase();
  const mentions = (...terms) => terms.some(term => text.includes(term));

  if (mentions('camera', 'webcam', 'black screen', 'permission', 'video')) {
    return 'Allow camera access in your browser’s site settings, then refresh the page. Close other apps that may be using the camera and try again.';
  }
  if (mentions('strip', 'layout', 'polaroid', 'film', 'grid', 'horizontal')) {
    return 'Choose a strip style, then take the photos. It uses Strip ×2 automatically; choose Strip ×4 in the Mode controls if you want four photos.';
  }
  if (mentions('download', 'save', 'gallery', 'where are my photos')) {
    return 'After taking a photo, use PNG or JPG to download it. Choose Save to add it to this browser’s local gallery.';
  }
  if (mentions('close', 'x button', 'ekis', 'output photo', 'result photo')) {
    return 'Tap the pink × in the top-right of the output screen to close it and return to the Studio.';
  }
  if (mentions('gif', 'boomerang', 'moving photo')) {
    return 'Choose GIF or Boomerang in the Mode controls before capturing. Those modes create a moving photo instead of a still strip.';
  }
  if (mentions('filter', 'effect', 'frame', 'sticker', 'watermark')) {
    return 'Choose a filter, frame, or effect in the Studio before capturing. The selected look is included in the photo.';
  }
  if (mentions('capture', 'take a photo', 'shutter', 'countdown', 'button')) {
    return 'Choose Single, Strip ×2, or Strip ×4 in Mode, then press the large capture button. If asked, allow camera access.';
  }
  if (mentions('phone', 'mobile', 'cellphone')) {
    return 'This local address works on this computer only. To use the booth on a phone, open the deployed HTTPS site or share a secure local preview.';
  }
  return 'I can answer common SnapBooth questions offline. For general questions, the local server needs a valid OpenAI key; restart it and enter the key at its hidden prompt.';
}
