
let currentSession = new Date().toISOString();  // generate timestamp to use as session
let lastSession = '';  // store the previous session ID
let lastPrompt = '';  // store last user prompt
let isChatButtonPressed = false;  // track if chat button was pressed

// API domain configuration
const apiDomain = 'http://localhost:8080'; // Hardcoded default since process.env isn't available in browser
// const apiDomain = 'https://fabric-friclu.duckdns.org/api'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns/names`;
const patternsGenerateUrl = `${apiDomain}/patterns/generate`;
const obsidianUrl = `${apiDomain}/obsidian/files`;
const storeUrl = `${apiDomain}/store`;

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const messagesEl = document.getElementById('messages');

// Ensure user-input is a two-line text field
input.setAttribute('rows', '2');
input.style.resize = 'none';

// Transform Obsidian Markdown to HTML snippet
function transformObsidianMarkdown(md) {
  // Check for FILENAME: at the beginning of the content
  let filenameInfo = '';
  let content = md;

  // Look for FILENAME: at the start of a line
  const filenameMatch = md.match(/^FILENAME:\s*(.+)$/m);
  if (filenameMatch) {
    filenameInfo = filenameMatch[0];
    // Remove the filename line from the content
    content = md.replace(filenameMatch[0], '').trim();
  }

  // Strip out checkboxes
  content = content.replace(/\[ \]/g, ''); // Remove unchecked boxes
  content = content.replace(/\[x\]/gi, ''); // Remove checked boxes (case insensitive)

  let html = window.marked ? marked.parse(content) : content.replace(/\n/g, '<br>');
  // Transform wikilinks [[Page|alias]] and [[Page]]
  html = html.replace(/\[\[([^\|\]]+)\|?([^\]]*)\]\]/g, (_m, p, a) => {
    const text = a || p;
    // display as italic bold plain text
    return `<i><b>${text}</b></i>`;
  });

  // If we found a filename, add it to the top of the content in a small font with word-wrap
  if (filenameInfo) {
    html = `<div class="filename-info">${filenameInfo}</div>${html}`;
  }

  return html;
}

// Create enhanced select elements to replace standard pulldowns
function createEnhancedSelect(id, placeholder) {
  const container = document.createElement('div');
  container.classList.add('enhanced-select');
  container.style.width = '100%';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = `${id}-search`;
  searchInput.className = 'form-control';
  searchInput.placeholder = placeholder;
  searchInput.style.width = '100%';
  searchInput.addEventListener('focus', () => {
    searchInput.select();
  });

  const dropdownMenu = document.createElement('div');
  dropdownMenu.classList.add('dropdown-menu');
  dropdownMenu.id = `${id}-dropdown`;
  dropdownMenu.style.width = '100%';
  dropdownMenu.style.left = '0';
  dropdownMenu.style.right = '0';

  container.appendChild(searchInput);
  container.appendChild(dropdownMenu);

  searchInput.addEventListener('focus', () => {
    dropdownMenu.classList.add('show');
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdownMenu.classList.remove('show');
    }
  });

  searchInput.addEventListener('input', () => {
    const filter = searchInput.value.trim().toLowerCase();
    const items = dropdownMenu.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = filter === '' || text.includes(filter) ? 'block' : 'none';
      item.classList.remove('active');
    });
  });

  searchInput.addEventListener('keydown', (e) => {
    const isOpen = dropdownMenu.classList.contains('show');
    if (!isOpen) return;
    const items = Array.from(dropdownMenu.querySelectorAll('.dropdown-item'))
      .filter(item => item.style.display !== 'none');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      let currentIndex = items.findIndex(item => item.classList.contains('active'));
      let nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items.forEach(i => i.classList.remove('active'));
      const activeItem = items[nextIndex];
      activeItem.classList.add('active');
      activeItem.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      let currentIndex = items.findIndex(item => item.classList.contains('active'));
      let nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items.forEach(i => i.classList.remove('active'));
      const activeItem = items[nextIndex];
      activeItem.classList.add('active');
      activeItem.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const visibleItems = Array.from(dropdownMenu.querySelectorAll('.dropdown-item'))
        .filter(item => item.style.display !== 'none');
      if (visibleItems.length === 1) {
        e.preventDefault();
        visibleItems[0].click();
      } else {
        const active = dropdownMenu.querySelector('.dropdown-item.active');
        if (active) {
          e.preventDefault();
          active.click();
        }
      }
    } else if (e.key === 'Escape') {
      dropdownMenu.classList.remove('show');
    }
  });

  return {
    container,
    searchInput,
    dropdownMenu,
    setItems(items, defaultValue = '') {
      dropdownMenu.innerHTML = '';
      items.forEach(item => {
        const dropdownItem = document.createElement('a');
        dropdownItem.classList.add('dropdown-item');
        dropdownItem.href = '#';
        dropdownItem.textContent = item;
        dropdownItem.dataset.value = item;
        dropdownItem.addEventListener('click', (e) => {
          e.preventDefault();
          searchInput.value = item;
          searchInput.dataset.value = item;
          dropdownMenu.classList.remove('show');
          const changeEvent = new Event('change', { bubbles: true });
          searchInput.dispatchEvent(changeEvent);
        });
        dropdownMenu.appendChild(dropdownItem);
      });
      if (defaultValue && items.includes(defaultValue)) {
        searchInput.value = defaultValue;
        searchInput.dataset.value = defaultValue;
      } else if (items.length > 0) {
        searchInput.value = items[0];
        searchInput.dataset.value = items[0];
      }
    },
    getValue() {
      return searchInput.dataset.value || searchInput.value;
    }
  };
}

