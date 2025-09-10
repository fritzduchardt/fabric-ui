let currentSession = new Date().toISOString();  // generate timestamp to use as session
let lastSession = '';  // store the previous session ID
let lastPrompt = '';  // store last user prompt
let isChatButtonPressed = false;  // track if chat button was pressed
let abortController = null;  // controller for cancelling requests
let isRequestCancelled = false; // flag for cancellation during retry waits

const funnyRetryMessages = [
    "Hang on, the hamsters are spinning up the wheel again...",
    "Just a moment, we're negotiating with the server gnomes...",
    "Reticulating splines...",
    "The server is having a moment. Let's try that again.",
    "Attempting to summon the digital spirits... Again.",
    "Our carrier pigeon seems to have gotten lost. Resending...",
    "Don't worry, we've dispatched a team of highly trained monkeys.",
    "Trying to reconnect to the Matrix...",
    "The server is playing hard to get. Let's be persistent.",
    "Poking the server with a stick...",
    "It's not you, it's me... I mean, the server. Retrying.",
    "Let's give it another go. Third time's the charm, right?",
    "The bits are flowing, just a little upstream. Trying again.",
    "Our AI is contemplating the meaning of life. One more try.",
    "Waking up the server from its nap...",
    "Sending positive vibes to the server... and another request.",
    "Hold tight, we're trying a different magic spell.",
    "The server is probably just shy. Let's try again.",
    "I think the server is on a coffee break. Let's wait and retry.",
    "Re-calibrating the flux capacitor...",
    "The server is busy watching cat videos. Retrying.",
    "Maybe if we ask nicely this time? Retrying...",
    "Our intern tripped over the server cable. Fixing and retrying.",
    "Just a glitch in the simulation. We're on it.",
    "The server is checking its horoscope. Let's try again in a sec.",
    "I've got a good feeling about this next attempt.",
    "Is this thing on? *taps mic* Retrying...",
    "We're sending in the backup squirrels. Stand by.",
    "The server seems to be running on dial-up. Patience, young padawan.",
    "Okay, deep breaths. We can do this. Retrying..."
];

// API domain configuration
const apiDomain = 'http://localhost:8080'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns`;
const patternsGenerateUrl = `${apiDomain}/patterns/generate`;
const obsidianUrl = `${apiDomain}/obsidian/files`;
const patternDeleteUrl = `${apiDomain}/deletepattern`;
const obsidianFileUrl = `${apiDomain}/obsidian/file`;
const telegramUrl = `${apiDomain}/telegram/send`;
const storeUrl = `${apiDomain}/store`;

// Model to vendor mapping
const modelVendorMap = {
  'o4-mini': 'OpenAI',
  'gpt-5-mini': 'OpenAI',
  'gemini-2.5-pro': 'Gemini',
  'claude-3-5-sonnet': 'Anthropic',
  'claude-3-opus': 'Anthropic',
  'grok-4-0709': 'GrokAI',
  'claude-3-7-sonnet-latest': 'Anthropic',
  'claude-3-opus-latest': 'Anthropic'
};

async function loadModels() {
  const defaults = ['o3-mini', 'o4-mini', 'claude-3-7-sonnet-latest', 'gpt-5-mini'];
  modelSelect.setItems(defaults, 'o3-mini');
}


// Helper to throw error with status and body message
async function checkResponse(res) {
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${errText}`);
  }
  return res;
}

// Handles storing a message to a file
async function storeMessageHandler(e, bubble) {
    const btn = e.currentTarget;
    e.preventDefault();
    e.stopPropagation();
    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm ms-2';
    spinner.role = 'status';
    spinner.ariaHidden = 'true';
    btn.appendChild(spinner);
    try {
        let data;
        // retry until backend call succeeds
        while (true) {
            try {
                const res = await fetch(storeUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionName: currentSession, prompt: bubble.dataset.markdown })
                });
                await checkResponse(res);
                data = await res.json();
                break;
            } catch (err) {
                console.error('Error storing message, retrying...', err);
                // wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        const fns = data.filenames || [];
        if (fns.length) {
            const info = document.createElement('div');
            info.className = 'filename-info';
            info.innerHTML = `Stored under ${fns.map(fn => `<i><b>${fn}</b></i>`).join(', ')}`;
            bubble.appendChild(info);
        }
        await generatePatterns();
        await loadObsidianFiles();
        btn.disabled = true;
    } catch (err) {
        console.error(err);
        addMessage(`Error storing message (${err.message})`, 'bot', false,  false, true, true, true);
    } finally {
        spinner.remove();
    }
}

