// API domain configuration
const apiDomain = 'http://fabric-friclu.duckdns.org/api'; // Hardcoded default since process.env isn't available in browser
// API endpoints based on apiDomain
const apiUrl = `${apiDomain}/chat`;
const patternsUrl = `${apiDomain}/patterns/names`;
const modelsUrl = `${apiDomain}/models/names`;
const obsidianUrl = `${apiDomain}/obsidian/files`;

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const patternInput = document.getElementById('pattern-input');
const modelSelect = document.getElementById('model-select');
const obsidianSelect = document.getElementById('obsidian-select');
const messagesEl = document.getElementById('messages');

async function loadPatterns() {
  try {
    const res = await fetch(patternsUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const patterns = await res.json();
    patternInput.innerHTML = '';
    patterns.forEach(p => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      if (p === 'general') o.selected = true;
      patternInput.appendChild(o);
    });
  } catch (e) {
    console.error(e);
    addMessage(`Error loading patterns: ${e.message}`, 'bot');
  }
}

async function loadModels() {
  const defaults = ['o4-mini', 'claude-3-7-sonnet-latest', 'deepseek-reasoner'];
  modelSelect.innerHTML = '';
  defaults.forEach(m => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    modelSelect.appendChild(o);
  });
  modelSelect.value = 'o4-mini';
}

async function loadObsidianFiles() {
  try {
    const res = await fetch(obsidianUrl);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const files = await res.json();
    obsidianSelect.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '(no file)';
    obsidianSelect.appendChild(noneOpt);
    files.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      obsidianSelect.appendChild(o);
    });
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
  const pattern = patternInput.value || 'general';
  const model = modelSelect.value || 'gpt-4';
  const obs = obsidianSelect.value || '';
  if (!text) return;
  addMessage(text, 'user');
  input.value = '';
  showLoading();

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
  loadPatterns();
  loadModels();
  loadObsidianFiles();
});
