
let currentSession = new Date().toISOString();  // generate timestamp to use as session
let lastSession = '';  // store the previous session ID
let lastPrompt = '';  // store last user prompt
let isChatButtonPressed = false;  // track if chat button was pressed

// API domain configuration
const apiDomain = 'https://fabric-friclu.duckdns.org/api'; // Hardcoded default since process.env isn't available in browser
// const apiDomain = 'http://localhost:8080'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns/names`;
const patternsGenerateUrl = `${apiDomain}/patterns/generate`;
const obsidianUrl = `${apiDomain}/obsidian/files`;
const storeUrl = `${apiDomain}/storelast`;

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const messagesEl = document.getElementById('messages');

// Ensure user-input is a single-line text field
input.setAttribute('type', 'text');
input.setAttribute('rows', '1');
input.style.resize = 'none';

// Create enhanced select elements to replace standard pulldowns
function createEnhancedSelect(id, placeholder) {
  const container = document.createElement('div');
  container.classList.add('enhanced-select');

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = `${id}-search`;
  searchInput.className = 'form-control';
  searchInput.placeholder = placeholder;

  // Add focus event to select all text when clicked
  searchInput.addEventListener('focus', () => {
    searchInput.select();
  });

  const dropdownMenu = document.createElement('div');
  dropdownMenu.classList.add('dropdown-menu');
  dropdownMenu.id = `${id}-dropdown`;

  container.appendChild(searchInput);
  container.appendChild(dropdownMenu);

  // Show dropdown on focus
  searchInput.addEventListener('focus', () => {
    dropdownMenu.classList.add('show');
  });

  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdownMenu.classList.remove('show');
    }
  });

  // Filter items on input
  searchInput.addEventListener('input', () => {
    const filter = searchInput.value.trim().toLowerCase();
    const items = dropdownMenu.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = filter === '' || text.includes(filter) ? 'block' : 'none';
      item.classList.remove('active');
    });
  });

  // Keyboard navigation for dropdown items
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

    // Add items to the dropdown
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

    // Get the currently selected value
    getValue() {
      return searchInput.dataset.value || searchInput.value;
    }
  };
}

// Create enhanced selects
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
    const defaultFile = '(no file)';
    obsidianSelect.setItems(allOptions, defaultFile);
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
  b.innerHTML = text;
  m.appendChild(b);
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

  // Generate new session ID for each new submission unless chat button was pressed
  if (!isChatButtonPressed) {
    // Save current session as last session before generating a new one
    lastSession = currentSession;
    currentSession = new Date().toISOString();
  } else {
    // Use the last session when chat button is pressed
    currentSession = lastSession;
    // Reset the flag after using it
    isChatButtonPressed = false;
  }

  lastPrompt = text;  // store the prompt for the chat button
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
    const b = document.createElement('div');
    b.classList.add('bubble');
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
            b.innerHTML += c.replace(/\n/g, '<br>');
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } catch {}
        }
      }
    }
  } catch (err) {
    hideLoading();
    addMessage(`Error: ${err.message}`, 'bot');
  } finally {
    input.value = '';  // clear input after sending
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Replace the original select elements with enhanced ones
  const patternInputOriginal = document.getElementById('pattern-input');
  const modelSelectOriginal = document.getElementById('model-select');
  const obsidianSelectOriginal = document.getElementById('obsidian-select');
  patternInputOriginal.parentNode.replaceChild(patternSelect.container, patternInputOriginal);
  modelSelectOriginal.parentNode.replaceChild(modelSelect.container, modelSelectOriginal);
  obsidianSelectOriginal.parentNode.replaceChild(obsidianSelect.container, obsidianSelectOriginal);

  // Add CSS for enhanced selects and uniform buttons
  const style = document.createElement('style');
  style.textContent = `
    .enhanced-select {
      position: relative;
      margin-bottom: 1rem;
    }
    .enhanced-select .dropdown-menu {
      width: 100%;
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
      background-color: yellow;
      border-color: yellow;
      color: #000;
    }
  `;
  document.head.appendChild(style);

  generatePatterns();
  loadModels();
  loadObsidianFiles();

  // Add select all text functionality to user input field
  input.addEventListener('focus', () => {
    input.select();
  });

  // Send the form on Enter key for single-line input
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

  // Change clear button to chat button
  const chatBtn = document.getElementById('clear-button');
  chatBtn.id = 'chat-button';
  chatBtn.textContent = 'Chat';
  // When chat button is pressed, resend last prompt with same session
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

  // Add Store button to call storelast endpoint
  const storeBtn = document.createElement('button');
  storeBtn.id = 'store-button';
  storeBtn.type = 'button';
  storeBtn.textContent = 'Store';
  chatBtn.parentNode.insertBefore(storeBtn, chatBtn);
  storeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastPrompt) return;
    try {
      const res = await fetch(storeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName: currentSession, prompt: lastPrompt })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      addMessage('Stored last result', 'bot');
    } catch (err) {
      addMessage(`Error storing: ${err.message}`, 'bot');
    }
    input.focus();
  });
});