// Adds a "Store" button to a message bubble if it contains a FILENAME
function addStoreButtonIfNeeded(bubble) {
  if (bubble.querySelector('.store-message-button')) return;

  const text = bubble.dataset.markdown;
  if (text.match(/^FILENAME:\s*(.+)$/m)) {
    const btn = document.createElement('button');
    btn.className = 'store-message-button';
    btn.textContent = 'Store';
    btn.addEventListener('click', (e) => storeMessageHandler(e, bubble));
    bubble.appendChild(btn);
  }
}

function addPromptButtonIfNeeded(b) {
  const mdTrim = b.dataset.markdown.trim();
  if (mdTrim && mdTrim.toLowerCase() !== 'no further instructions') {
    const promptBtn = document.createElement('button');
    promptBtn.className = 'prompt-again-button';
    promptBtn.textContent = 'Prompt';
    promptBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = b.dataset.markdown;
      input.focus();
      const pos = input.value.length;
      input.setSelectionRange(pos, pos);
    });
    b.appendChild(promptBtn);
  }
}

function addShareWithTelegramButton(b) {
  const shareBtn = document.createElement('button');
  shareBtn.className = 'share-button';
  shareBtn.textContent = 'Share';
  shareBtn.disabled = false;
  shareBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    shareWithTelegram(telegramUrl, markdownToPlainText(b.dataset.markdown));
    shareBtn.disabled = true;
  });
  b.appendChild(shareBtn);
}

// Adds "Copy" and "Top" buttons to a bot message bubble
function addCopyAndTopButtonsIfNeeded(bubble) {
    const text = bubble.dataset.markdown;
    if (bubble.querySelector('.copy-button') || text.startsWith('Error') || text === 'Request cancelled' || text.startsWith('Deleted')) {
        return;
    }
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('mousedown', () => copyBtn.classList.add('pressed'));
    copyBtn.addEventListener('mouseup', () => copyBtn.classList.remove('pressed'));
    copyBtn.addEventListener('mouseleave', () => copyBtn.classList.remove('pressed'));
    copyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imageLinks = Array.from(bubble.querySelectorAll('a')).filter(a => a.querySelector('img'));
        if (imageLinks.length) {
            try {
                const items = await Promise.all(imageLinks.map(async a => {
                    const img = a.querySelector('img');
                    const src = img.src;
                    const res = await fetch(src);
                    const blob = await res.blob();
                    return new ClipboardItem({ [blob.type]: blob });
                }));
                await navigator.clipboard.write(items);
            } catch (err) {
                console.error(err);
            }
        } else {
            navigator.clipboard.writeText(markdownToPlainText(bubble.dataset.markdown)).catch(console.error);
        }
    });
    bubble.appendChild(copyBtn);
    updateTopButton(bubble);
}

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const messagesEl = document.getElementById('messages');

// Ensure user-input is a two-line text field
input.setAttribute('rows', '2');
input.style.resize = 'none';

