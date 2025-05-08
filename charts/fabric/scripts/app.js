
// API domain configuration
const apiDomain = 'https://fabric-friclu.duckdns.org/api'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns/names`;
const modelsUrl = `${apiDomain}/models/names`;
const obsidianUrl = `${apiDomain}/obsidian/files`;

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const messagesEl = document.getElementById('messages');

// Create enhanced select elements to replace standard pulldowns
function createEnhancedSelect(id, placeholder) {
  const container = document.createElement('div');
  container.classList.add('enhanced-select');

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = `${id}-search`;
  searchInput.className = 'form-control';
  searchInput.placeholder = placeholder;

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
    });
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

          // Dispatch change event
          const changeEvent = new Event('change', { bubbles: true });
          searchInput.dispatchEvent(changeEvent);
        });

        dropdownMenu.appendChild(dropdownItem);
      });

      // Set default value if provided
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
    // choose obsidian_author if available, otherwise general
    const defaultPattern = patterns.includes('obsidian_author') ? 'obsidian_author' : 'general';
    patternSelect.setItems(patterns, defaultPattern);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading patterns: ${e.message}`, 'bot');
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
    // default to 'sleep' file if present
    const defaultFile = files.includes('Health/Sleep.md') ? 'Health/Sleep.md' : '(no file)';
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
  const pattern = patternSelect.getValue() || 'general';
  const model = modelSelect.getValue() || 'gpt-4';
  const obs = obsidianSelect.getValue() === '(no file)' ? '' : obsidianSelect.getValue();

  if (!text) return;
  addMessage(text, 'user');
  showLoading(); // do not clear input here to preserve user input

  let temperature;
  if (model === 'o4-mini') {
    temperature = 1.0;
  } else {
    temperature = 0.7;
  }

  try {
    const payload = {
      prompts: [{
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

  // Add CSS for enhanced selects
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
  `;
  document.head.appendChild(style);

  loadPatterns();
  loadModels();
  loadObsidianFiles();

  // add clear button next to user input to allow manual clearing
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.id = 'clear-input-button';
  clearBtn.className = 'btn btn-outline-secondary ms-2';
  clearBtn.textContent = 'Clear';
  input.parentNode.insertBefore(clearBtn, input.nextSibling);
  clearBtn.addEventListener('click', () => {
    input.value = '';
    input.focus();
  });
});
