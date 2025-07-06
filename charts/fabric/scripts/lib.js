
// Transform Obsidian Markdown to HTML snippet, keeping filenames inline
function transformObsidianMarkdown(md) {
    let html = '';
    let sections = [];
    const regex = /^FILENAME: (.+)\n([\s\S]*?)(?=^FILENAME: |$)/g;

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
        // display as italic bold plain text
        return `<i><b>${text}</b></i>`;
    });

    return html;
}

// Convert markdown to plain text for clipboard
function markdownToPlainText(md) {
    // Restore line breaks and remove markdown constructs
    let text = md;
    // Remove lines starting with FILENAME:
    text = text.replace(/^FILENAME:.*$/gm, '');
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