// Create enhanced select elements to replace standard pulldowns
function createEnhancedSelect(id, placeholder) {
  const container = document.createElement('div');
  container.classList.add('enhanced-select');
  if (id === 'model-select') {
    container.style.width = '120px';
  } else {
    container.style.width = '100%';
  }

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = `${id}-search`;
  searchInput.className = 'form-control';
  searchInput.placeholder = placeholder;
  searchInput.style.width = '100%';
  if (id === 'model-select') {
    searchInput.readOnly = true;
    searchInput.style.cursor = 'pointer';
  } else {
    searchInput.addEventListener('focus', () => {
      searchInput.select();
    });
  }

  const dropdownMenu = document.createElement('div');
  dropdownMenu.classList.add('dropdown-menu');
  dropdownMenu.id = `${id}-dropdown`;
  if (id === 'model-select') {
    dropdownMenu.style.width = '200%';
    dropdownMenu.style.left = 'auto';
    dropdownMenu.style.right = '0';
  } else {
    dropdownMenu.style.width = '100%';
    dropdownMenu.style.left = '0';
    dropdownMenu.style.right = '0';
  }

  container.appendChild(searchInput);
  container.appendChild(dropdownMenu);

  // Clear previous text when dropdown opens
  searchInput.addEventListener('focus', () => {
    searchInput.value = '';
    dropdownMenu.classList.add('show');
  });
  if (id === 'model-select') {
    searchInput.addEventListener('click', () => {
      searchInput.value = '';
      dropdownMenu.classList.add('show');
    });
  }

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
        dropdownItem.style.display = 'flex';              // use flex for alignment
        dropdownItem.style.alignItems = 'center';         // center items vertically

        if (id === 'obsidian-select' && item !== '(no file)') {
          const showBtn = document.createElement('button');
          showBtn.className = 'show-file-button';
          showBtn.textContent = 'Sw';
          showBtn.style.marginLeft = 'auto';              // push Sw button to the right
          showBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            searchInput.value = item;
            searchInput.dataset.value = item;
            const changeEvent = new Event('change', { bubbles: true });
            searchInput.dispatchEvent(changeEvent);
            dropdownMenu.classList.remove('show');
            try {
              const res = await fetch(`${obsidianFileUrl}/${encodeURIComponent(item)}`);
              await checkResponse(res);
              const content = await res.text();
              addMessage(content, 'bot', false,  true, true, false, false);
              // Add Delete button to the message produced by Sw
              const lastMsg = messagesEl.querySelector('.message.bot:last-child');
              const bubble = lastMsg.querySelector('.bubble');
              const deleteBtn = document.createElement('button');
              deleteBtn.className = 'delete-file-message-button';
              deleteBtn.textContent = 'Delete';
              deleteBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                try {
                  const delRes = await fetch(`${obsidianFileUrl}/${encodeURIComponent(item)}`, { method: 'DELETE' });
                  await checkResponse(delRes);
                  await loadObsidianFiles();
                  // remove the message bubble
                  lastMsg.remove();
                  addMessage(`Deleted file ${item}`, 'bot', false,  false, true, true, true);
                } catch (err) {
                  console.error(err);
                  addMessage(`Error deleting file (${err.message})`, 'bot', false,  false, true, true, true);
                }
              });
              bubble.appendChild(deleteBtn);
            } catch (err) {
              console.error(err);
              addMessage(`Error loading file (${err.message})`, 'bot', false,  false, true, true, true);
            }
          });
          dropdownItem.appendChild(showBtn);
        }

        if (id === 'pattern-input') {
          const showPatternBtn = document.createElement('button');
          showPatternBtn.className = 'show-pattern-button';
          showPatternBtn.textContent = 'Sw';
          showPatternBtn.style.marginLeft = 'auto';        // push Sw button to the right
          showPatternBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            searchInput.value = item;
            searchInput.dataset.value = item;
            const changeEvent = new Event('change', { bubbles: true });
            searchInput.dispatchEvent(changeEvent);
            dropdownMenu.classList.remove('show');
            try {
              const res = await fetch(`${patternsUrl}/${encodeURIComponent(item)}`);
              await checkResponse(res);
              const data = await res.json();
              const md = data.Pattern;
              addMessage(`${md}`, 'bot', false,  true, true, true, true);
              const lastMsg = messagesEl.querySelector('.message.bot:last-child');
              const bubble = lastMsg.querySelector('.bubble');
              const deletePatBtn = document.createElement('button');
              deletePatBtn.className = 'delete-pattern-message-button';
              deletePatBtn.textContent = 'Delete';
              deletePatBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                try {
                  const delRes = await fetch(`${patternDeleteUrl}/${encodeURIComponent(item)}`, { method: 'DELETE' });
                  await checkResponse(delRes);
                  await generatePatterns();
                  // remove the message bubble
                  lastMsg.remove();
                  addMessage(`Deleted pattern ${item}`, 'bot', false,  false, true, true, true);
                } catch (err) {
                  console.error(err);
                  addMessage(`Error deleting pattern (${err.message})`, 'bot', false,  false, true, true, true);
                }
              });
              bubble.appendChild(deletePatBtn);
            } catch (err) {
              console.error(err);
              addMessage(`Error loading pattern (${err.message})`, 'bot', false,  false, true, true, true);
            }
          });
          dropdownItem.appendChild(showPatternBtn);
        }

        dropdownItem.addEventListener('click', (e) => {
          if (e.target.tagName === 'BUTTON') return;
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
    const prevPattern = patternSelect.getValue();
    let patterns;
    // retry until backend call succeeds
    while (true) {
      try {
        const res = await fetch(`${patternsUrl}/names`);
        await checkResponse(res);
        patterns = await res.json();
        break;
      } catch (err) {
        console.error('Error loading patterns, retrying...', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const defaultPattern = prevPattern && patterns.includes(prevPattern) ? prevPattern : 'general';
    patternSelect.setItems(patterns, defaultPattern);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading patterns (${e.message})`, 'bot', false,  false, true, true, true);
  }
}

async function generatePatterns() {
  try {
    const res = await fetch(patternsGenerateUrl, { method: 'POST' });
    await checkResponse(res);
    await loadPatterns();
  } catch (e) {
    console.error(e);
    addMessage(`Error generating patterns (${e.message})`, 'bot', false,  false, true, true, true);
  }
}

async function loadObsidianFiles() {
  try {
    let files;
    // retry until backend call succeeds
    while (true) {
      try {
        const res = await fetch(obsidianUrl);
        await checkResponse(res);
        files = await res.json();
        break;
      } catch (err) {
        console.error('Error loading files, retrying...', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    const allOptions = ['(no file)', ...files];
    const prevFile = obsidianSelect.getValue();
    const defaultFile = prevFile && allOptions.includes(prevFile) ? prevFile : '(no file)';
    obsidianSelect.setItems(allOptions, defaultFile);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading files (${e.message})`, 'bot', false,  false, true, true, true);
  }
}

// Manages the visibility of the 'Top' button on a message bubble
function updateTopButton(bubble) {
  const topButton = bubble.querySelector('.top-button');
  const shouldHaveButton = bubble.offsetHeight > messagesEl.clientHeight;

  if (shouldHaveButton && !topButton) {
    const newTopBtn = document.createElement('button');
    newTopBtn.className = 'top-button';
    newTopBtn.textContent = 'Top';
    newTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const copyButton = bubble.querySelector('.copy-button');
    if (copyButton) {
      bubble.insertBefore(newTopBtn, copyButton);
    } else {
      bubble.appendChild(newTopBtn);
    }
  } else if (!shouldHaveButton && topButton) {
    topButton.remove();
  }
}

// Updates all 'Top' buttons in the chat, useful on container resize
function updateAllTopButtons() {
  document.querySelectorAll('.message.bot .bubble:not(.error)').forEach(updateTopButton);
}

// Handles container resizing to dynamically show/hide 'Top' buttons
if (messagesEl) {
  const resizeObserver = new ResizeObserver(updateAllTopButtons);
  resizeObserver.observe(messagesEl);
}

function autoScroll() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// addMessage now accepts hideStore flag to suppress store button on show messages and full-width for Sw
function addMessage(text, sender, isChat = false, view = false, hideStore = false,  hideShare = false, hideCopy = false, showPrompt = false) {
  const m = document.createElement('div');
  m.classList.add('message', sender);
  if (sender === 'user') {
    m.classList.add(isChat ? 'chat' : 'send');
  }
  const b = document.createElement('div');
  b.classList.add('bubble');
  if (view) {
    b.classList.add('full-width'); // full-width for Sw button messages
  }
  if (text.startsWith('Error')) {
    b.classList.add('error');
  }

  // Color retry messages with pastel orange
  if (funnyRetryMessages.some(msg => text.startsWith(msg))) {
    b.style.backgroundColor = '#FFDAB9'; // PeachPuff
  }

  b.dataset.markdown = text;
  b.innerHTML = transformObsidianMarkdown(text);
  if (sender === 'user') {
    b.querySelectorAll('a').forEach(a => {
      const href = a.href;
      const icon = document.createElement('a');
      icon.href = href;
      icon.target = '_blank';
      icon.rel = 'noopener noreferrer';
      icon.textContent = a.textContent;
      icon.style.marginLeft = '4px';
      a.replaceWith(icon);
    });
  }
  m.appendChild(b);

  if (!hideStore) {
      addStoreButtonIfNeeded(b);
  }
  if (!hideCopy) {
    addCopyAndTopButtonsIfNeeded(b);
  }
  if (!hideShare) {
    addShareWithTelegramButton(b);
  }
  if (showPrompt) {
    addPromptButtonIfNeeded(b);
  }
  messagesEl.appendChild(m);

}

function showLoading() {
  const loader = document.createElement('div');
  loader.className = 'loader text-center py-2';
  loader.innerHTML = '<div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div>';
  messagesEl.appendChild(loader);
  autoScroll();
  return loader;
}

function hideLoading(loader) {
  if (loader && loader.parentNode) {
    loader.remove();
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const chatBtn = document.getElementById('chat-button');
  const sendBtn = document.querySelector('.btn-send');
  const cancelBtn = document.getElementById('cancel-button');
  cancelBtn.type = "button";
  chatBtn.disabled = true;
  sendBtn.disabled = false;
  cancelBtn.disabled = false;
  isRequestCancelled = false; // Reset cancellation flag on new submission

  let text = input.value.trim();
  if (text == "") {
    text = "No further instructions"
  }
  const userIsChat = isChatButtonPressed;
  if (!isChatButtonPressed) {
    lastSession = currentSession;
    currentSession = new Date().toISOString();
  } else {
    isChatButtonPressed = false;
  }
  lastPrompt = text;
  localStorage.setItem('lastPrompt', lastPrompt);
  const pattern = patternSelect.getValue() || 'general';
  const model = modelSelect.getValue() || 'o3-mini';
  const obs = obsidianSelect.getValue() === '(no file)' ? '' : obsidianSelect.getValue();
  addMessage(text, 'user', userIsChat,  false, true, true, false, true);
  input.value = '';
  const loader = showLoading();
  let temperature = model === 'o4-mini' ? 1.0 : 0.7;

  let lastError;
  let success = false;

  for (let attempt = 1; attempt <= 10 && !success; attempt++) {
    if (isRequestCancelled) {
        break;
    }
    abortController = new AbortController();
    let messageBubbleElement = null; // To track the created bubble for cleanup

    try {
      const payload = {
        prompts: [{
          sessionName: currentSession,
          userInput: text,
          vendor: modelVendorMap[model],
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
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      await checkResponse(res);

      hideLoading(loader);
      const m = document.createElement('div');
      messageBubbleElement = m; // Assign for potential cleanup
      m.classList.add('message', 'bot');
      m.style.position = 'relative';
      const b = document.createElement('div');
      b.classList.add('bubble');
      b.style.maxWidth = '100%';
      b.dataset.markdown = '';
      m.appendChild(b);
      messagesEl.appendChild(m);

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
              b.innerHTML = transformObsidianMarkdown(b.dataset.markdown, model);
              b.classList.add('full-width'); // full-width for Sw button messages
              b.querySelectorAll('a').forEach(a => {
                if (a.querySelector('img') || /\.(png|jpe?g|gif|svg)(\?.*)?$/i.test(a.href)) return;
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
              });
              addStoreButtonIfNeeded(b);
              addPromptButtonIfNeeded(b);
              addShareWithTelegramButton(b);
            } catch {}
          }
        }
      }

      if (b.dataset.markdown.trim() === '' || b.dataset.markdown.trim() === 'Error: empty response') {
        throw new Error('No response from server. Try again.');
      }

      if (!b.classList.contains('error')) {
        addCopyAndTopButtonsIfNeeded(b);
      }

      success = true; // Mark as success to exit the loop

    } catch (err) {
      lastError = err;

      if (messageBubbleElement) {
        messageBubbleElement.remove(); // Clean up failed bubble
      }

      if (err.name === 'AbortError') {
        success = true; // Exit loop, will be handled by isRequestCancelled flag
      } else {
        console.error(`Attempt ${attempt} failed:`, err);
        if (attempt < 10) {
          const randomIndex = Math.floor(Math.random() * funnyRetryMessages.length);
          const retryMessage = funnyRetryMessages[randomIndex];
          addMessage(`${retryMessage} (${attempt})`, 'bot', false, false, true, true, true);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
  }

  hideLoading(loader);
  if (isRequestCancelled) {
    addMessage('Request cancelled', 'bot', false, false, true, true, true);
  } else if (!success && lastError) {
    addMessage(`Error (${lastError.message})`, 'bot', false,  false, true, true, true);
  }

  // Finally block
  chatBtn.disabled = false;
  sendBtn.disabled = false;
  const cancelBtn2 = document.getElementById('cancel-button');
  if (cancelBtn2) cancelBtn2.disabled = true;
  abortController = null;
});

document.addEventListener('DOMContentLoaded', () => {
  const savedLastPrompt = localStorage.getItem('lastPrompt');
  if (savedLastPrompt) {
    lastPrompt = savedLastPrompt;
    input.value = lastPrompt;
  }

  const mdScript = document.createElement('script');
  mdScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  document.head.appendChild(mdScript);

  const patternInputOriginal = document.getElementById('pattern-input');
  const modelSelectOriginal = document.getElementById('model-select');
  const obsidianSelectOriginal = document.getElementById('obsidian-select');
  patternInputOriginal.parentNode.replaceChild(patternSelect.container, patternInputOriginal);
  modelSelectOriginal.parentNode.replaceChild(modelSelect.container, modelSelectOriginal);
  obsidianSelectOriginal.parentNode.replaceChild(obsidianSelect.container, obsidianSelectOriginal);

  const chatBtn = document.getElementById('chat-button');
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'cancel-button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.disabled = true;
  cancelBtn.className = 'btn btn-secondary';
  chatBtn.parentNode.insertBefore(cancelBtn, chatBtn.nextSibling);
  cancelBtn.addEventListener('click', () => {
    isRequestCancelled = true;
    if (abortController) abortController.abort();
  });

  const loader = showLoading();
  Promise.all([generatePatterns(), loadObsidianFiles()]).finally(() => hideLoading(loader));
  loadModels();

  input.addEventListener('focus', () => {
    input.select();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });

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
