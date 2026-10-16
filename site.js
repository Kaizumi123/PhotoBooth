/* Shared page shell: loading state, landing decoration, and offline cache. */
window.addEventListener('DOMContentLoaded', () => {
  const landing = document.getElementById('landing');
  const navigation = document.getElementById('main-nav');
  const colorPicker = document.getElementById('landing-color');
  const colorValue = document.getElementById('landing-color-value');
  const textColorPicker = document.getElementById('landing-text-color');
  const textColorValue = document.getElementById('landing-text-color-value');
  const themeSettings = document.getElementById('theme-settings');
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
    navigator.serviceWorker.register('./sw.js?v=20261015.19').catch(error => {
      console.warn('SnapBooth offline cache could not be updated:', error);
    });
  }
});

function initHelpAssistant() {
  const root = document.createElement('section');
  root.className = 'help-assistant';
  root.setAttribute('aria-label', 'SnapBooth AI help assistant');
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
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.reply !== 'string') {
        throw new Error(typeof result.error === 'string' ? result.error : 'The assistant is unavailable. Please try again shortly.');
      }
      history.push({ role: 'assistant', content: result.reply });
      addMessage(result.reply, 'assistant');
    } catch (error) {
      addMessage(error.message || 'I can’t reach the assistant right now. Please try again shortly.', 'assistant');
    } finally {
      input.disabled = false;
      send.disabled = false;
      send.textContent = '↑';
      input.focus();
    }
  });
}
