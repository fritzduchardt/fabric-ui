// Transform Obsidian Markdown to HTML snippet, keeping filenames inline
function transformObsidianMarkdown(md) {

  let html = "";
  let contentWithoutMetadata = md;
  let metadataTags = [];
  const { contentWithoutMetadata: extractedContent, metadata } = extractMetadata(md);
  contentWithoutMetadata = extractedContent;

  if (metadata) {
    const lines = metadata.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key && value) {
          metadataTags.push({ key, value });
        }
      }
    }
  }

  if (metadataTags.length > 0) {
    html = `<div class="bubble-info-tags">`;
    for (const tag of metadataTags) {
      const keyLower = tag.key.toLowerCase();
      const shouldRemovePrefix = keyLower === 'pattern' || keyLower === 'model';
      const text = shouldRemovePrefix ? `${tag.value}` : `${tag.key}: ${tag.value}`;
      const escaped = text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<span class="bubble-info-tag" title="${escaped}" data-full-text="${escaped}">${escaped}</span>`;
    }
    html += `</div>`;
  }

  if (md.startsWith("<!-- HTML -->")) {
    return html + contentWithoutMetadata;
  }

  let sections = [];
  const regex = /FILENAME: (.+)\n([\s\S]*?)(?=FILENAME: |$)/g;

  // find sections
  for (const [, filename, content] of contentWithoutMetadata.matchAll(regex)) {
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
    html += window.marked ? marked.parse(contentWithoutMetadata) : contentWithoutMetadata.replace(/\n/g, '<br>');
  }

  // Parse HTML to handle code blocks
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const codeBlocks = [];
  let placeholderIndex = 0;

  // Extract content from <code> and <pre> elements
  doc.querySelectorAll('code, pre').forEach(el => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${placeholderIndex}__`;
    codeBlocks.push({ placeholder, content: el.innerHTML });
    el.innerHTML = placeholder;
    placeholderIndex++;
  });

  doc.querySelectorAll('.bubble-info-tag').forEach(el => {
    const fullText = el.textContent || '';
    el.dataset.fullText = fullText;
    el.dataset.collapsedText = fullText;
    el.setAttribute('title', fullText);
  });

  // Ensure tables have a light gray border
  doc.querySelectorAll('table').forEach(table => {
    table.style.border = '1px solid #d3d3d3';
    table.style.borderCollapse = 'collapse';
    table.querySelectorAll('th, td').forEach(cell => {
      cell.style.border = '1px solid #d3d3d3';
      cell.style.padding = '2px';
    });
  });

  // Get the modified HTML string
  let modifiedHtml = doc.body.innerHTML;

  // Transform wikilinks outside of code blocks
  modifiedHtml = modifiedHtml.replace(/\[\[([^\|\]]+)\|?([^\]]*)\]\]/g, (_m, p, a) => {
    const text = a || p;
    const escaped = text.replace(/'/g, "\\'");
    return `<a href="#" onclick="fillAndSend('${escaped}');return false;">${text}</a>`;
  });

  // Restore code block contents
  codeBlocks.forEach(({ placeholder, content }) => {
    modifiedHtml = modifiedHtml.replace(placeholder, content);
  });

  return modifiedHtml;
}

function extractMetadata(md) {
  const lines = md.split('\n');
  let metadataLines = [];
  let inMetadata = false;
  let metadataStart = -1;
  let metadataEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') {
      if (!inMetadata) {
        inMetadata = true;
        metadataStart = i;
      } else {
        metadataEnd = i;
        break;
      }
    } else if (inMetadata) {
      metadataLines.push(line);
    }
  }
  let metadata = '';
  if (metadataStart !== -1 && metadataEnd !== -1) {
    metadata = metadataLines.join('\n');
  }
  let contentLines = lines.slice(0, metadataStart).concat(lines.slice(metadataEnd + 1));
  let contentWithoutMetadata = contentLines.join('\n');
  return { contentWithoutMetadata, metadata };
}

// Convert HTML table to markdown table
function htmlTableToMarkdown(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (rows.length === 0) return '';
  const markdownRows = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent.trim());
    return '| ' + cells.join(' | ') + ' |';
  });
  // Add header separator if first row has th
  const firstRowCells = rows[0].querySelectorAll('td, th');
  if (firstRowCells.length > 0 && rows[0].querySelector('th')) {
    const headerCount = firstRowCells.length;
    markdownRows.splice(1, 0, '|' + ' --- |'.repeat(headerCount));
  }
  return markdownRows.join('\n');
}

// Convert markdown to plain text for clipboard
function markdownToPlainText(md) {
  let text = md;
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  text = text.replace(/^FILENAME:.*$/gm, '');
  text = text.replace(/^#+\s*(.*)$/gm, (_match, content) => content.toUpperCase());
  text = text.replace(/^[*-]\s*\[[ xX]\]\s*(.*)$/gm, '- $1');
  text = text.replace(/\[\[([^\|\]]+)\|?([^\]]*)\]\]/g, (_, p, a) => a || p);
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `${t} ${url}`);
  text = text.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/\[\[|\]\]/g, '');
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
