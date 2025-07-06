#!/usr/bin/env bash
let currentSession = new Date().toISOString();  // generate timestamp to use as session
let lastSession = '';  // store the previous session ID
let lastPrompt = '';  // store last user prompt
let isChatButtonPressed = false;  // track if chat button was pressed
let abortController = null;  // controller for cancelling requests

// API domain configuration
const apiDomain = 'http://localhost:8080'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns`;
const patternsGenerateUrl = `${apiDomain}/patterns/generate`;
const obsidianUrl = `${apiDomain}/obsidian/files`;
const patternDeleteUrl = `${apiDomain}/deletepattern`;
const obsidianFileUrl = `${apiDomain}/obsidian/file`;
const storeUrl = `${apiDomain}/store`;

// Helper to throw error with status and body message
async function checkResponse(res) {
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${errText}`);
  }
  return res;
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
  container.style.width = '100%';

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
  dropdownMenu.style.width = '100%';
  dropdownMenu.style.left = '0';
  dropdownMenu.style.right = '0';

  container.appendChild(searchInput);
  container.appendChild(dropdownMenu);

  searchInput.addEventListener('focus', () => {
    dropdownMenu.classList.add('show');
  });
  if (id === 'model-select') {
    searchInput.addEventListener('click', () => {
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
          showBtn.textContent = 'Show';
          showBtn.style.marginLeft = 'auto';              // push Show button to the right
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
              addMessage(content, 'bot', false, true);
            } catch (err) {
              console.error(err);
              addMessage(`Error loading file (${err.message})`, 'bot');
            }
          });
          dropdownItem.appendChild(showBtn);

          const delBtn = document.createElement('button');
          delBtn.className = 'delete-file-button';
          delBtn.textContent = 'Del';
          delBtn.style.marginLeft = '8px';                  // small gap after Show button
          delBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const res = await fetch(`${obsidianFileUrl}/${encodeURIComponent(item)}`, { method: 'DELETE' });
              await checkResponse(res);
              await loadObsidianFiles();
              addMessage(`Deleted file ${item}`, 'bot');
            } catch (err) {
              console.error(err);
              addMessage(`Error deleting file (${err.message})`, 'bot');
            }
          });
          dropdownItem.appendChild(delBtn);
        }

        if (id === 'pattern-input') {
          const showPatternBtn = document.createElement('button');
          showPatternBtn.className = 'show-pattern-button';
          showPatternBtn.textContent = 'Show';
          showPatternBtn.style.marginLeft = 'auto';        // push Show button to the right
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
              addMessage(`${md}`, 'bot', false, true);
            } catch (err) {
              console.error(err);
              addMessage(`Error loading pattern (${err.message})`, 'bot');
            }
          });
          dropdownItem.appendChild(showPatternBtn);

          const delPatternBtn = document.createElement('button');
          delPatternBtn.className = 'delete-pattern-button';
          delPatternBtn.textContent = 'Del';
          delPatternBtn.style.marginLeft = 'auto';         // match Show button alignment
          delPatternBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const res = await fetch(`${patternDeleteUrl}/${encodeURIComponent(item)}`, { method: 'DELETE' });
              await checkResponse(res);
              await loadPatterns();
              addMessage(`Deleted pattern ${item}`, 'bot');
            } catch (err) {
              console.error(err);
              addMessage(`Error deleting pattern (${err.message})`, 'bot');
            }
          });
          dropdownItem.appendChild(delPatternBtn);
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
    const res = await fetch(`${patternsUrl}/names`);
    await checkResponse(res);
    const patterns = await res.json();
    const defaultPattern = prevPattern && patterns.includes(prevPattern) ? prevPattern : 'general';
    patternSelect.setItems(patterns, defaultPattern);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading patterns (${e.message})`, 'bot');
  }
}

async function generatePatterns() {
  try {
    const res = await fetch(patternsGenerateUrl, { method: 'POST' });
    await checkResponse(res);
    await loadPatterns();
  } catch (e) {
    console.error(e);
    addMessage(`Error generating patterns (${e.message})`, 'bot');
  }
}

async function loadModels() {
  const defaults = ['o4-mini', 'claude-3-7-sonnet-latest', 'deepseek-reasoner', 'grok-3-mini', 'gemini-2.5-pro-preview-06-05', 'mistral-large-latest'];
  modelSelect.setItems(defaults, 'o4-mini');
}

async function loadObsidianFiles() {
  try {
    const res = await fetch(obsidianUrl);
    await checkResponse(res);
    const files = await res.json();
    const allOptions = ['(no file)', ...files];
    const prevFile = obsidianSelect.getValue();
    const defaultFile = prevFile && allOptions.includes(prevFile) ? prevFile : '(no file)';
    obsidianSelect.setItems(allOptions, defaultFile);
  } catch (e) {
    console.error(e);
    addMessage(`Error loading files (${e.message})`, 'bot');
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

// addMessage now accepts hideStore flag to suppress store button on show messages
function addMessage(text, sender, isChat = false, hideStore = false) {
  const m = document.createElement('div');
  m.classList.add('message', sender);
  if (sender === 'user') {
    m.classList.add(isChat ? 'chat' : 'send');
  }
  const b = document.createElement('div');
  b.classList.add('bubble');
  if (text.startsWith('Error')) {
    b.classList.add('error');
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
      icon.textContent = '🔗';
      icon.style.marginLeft = '4px';
      a.replaceWith(icon);
    });
  }
  m.appendChild(b);
  if (!hideStore && text.match(/^FILENAME:\s*(.+)$/m)) {
    const btn = document.createElement('button');
    btn.className = 'store-message-button';
    btn.textContent = 'Store';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      const spinner = document.createElement('span');
      spinner.className = 'spinner-border spinner-border-sm ms-2';
      spinner.role = 'status';
      spinner.ariaHidden = 'true';
      btn.appendChild(spinner);
      try {
        const res = await fetch(storeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName: currentSession, prompt: b.dataset.markdown })
        });
        await checkResponse(res);
        const data = await res.json();
        const fns = data.filenames || [];
        if (fns.length) {
          const info = document.createElement('div');
          info.className = 'filename-info';
          info.innerHTML = `Stored under ${fns.map(fn => `<i><b>${fn}</b></i>`).join(', ')}`;
          b.appendChild(info);
        }
        await generatePatterns();
        await loadObsidianFiles();
      } catch (err) {
        console.error(err);
        addMessage(`Error storing message (${err.message})`, 'bot');
        btn.disabled = false;
      } finally {
        spinner.remove();
      }
    });
    b.appendChild(btn);
  }
  if (sender === 'user') {
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

  // hide copy button for request cancelled
  if (sender === 'bot' && !text.startsWith('Error') && text !== 'Request cancelled') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('mousedown', () => copyBtn.classList.add('pressed'));
    copyBtn.addEventListener('mouseup', () => copyBtn.classList.remove('pressed'));
    copyBtn.addEventListener('mouseleave', () => copyBtn.classList.remove('pressed'));
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const imageLinks = Array.from(b.querySelectorAll('a')).filter(a => a.querySelector('img'));
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
        navigator.clipboard.writeText(markdownToPlainText(b.dataset.markdown)).catch(console.error);
      }
    });
    b.appendChild(copyBtn);
    updateTopButton(b);
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
  const chatBtn = document.getElementById('chat-button');
  const sendBtn = document.querySelector('.btn-send');
  const cancelBtn = document.getElementById('cancel-button');
  chatBtn.disabled = true;
  sendBtn.disabled = true;
  cancelBtn.disabled = false;
  let text = input.value.trim();
  if (text == "")  {
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
  const pattern = patternSelect.getValue() || 'general';
  const model = modelSelect.getValue() || 'gpt-4';
  const obs = obsidianSelect.getValue() === '(no file)' ? '' : obsidianSelect.getValue();

  addMessage(text, 'user', userIsChat);
  input.value = '';
  showLoading();
  let temperature = model === 'o4-mini' ? 1.0 : 0.7;

  abortController = new AbortController();
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
      body: JSON.stringify(payload),
      signal: abortController.signal
    });
    try {
      await checkResponse(res);
    } catch (err) {
      hideLoading();
      addMessage(`Error ${err.message}`, 'bot');
      return;
    }
    hideLoading();
    const m = document.createElement('div');
    m.classList.add('message', 'bot');
    m.style.position = 'relative';
    const b = document.createElement('div');
    b.classList.add('bubble');
    b.style.maxWidth = '100%';
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
            b.querySelectorAll('a').forEach(a => {
              if (a.querySelector('img') || /\.(png|jpe?g|gif|svg)(\?.*)?$/i.test(a.href)) return;
              a.setAttribute('target', '_blank');
              a.setAttribute('rel', 'noopener noreferrer');
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
            const filenameMatch = b.dataset.markdown.match(/^FILENAME:\s*(.+)$/m);
            if (filenameMatch) {
              if (!b.querySelector('.store-message-button')) {
                const storeMsgBtn = document.createElement('button');
                storeMsgBtn.className = 'store-message-button';
                storeMsgBtn.textContent = 'Store';
                storeMsgBtn.addEventListener('click', async (ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  storeMsgBtn.disabled = true;
                  const sp = document.createElement('span');
                  sp.className = 'spinner-border spinner-border-sm ms-2';
                  sp.role = 'status';
                  sp.ariaHidden = 'true';
                  storeMsgBtn.appendChild(sp);
                  try {
                    const resp = await fetch(storeUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionName: currentSession, prompt: b.dataset.markdown })
                    });
                    await checkResponse(resp);
                    const data = await resp.json();
                    const fns = data.filenames || [];
                    if (fns.length) {
                      const info = document.createElement('div');
                      info.className = 'filename-info';
                      info.innerHTML = `Stored under ${fns.map(fn => `<i><b>${fn}</b></i>`).join(', ')}`;
                      b.appendChild(info);
                    }
                    await generatePatterns();
                    await loadObsidianFiles();
                  } catch (err) {
                    console.error(err);
                    addMessage(`Error storing message (${err.message})`, 'bot');
                    storeMsgBtn.disabled = false;
                  } finally {
                    sp.remove();
                  }
                });
                b.appendChild(storeMsgBtn);
              }
            }
          } catch {}
        }
      }
    }
    if (b.dataset.markdown.trim() === '') {
      b.classList.add('error');
      b.dataset.markdown = 'No response from server. Check configuration and try again.';
      b.innerHTML = transformObsidianMarkdown(b.dataset.markdown);
    } else if (!b.classList.contains('error')) {
      const copyBtnStream = document.createElement('button');
      copyBtnStream.className = 'copy-button';
      copyBtnStream.textContent = 'Copy';
      copyBtnStream.addEventListener('mousedown', () => copyBtnStream.classList.add('pressed'));
      copyBtnStream.addEventListener('mouseup', () => copyBtnStream.classList.remove('pressed'));
      copyBtnStream.addEventListener('mouseleave', () => copyBtnStream.classList.remove('pressed'));
      copyBtnStream.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imageLinks = Array.from(b.querySelectorAll('a')).filter(a => a.querySelector('img'));
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
          navigator.clipboard.writeText(markdownToPlainText(b.dataset.markdown)).catch(console.error);
        }
      });
      b.appendChild(copyBtnStream);
      updateTopButton(b);
    }
  } catch (err) {
    hideLoading();
    if (err.name === 'AbortError') {
      addMessage('Request cancelled', 'bot');
    } else {
      addMessage(`Error (${err.message})`, 'bot');
    }
  } finally {
    chatBtn.disabled = false;
    sendBtn.disabled = false;
    const cancelBtn2 = document.getElementById('cancel-button');
    if (cancelBtn2) cancelBtn2.disabled = true;
    abortController = null;
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

  const chatBtn = document.getElementById('chat-button');
  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'cancel-button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.disabled = true;
  cancelBtn.className = 'btn btn-secondary';
  chatBtn.parentNode.insertBefore(cancelBtn, chatBtn.nextSibling);
  cancelBtn.addEventListener('click', () => {
    if (abortController) abortController.abort();
  });

  showLoading();
  Promise.all([generatePatterns(), loadObsidianFiles()]).finally(() => hideLoading());
  loadModels();

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
