// Transform Obsidian Markdown to HTML snippet, keeping filenames inline
function transformObsidianMarkdown(md, model) {
  let html = "";
  if (model) {
    html = `<div class="mode-info">${model}</div>`;
  }
  if (md.startsWith("<!-- HTML -->")) {
    console.debug("html only");
    return html + md;
  }
  let sections = [];
  const regex = /FILENAME: (.+)\n([\s\S]*?)(?=FILENAME: |$)/g;

  // find sections
  for (const [, filename, content] of md.matchAll(regex)) {
    sections.push({ filename, content });
  }
  if (sections.length > 0) {
    sections.forEach((section, index) => {
      const htmlContent = window.marked ? marked.parse(section.content) : section.content.replace(/\n/g, '<br>');
      html += `
        <details class="file-section" ${index === 0 ? 'open' : ''}>
          <summary class="filename-info" onclick="document.querySelectorAll('.file-section').forEach(s=>{ if(s!==this.parentNode){ s.open = false; } });">
            FILENAME: ${section.filename}
          </summary>
          <div class="file-content">
            ${htmlContent}
          </div>
        </details>
      `;
    });
  } else {
    html = window.marked ? marked.parse(md) : md.replace(/\n/g, '<br>');
  }

  // Transform wikilinks [[Page|alias]] and [[Page]]
  html = html.replace(/\[\[([^\|\]]+)\|?([^\]]*)\]\]/g, (_m, p, a) => {
    const text = a || p;
    const escaped = text.replace(/'/g, "\\'");
    return `<a href="#" onclick="fillAndSend('${escaped}');return false;">${text}</a>`;
  });

  return html;
}

// Convert markdown to plain text for clipboard
function markdownToPlainText(md) {
  // Restore line breaks and remove markdown constructs
  let text = md;
  // Remove lines starting with FILENAME:
  text = text.replace(/^FILENAME:.*$/gm, '');
  // Convert markdown headers to uppercase
  text = text.replace(/^#+\s*(.*)$/gm, (_match, content) => content.toUpperCase());
  // Convert markdown checkboxes to simple bullet points
  text = text.replace(/^[*-]\s*\[[ xX]\]\s*(.*)$/gm, '- $1');
  // Transform wikilinks [[Page|alias]] and [[Page]]
  text = text.replace(/\[\[([^\|\]]+)\|?([^\]]*)\]\]/g, (_, p, a) => a || p);
  // Remove markdown links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  // Remove bold and italic markers **, __, *, _
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  // Remove any remaining markdown link brackets
  text = text.replace(/\[\[|\]\]/g, '');
  // Remove any empty lines at the start of the text
  text = text.replace(/^(?:\s*\r?\n)+/, '');
  return text;
}

// Fill the user input window with given text and press Send
function fillAndSend(text) {
  const input = document.querySelector('#user-input');
  if (input) {
    input.value = text;
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
  }
  const form = document.getElementById('chat-form');
    if (form.requestSubmit) {
        form.requestSubmit();
    } else {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
}

// Share text with a configurable Telegram channel via a backend endpoint
async function shareWithTelegram(endpoint, text) {

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: text, chat_id: "-4983351353" }),
    });

    if (!response.ok) {
      let errorDetails = 'No details available.';
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text();
      }
      console.error(`Failed to share with Telegram. Status: ${response.status}. Details: ${errorDetails}`);
      alert(`Failed to share message with Telegram: ${response.statusText}`);
      return;
    }

    console.log('Message shared with Telegram successfully.');
  } catch (error) {
    console.error('An error occurred while trying to share with Telegram:', error);
    alert('An error occurred while trying to share with Telegram. Check the console for details.');
  }
}