const patternSelect = createEnhancedSelect('pattern-input', 'Search patterns');
const modelSelect = createEnhancedSelect('model-select', 'Search models');
const obsidianSelect = createEnhancedSelect('obsidian-select', 'Search files');

async function loadPatterns() {
  try {
    const res = await fetch(patternsUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const patterns = await res.json();
    const defaultPattern = patterns.includes('obsidian_author') ? 'obsidian_author' : 'general';
    patternSelect.setItems(patterns, defaultPattern);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading patterns: ${e.message}`, 'bot');
  }
}

async function generatePatterns() {
  try {
    const res = await fetch(patternsGenerateUrl, { method: 'POST' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    await loadPatterns();
  } catch (e) {
    console.error(e);
    addMessage(`Error generating patterns: ${e.message}`, 'bot');
  }
}

async function loadModels() {
  const defaults = ['o4-mini', 'claude-3-7-sonnet-latest', 'deepseek-reasoner'];
  modelSelect.setItems(defaults, 'o4-mini');
}

async function loadObsidianFiles() {
  try {
    const res = await fetch(obsidianUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const files = await res.json();
    const allOptions = ['(no file)', ...files];
    obsidianSelect.setItems(allOptions, '(no file)');
  } catch (e) {
    console.error(e);
    addMessage(`Error loading files: ${e.message}`, 'bot');
  }
}

function addMessage(text, sender) {
  const m = document.createElement('div');
  m.classList.add('message', sender);
  const b = document.createElement('div');
  b.classList.add('bubble');
  b.dataset.markdown = text;
  b.innerHTML = transformObsidianMarkdown(text);
  m.appendChild(b);
  // if this message contains a filename, add a little store button inside the bubble
  if (text.match(/^FILENAME:\s*(.+)$/m)) {
    const btn = document.createElement('button');
    btn.className = 'store-message-button';
    btn.textContent = 'Store';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const res = await fetch(storeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName: currentSession, prompt: b.dataset.markdown })
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        const fn = data.filename || '';
        const info = document.createElement('div');
        info.className = 'filename-info';
        info.innerHTML = `Stored under <i><b>${fn}</b></i>`;
        b.appendChild(info);
        btn.disabled = true;
      } catch (err) {
        console.error(err);
      }
    });
    b.appendChild(btn);
  }
  // add prompt again button for user messages
  if (sender === 'user') {
    const promptBtn = document.createElement('button');
    promptBtn.className = 'prompt-again-button';
    promptBtn.textContent = 'Prompt Again';
    promptBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = b.dataset.markdown;
      input.select();
      input.focus();
    });
    b.appendChild(promptBtn);
  }
  messagesEl.appendChild(m);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showLoading() {
  const loader = document.createElement('div');
  loader.id = 'loader';
  loader.className = 'text-center py-2';
  loader.innerHTML = '<div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>';
  messagesEl.appendChild(loader);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideLoading() {
  const l = document.getElementById('loader');
  if (l) l.remove();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  if (!isChatButtonPressed) {
    lastSession = currentSession;
    currentSession = new Date().toISOString();
  } else {
    currentSession = lastSession;
    isChatButtonPressed = false;
  }

  lastPrompt = text;

  const pattern = patternSelect.getValue() || 'general';
  const model = modelSelect.getValue() || 'gpt-4';
  const obs = obsidianSelect.getValue() === '(no file)' ? '' : obsidianSelect.getValue();

  addMessage(text, 'user');
  showLoading();
  let temperature = model === 'o4-mini' ? 1.0 : 0.7;

  try {
    const payload = {
      prompts: [{
        sessionName: currentSession,
        userInput: text,
        vendor: "openai",
        model,
        contextName: "general_context.md",
        patternName: pattern,
        strategyName: "",
        obsidianFile: obs
      }],
      language: "en",
      temperature: temperature,
      topP: 1.0,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0
    };
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify(payload)
    });
    hideLoading();
    const m = document.createElement('div');
    m.classList.add('message', 'bot');
    m.style.position = 'relative';
    const b = document.createElement('div');
    b.classList.add('bubble');
    b.style.maxWidth = '100%'; // Use entire width of screen for response messages
    b.dataset.markdown = '';
    m.appendChild(b);
    messagesEl.appendChild(m);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let done = false, buf = '';
    while (!done) {
      const { value, done: dr } = await reader.read();
      done = dr;
      if (value) {
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (d === '[DONE]') { done = true; break; }
          try {
            const obj = JSON.parse(d);
            const c = obj.content || '';
            b.dataset.markdown += c;
            b.innerHTML = transformObsidianMarkdown(b.dataset.markdown);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            const filenameMatch = b.dataset.markdown.match(/^FILENAME:\s*(.+)$/m);
            if (filenameMatch) {
              if (!m.querySelector('.store-message-button')) {
                const storeMsgBtn = document.createElement('button');
                storeMsgBtn.className = 'store-message-button';
                storeMsgBtn.textContent = 'Store';
                storeMsgBtn.addEventListener('click', async (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  try {
                    const resp = await fetch(storeUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionName: currentSession, message: b.dataset.markdown })
                    });
                    if (!resp.ok) throw new Error(`Status ${resp.status}`);
                    const data = await resp.json();
                    const fn = data.filename || '';
                    const info = document.createElement('div');
                    info.className = 'filename-info';
                    info.innerHTML = `Stored under <i><b>${fn}</b></i>`;
                    b.appendChild(info);
                    storeMsgBtn.disabled = true;
                  } catch (err) {
                    console.error(err);
                  }
                });
                b.appendChild(storeMsgBtn);
              }
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    hideLoading();
    addMessage(`Error: ${err.message}`, 'bot');
  } finally {
    input.value = '';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const mdScript = document.createElement('script');
  mdScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  document.head.appendChild(mdScript);

  const patternInputOriginal = document.getElementById('pattern-input');
  const modelSelectOriginal = document.getElementById('model-select');
  const obsidianSelectOriginal = document.getElementById('obsidian-select');
  patternInputOriginal.parentNode.replaceChild(patternSelect.container, patternInputOriginal);
  modelSelectOriginal.parentNode.replaceChild(modelSelect.container, modelSelectOriginal);
  obsidianSelectOriginal.parentNode.replaceChild(obsidianSelect.container, obsidianSelectOriginal);

  const style = document.createElement('style');
  style.textContent = `
    .message { position: relative; }
    .bubble { position: relative; }
    .store-message-button {
      bottom: 4px;
      left: 8px;
      font-size: 0.75rem;
      padding: 2px 4px;
    }
    .prompt-again-button {
      bottom: 4px;
      right: 8px;
      font-size: 0.75rem;
      padding: 2px 4px;
    }
    .enhanced-select {
      position: relative;
      margin-bottom: 1rem;
      width: 100%;
    }
    .enhanced-select .form-control {
      width: 100%;
    }
    .enhanced-select .dropdown-menu {
      width: 100% !important;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
    }
    .enhanced-select .dropdown-menu.show {
      display: block;
    }
    .dropdown-item.active {
      background-color: #007bff;
      color: #fff;
    }
    #chat-form button {
      min-width: 100px;
      padding: 0.375rem 0.75rem;
      font-size: 1rem;
      height: 2.5rem;
      margin-right: 0.5rem;
    }
    #chat-button {
      background-color: #77dd77;
      border-color: #77dd77;
      color: #fff;
    }
    #chat-button:hover {
      background-color: #66cc66;
      border-color: #66cc66;
    }
    .obsidian-link {
      color: #3a86ff;
      text-decoration: none;
    }
    .obsidian-link:hover {
      text-decoration: underline;
    }
    .message.bot .bubble {
      max-width: 100% !important; /* Override the default max-width */
    }
    .filename-info {
      font-size: 9pt;
      background-color: #f0f0f0;
      border-radius: 4px;
      padding: 2px 4px;
      color: #666;
      word-wrap: break-word;
      margin-bottom: 0.5rem;
    }
  `;
  document.head.appendChild(style);

  generatePatterns();
  loadModels();
  loadObsidianFiles();

  input.addEventListener('focus', () => {
    input.select();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });

  // On double-click, restore and select the last prompt in the textarea
  input.addEventListener('dblclick', () => {
    if (lastPrompt) {
      input.value = lastPrompt;
      input.select();
    }
  });

  const chatBtn = document.getElementById('chat-button');
  chatBtn.id = 'chat-button';
  chatBtn.textContent = 'Chat';
  chatBtn.addEventListener('click', () => {
    if (!lastPrompt) return;
    isChatButtonPressed = true;
    if (form.requestSubmit) {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
    input.focus();
  });
});
