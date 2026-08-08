const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

let stories = [];
let categories = [];
let session = null;
let currentStory = null;
let draftId = null;
let editingStory = null;
let browseState = { category: '', query: '', sort: 'latest' };
let timer = null;
let saveQueue = Promise.resolve();
let readTimer = null;
let filterRequest = 0;
let heroTimer = null;
let adminMode = false;
let accountRole = 'guest';
let likedStoryIds = new Set();
let bookmarkedStoryIds = new Set();
let editorPages = ['<p>Tell your story...</p>'];
let activeEditorPage = 0;
let readerPageIndex = 0;
const PAGE_BREAK = '<hr data-story-page-break="true">';
const logo = 'assets/storyteller-mark-64.png';
const supportEmail = 'kabirsayed.k@gmail.com';
const gmailComposeUrl = (subject = '', body = '') => {
  const parameters = new URLSearchParams({ view: 'cm', fs: '1', to: supportEmail });
  if (subject) parameters.set('su', subject);
  if (body) parameters.set('body', body);
  return `https://mail.google.com/mail/?${parameters}`;
};
const openGmail = (subject = '', body = '') => {
  const url = gmailComposeUrl(subject, body);
  const gmailWindow = window.open(url, '_blank');
  if (gmailWindow) gmailWindow.opener = null;
  else location.assign(url);
};
const brand = `<img class="brand-mark" src="${logo}" alt="" aria-hidden="true"><span>STORYTELLER</span>`;
const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
  bell: '<svg class="lucide lucide-bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>',
  theme: '<svg class="lucide lucide-sun-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2" /><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" /><path d="M16 12a4 4 0 0 0-4-4" /><path d="m19 5-1.256 1.256" /><path d="M20 12h2" /></svg>',
  heart: '<svg class="lucide lucide-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /></svg>',
  bookmark: '<svg class="lucide lucide-bookmark" viewBox="0 0 24 24" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>',
  share: '<svg class="lucide lucide-arrow-up-right" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>',
  donate: '<svg class="lucide lucide-indian-rupee" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12"></path><path d="M6 8h12"></path><path d="m6 13 8.5 8"></path><path d="M6 13h3"></path><path d="M9 13c6.667 0 6.667-10 0-10"></path></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1.1-1.4 2"></path><path d="M12 17h.01"></path></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10"></path><path d="M17 7 7 17"></path></svg>',};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

const dateTime = value => value ? new Date(value).toLocaleString() : 'Not available';
const providerNames = value => Array.isArray(value) ? value.join(', ') : (value || 'Email');
const hasWriterAccess = () => accountRole === 'writer' || accountRole === 'admin';
const contactSourceLink = value => {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `<a class="btn" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Contact source</a>`;
  } catch {
    return `<span class="btn disabled">${esc(source)}</span>`;
  }
};
const instagramLink = value => {
  const handle = String(value || '').trim().replace(/^@/, '');
  return handle ? `<a class="btn" href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer">Instagram @${esc(handle)}</a>` : '';
};
const stripHtml = value => String(value ?? '').replace(/<[^>]*>/g, ' ');
const words = value => String(value ?? '').trim().split(/\s+/).filter(Boolean).length;
const img = story => esc(story?.cover || 'assets/hero-1280.webp');
const avatarMarkup = (url, initials, tone = '') => `<i class="avatar ${tone}">${url
  ? `<img src="${esc(url)}" alt="" loading="lazy">`
  : esc(initials || 'ST')}</i>`;

const titleFromFilename = name => {
  const base = String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, c => c.toUpperCase()) : 'Untitled Story';
};

const htmlFromText = text => String(text ?? '')
  .replace(/\r\n/g, '\n')
  .trim()
  .split(/\n{2,}/)
  .filter(Boolean)
  .map(block => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`)
  .join('');

const textImportMeta = (text, fileName) => {
  const cleaned = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) return { title: titleFromFilename(fileName), subtitle: '', content: '<p></p>' };

  const blocks = cleaned.split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  const first = blocks[0] || '';
  const subtitle = first.length <= 140 && blocks.length > 1 ? first : '';
  const body = subtitle ? blocks.slice(1) : blocks;

  return {
    title: titleFromFilename(fileName),
    subtitle,
    content: body.length ? body.map(block => `<p>${esc(block).replace(/\n/g, '<br>')}</p>`).join('') : '<p></p>',
  };
};

const editorWordCount = (title, subtitle, content) => words([title, subtitle, stripHtml(content)].filter(Boolean).join(' '));
const splitStoryPages = html => {
  const source = String(html || '<p>Tell your story...</p>');
  const pages = source
    .split(/<hr\b[^>]*data-story-page-break(?:="true")?[^>]*>/i)
    .map(page => page.trim())
    .filter(Boolean);
  return pages.length ? pages : ['<p>Tell your story...</p>'];
};
const paginateStoryHtml = (html, maxWords = 520) => {
  const manualPages = splitStoryPages(html);
  const pages = [];
  manualPages.forEach(manualPage => {
    const parsed = new DOMParser().parseFromString(`<div>${manualPage}</div>`, 'text/html');
    const blocks = [...(parsed.body.firstElementChild?.childNodes || [])].filter(node => node.nodeType === 1 || String(node.textContent || '').trim());
    let current = '';
    let count = 0;
    blocks.forEach(block => {
      const blockHtml = block.nodeType === 1 ? block.outerHTML : `<p>${esc(block.textContent || '')}</p>`;
      const blockWords = words(stripHtml(blockHtml));
      if (current && count + blockWords > maxWords) {
        pages.push(current);
        current = '';
        count = 0;
      }
      current += blockHtml;
      count += blockWords;
    });
    if (current) pages.push(current);
  });
  return pages.length ? pages : ['<p>Tell your story...</p>'];
};
const syncActiveEditorPage = () => {
  const editor = $('#storyContent');
  if (editor) editorPages[activeEditorPage] = editor.innerHTML || '<p></p>';
};
const combinedEditorContent = () => {
  syncActiveEditorPage();
  return editorPages.map(page => page.trim() || '<p></p>').join(PAGE_BREAK);
};
const EDITOR_BACKUP_PREFIX = 'storyteller.editorBackup.v1';
const editorBackupKey = id => `${EDITOR_BACKUP_PREFIX}.${session?.user?.id || 'guest'}.${id || draftId || 'new'}`;
const readEditorBackup = id => {
  try {
    const backup = JSON.parse(localStorage.getItem(editorBackupKey(id)) || 'null');
    return backup && Array.isArray(backup.pages) ? backup : null;
  } catch { return null; }
};
const saveEditorBackup = () => {
  if (!$('#storyTitle') || !$('#storyContent')) return;
  syncActiveEditorPage();
  try {
    localStorage.setItem(editorBackupKey(), JSON.stringify({
      title: $('#storyTitle')?.value || '',
      subtitle: $('#storySubtitle')?.value || '',
      category: $('#storyCategory')?.value || '',
      tags: $('#storyTags')?.value || '',
      pages: editorPages,
      activePage: activeEditorPage,
      savedAt: Date.now(),
    }));
  } catch {}
};
const clearEditorBackup = id => {
  try { localStorage.removeItem(editorBackupKey(id)); } catch {}
};
const renderPageManager = () => {
  const tabs = $('#pageTabs');
  if (!tabs) return;
  tabs.innerHTML = editorPages.map((_, index) => `<button class="chip ${index === activeEditorPage ? 'active' : ''}" type="button" data-page-index="${index}">Page ${index + 1}</button>`).join('');
  const counter = $('#pageCounter');
  if (counter) counter.textContent = `${editorPages.length} page${editorPages.length === 1 ? '' : 's'} · editing page ${activeEditorPage + 1}`;
};
const setEditorPage = (index, syncCurrent = true) => {
  const editor = $('#storyContent');
  if (!editor) return;
  if (syncCurrent) syncActiveEditorPage();
  activeEditorPage = Math.max(0, Math.min(index, editorPages.length - 1));
  editor.innerHTML = editorPages[activeEditorPage] || '<p></p>';
  renderPageManager();
  editorStats();
  editor.focus();
};

const sanitizeStoryHtml = html => DOMPurify.sanitize(html || '<p></p>', {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['data-story-page-break', 'target', 'rel'],
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
});

const zipText = bytes => new TextDecoder().decode(bytes);
const zipBytes = (buffer, start, length) => new Uint8Array(buffer, start, length);
const zipEntries = async buffer => {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = Math.max(0, bytes.length - 65558); i <= bytes.length - 4; i += 1) {
    if (view.getUint32(i, true) === 0x06054b50) end = i;
  }
  if (end < 0) throw new Error('This DOCX file is not a valid ZIP document');
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  const entries = new Map();
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;
  while (cursor < centralEnd && view.getUint32(cursor, true) === 0x02014b50) {
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = zipText(zipBytes(buffer, cursor + 46, nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zipBytes(buffer, dataStart, compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8 && typeof DecompressionStream === 'function') {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('This browser cannot open compressed DOCX files');
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};
const xmlChildren = (node, name) => [...(node?.childNodes || [])].filter(child => child.localName === name);
const xmlFirst = (node, name) => [...(node?.getElementsByTagNameNS?.('*', name) || [])][0] || null;
const xmlAttr = (node, name) => node
  ? (node.getAttribute(name) || node.getAttribute(`w:${name}`) || node.getAttribute(`r:${name}`) || node.getAttributeNS?.('http://schemas.openxmlformats.org/wordprocessingml/2006/main', name) || node.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || '')
  : '';
const xmlStyleValue = (node, name) => xmlAttr(xmlFirst(node, name), 'val');
const resolveDocxTarget = target => {
  const clean = String(target || '').replace(/^\.\//, '').replace(/^\.\.\//, '');
  return clean.startsWith('word/') ? clean : `word/${clean}`;
};
const docxRelationshipMap = xml => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const map = new Map();
  [...doc.getElementsByTagName('*')].filter(node => node.localName === 'Relationship').forEach(node => {
    map.set(node.getAttribute('Id'), resolveDocxTarget(node.getAttribute('Target')));
  });
  return map;
};
const docxDataUri = (bytes, contentType = 'image/png') => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${contentType};base64,${btoa(binary)}`;
};
const docxMediaType = name => ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',svg:'image/svg+xml'}[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream');
const docxInlineStyle = rPr => {
  const styles = [];
  const fontNode = xmlFirst(rPr, 'rFonts');
  const font = fontNode && (xmlAttr(fontNode, 'ascii') || xmlAttr(fontNode, 'hAnsi') || xmlAttr(fontNode, 'eastAsia'));
  const color = xmlStyleValue(rPr, 'color');
  const size = xmlStyleValue(rPr, 'sz');
  const highlight = xmlStyleValue(rPr, 'highlight');
  const shading = xmlStyleValue(rPr, 'shd');
  if (font) styles.push(`font-family:${font.replace(/"/g, '')}`);
  if (color && color !== 'auto') styles.push(`color:#${color}`);
  if (size) styles.push(`font-size:${Math.max(1, Number(size) / 2)}pt`);
  if (highlight && highlight !== 'none') styles.push(`background-color:${highlight}`);
  if (shading && shading !== 'clear' && shading !== 'nil') styles.push(`background-color:#${shading}`);
  if (xmlFirst(rPr, 'b')) styles.push('font-weight:700');
  if (xmlFirst(rPr, 'i')) styles.push('font-style:italic');
  if (xmlFirst(rPr, 'u')) styles.push('text-decoration:underline');
  return styles.join(';');
};
const docxImageHtml = (run, relationships, entries) => {
  const blip = xmlFirst(run, 'blip');
  const relId = blip ? (blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')) : '';
  const target = relationships.get(relId);
  const data = target && entries.get(target);
  if (!data) return '';
  const extent = xmlFirst(run, 'ext');
  const width = extent ? Math.min(100, Math.max(20, Number(extent.getAttribute('cx') || 0) / 9525 / 6)) : 100;
  return `<img src="${docxDataUri(data, docxMediaType(target))}" alt="Imported image" style="max-width:100%;width:${width.toFixed(1)}rem;height:auto">`;
};
const docxRunHtml = (run, relationships, entries) => {
  const rPr = xmlFirst(run, 'rPr');
  const style = docxInlineStyle(rPr);
  let html = '';
  [...run.childNodes].forEach(node => {
    if (node.localName === 't' || node.localName === 'delText') html += esc(node.textContent || '');
    else if (node.localName === 'tab') html += '&emsp;';
    else if (node.localName === 'br' && node.getAttribute('type') === 'page') html += PAGE_BREAK;
    else if (node.localName === 'br' || node.localName === 'cr') html += '<br>';
    else if (node.localName === 'drawing' || node.localName === 'pict') html += docxImageHtml(node, relationships, entries);
  });
  if (!html) return '';
  return style ? `<span style="${esc(style)}">${html}</span>` : html;
};
const docxParagraphHtml = (paragraph, relationships, entries) => {
  const pPr = xmlChildren(paragraph, 'pPr')[0];
  const styles = [];
  const align = xmlStyleValue(pPr, 'jc');
  const spacing = xmlFirst(pPr, 'spacing');
  if (align) styles.push(`text-align:${align}`);
  if (spacing?.getAttribute('before')) styles.push(`margin-top:${Number(spacing.getAttribute('before')) / 20}pt`);
  if (spacing?.getAttribute('after')) styles.push(`margin-bottom:${Number(spacing.getAttribute('after')) / 20}pt`);
  let html = '';
  [...paragraph.childNodes].forEach(node => {
    if (node.localName === 'r') html += docxRunHtml(node, relationships, entries);
    else if (node.localName === 'hyperlink' || node.localName === 'ins' || node.localName === 'smartTag') [...node.childNodes].filter(child => child.localName === 'r').forEach(child => { html += docxRunHtml(child, relationships, entries); });
  });
  if (!html.trim()) return '';
  const chunks = html.split(PAGE_BREAK);
  return chunks.map((chunk, index) => `${styles.length ? `<p style="${esc(styles.join(';'))}">` : '<p>'}${chunk || '<br>'}</p>${index < chunks.length - 1 ? PAGE_BREAK : ''}`).join('');
};
const docxTableHtml = (table, relationships, entries) => {
  const rows = xmlChildren(table, 'tr').map(row => `<tr>${xmlChildren(row, 'tc').map(cell => `<td>${xmlChildren(cell, 'p').map(paragraph => docxParagraphHtml(paragraph, relationships, entries)).join('')}</td>`).join('')}</tr>`).join('');
  return rows ? `<table><tbody>${rows}</tbody></table>` : '';
};
const importDocx = async file => {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('DOCX files must be under 20 MB');
  const entries = await zipEntries(await file.arrayBuffer());
  const documentXml = entries.get('word/document.xml');
  if (!documentXml) throw new Error('The DOCX document body could not be read');
  const relationships = docxRelationshipMap(zipText(entries.get('word/_rels/document.xml.rels') || new Uint8Array()));
  const document = new DOMParser().parseFromString(zipText(documentXml), 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('The DOCX document XML could not be parsed');
  const body = xmlFirst(document, 'body');
  const content = [...(body?.childNodes || [])].map(node => node.localName === 'p'
    ? docxParagraphHtml(node, relationships, entries)
    : node.localName === 'tbl' ? docxTableHtml(node, relationships, entries) : '').join('');
  const core = entries.get('docProps/core.xml') ? new DOMParser().parseFromString(zipText(entries.get('docProps/core.xml')), 'application/xml') : null;
  const title = xmlFirst(core, 'title')?.textContent?.trim() || titleFromFilename(file.name);
  const subtitle = xmlFirst(core, 'subject')?.textContent?.trim() || '';
  return { title, subtitle, content: sanitizeStoryHtml(content || '<p></p>') };
};

function editorPreview() {
  const box = $('#storyPreview');
  if (!box) return;

  const title = $('#storyTitle')?.value.trim() || 'Untitled Story';
  const subtitle = $('#storySubtitle')?.value.trim();
  const content = sanitizeStoryHtml(combinedEditorContent());
  const tags = ($('#storyTags')?.value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 4);

  box.innerHTML = `
    <div class="preview-shell">
      <span class="eyebrow">Live preview</span>
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p class="preview-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="preview-copy">${content.replace(/<hr\b[^>]*data-story-page-break(?:="true")?[^>]*>/gi, '<div class="preview-page-break"><span>Next page</span></div>')}</div>
      ${tags.length ? `<div class="chips preview-tags">${tags.map(tag => `<span class="chip">${esc(tag)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function editorStats() {
  const meta = $('#editorStats');
  if (!meta) return;

  const title = $('#storyTitle')?.value.trim() || '';
  const subtitle = $('#storySubtitle')?.value.trim() || '';
  const body = stripHtml(combinedEditorContent());
  const count = editorWordCount(title, subtitle, body);
  meta.textContent = `${count.toLocaleString()} words · ${Math.max(1, Math.ceil(count / 220))} min read`;
  editorPreview();
}

async function importTxtStory(file) {
  if (!file) return;
  const text = await file.text();
  const data = textImportMeta(text, file.name);

  if ($('#storyTitle') && !$('#storyTitle').value.trim()) $('#storyTitle').value = data.title;
  if ($('#storySubtitle') && !$('#storySubtitle').value.trim() && data.subtitle) $('#storySubtitle').value = data.subtitle;
  if ($('#storyContent')) {
    editorPages = splitStoryPages(data.content);
    activeEditorPage = 0;
    $('#storyContent').innerHTML = editorPages[0];
    renderPageManager();
  }

  $('#saveState') && ($('#saveState').textContent = 'Unsaved');
  saveEditorBackup();
  editorStats();
  toast(`Imported ${file.name}`);
}
async function importDocxStory(file) {
  if (!file) return;
  const data = await importDocx(file);
  if ($('#storyTitle') && !$('#storyTitle').value.trim()) $('#storyTitle').value = data.title;
  if ($('#storySubtitle') && !$('#storySubtitle').value.trim() && data.subtitle) $('#storySubtitle').value = data.subtitle;
  editorPages = splitStoryPages(data.content);
  activeEditorPage = 0;
  if ($('#storyContent')) $('#storyContent').innerHTML = editorPages[0];
  renderPageManager();
  $('#saveState') && ($('#saveState').textContent = 'Unsaved');
  saveEditorBackup();
  editorStats();
  toast(`Imported ${file.name}`);
}

const card = story => {
  const destination = `#story/${encodeURIComponent(story.slug)}`;
  return `
    <article class="story reveal story-link" data-story-url="${destination}" role="link" tabindex="0" aria-label="Read ${esc(story.title)}">
      <div class="cover">
        <img src="${img(story)}" loading="lazy" alt="Cover for ${esc(story.title)}">
        <span class="pill">${esc(story.cat)}</span>
        <button class="save icon-btn ${bookmarkedStoryIds.has(story.id) ? 'active' : ''}" data-id="${story.id}" aria-label="Bookmark ${esc(story.title)}" aria-pressed="${bookmarkedStoryIds.has(story.id)}">${icons.bookmark}</button>
      </div>
      <h3><a href="${destination}">${esc(story.title)}</a></h3>
      <p>${esc(story.desc)}</p>
      <div class="between meta">
        <span class="author">${avatarMarkup(story.authorAvatar, story.ini, 'peach')}${esc(story.author)}</span>
        <span>${esc(story.time)} · Like ${story.likes}</span>
      </div>
    </article>
  `;
};
const empty = (title, body) => `
  <div class="empty">
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
  </div>
`;

const footer = () => `
  <footer>
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="#home">${brand}</a>
          <p>A quiet place for loud ideas, human truths, and stories that stay with you.</p>
          <button class="btn footer-donate openDonation" type="button"><span aria-hidden="true">&#9825;</span> Donate to the developer</button>
        </div>
        <div>
          <h5>DISCOVER</h5>
          <a href="#explore">Explore</a>
          <a href="#explore">Trending</a>
          <a href="#assets">Assets</a>
        </div>
        <div>
          <h5>CREATE</h5>
          <a href="#write">Write</a>
          <a href="#profile">Profile</a>
        </div>
        <div>
          <h5>ACCOUNT</h5>
          <a href="#auth/signin">${session ? 'Account' : 'Sign in'}</a>
          ${adminMode ? '<a href="#admin">Admin console</a>' : ''}
          <button class="footer-link openHelp" type="button">Help</button>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#rules">Community rules</a>
        </div>
      </div>
    </div>
  </footer>
`;

function setup() {
  return `
    <div class="page auth-wrap">
      <div class="auth-card">
        <a class="brand">${brand}</a>
        <span class="eyebrow">One secure step left</span>
        <h1>Connect the live database.</h1>
        <p>Add the project publishable key to <code>js/config.js</code>, then run the migration from <code>supabase/migrations</code> in the SQL Editor.</p>
        <a class="btn primary" target="_blank" rel="noreferrer" href="https://supabase.com/dashboard/project/syemkwyfefzdmogtsvmi/settings/api">Open API settings</a>
      </div>
    </div>
  `;
}

function home() {
  const published = [...stories]
    .filter(story => story.status === 'published')
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const featured = published.find(story => story.featured) || null;
  const heroStory = featured || published[0] || null;
  const recent = published.slice(0, 6);
  const trending = [...published].sort((a, b) => b.views - a.views).slice(0, 5);

  return `
    <div class="page">
      <div class="hero">
        <div class="hero-bg" aria-hidden="true">
          <div class="hero-slide hero-slide-mountain active"></div>
          <div class="hero-slide hero-slide-logo"></div>
          <div class="hero-slide hero-slide-stories"></div>
        </div>
        <div class="container">
          <div class="hero-copy">
            <span class="eyebrow">Stories that stay</span>
            <h1>Every Story<br>Deserves to Be <em>Told.</em></h1>
            <p>A home for honest voices, untold worlds, and the beautiful mess of being human.</p>
            <div class="buttons">
              <a class="btn primary" href="${heroStory ? '#explore' : '#write'}">${heroStory ? 'Start reading' : 'Write the first story'} →</a>
              <a class="btn" href="#write">Write your story</a>
            </div>
          </div>
        </div>
      </div>

      ${featured ? `
        <section>
          <div class="container">
            <div class="section-head">
              <div>
                <span class="eyebrow">Editor's choice</span>
                <h2>Featured this week</h2>
              </div>
            </div>
            <div class="featured">
              <a class="feature-card" style="background-image:linear-gradient(0deg,#000e,transparent 70%),url('${img(featured)}')" href="#story/${featured.slug}">
                <div>
                  <span class="eyebrow">${esc(featured.cat)} · ${esc(featured.time)}</span>
                  <h2>${esc(featured.title)}</h2>
                  <p>${esc(featured.desc)}</p>
                  <span class="author">${avatarMarkup(featured.authorAvatar, featured.ini, 'peach')}${esc(featured.author)}</span>
                </div>
              </a>
              <div class="ranks">
                ${trending.filter(story => story.id !== featured.id).slice(0, 4).map((story, index) => `
                  <a class="rank" href="#story/${story.slug}">
                    <strong>0${index + 1}</strong>
                    <div>
                      <h3>${esc(story.title)}</h3>
                      <small>${esc(story.author)} · ${esc(story.time)}</small>
                    </div>
                  </a>
                `).join('')}
              </div>
            </div>
          </div>
        </section>
      ` : ''}

      <section>
          <div class="container">
            <div class="section-head">
              <div>
                <span class="eyebrow">Fresh perspectives</span>
                <h2>Recently published</h2>
              </div>
            </div>
            <div class="grid">${recent.length ? recent.map(card).join('') : empty('No published stories yet', 'Be the first writer to publish one.')}</div>
          </div>
      </section>

      <section>
        <div class="container">
          <div class="section-head">
            <div>
              <span class="eyebrow">Find your next read</span>
              <h2>Explore categories</h2>
            </div>
          </div>
          <div class="chips">${categories.map(category => `<a class="chip" href="#explore/${category.id}">${esc(category.name)}</a>`).join('')}</div>
        </div>
      </section>

      ${footer()}
    </div>
  `;
}

function explore() {
  return `
    <div class="page">
      <div class="explore-head container">
        <span class="eyebrow">The story archive</span>
        <h1 class="page-title">Explore worlds<br>worth entering.</h1>
      </div>
      <div class="tools">
        <div class="container toolrow">
          <label>Search<input id="exploreSearch" value="${esc(browseState.query)}" placeholder="Search stories"></label>
          <select id="category" aria-label="Filter by category">
            <option value="">All categories</option>
            ${categories.map(category => `<option value="${category.id}" ${String(browseState.category) === String(category.id) ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
          </select>
          <select id="sort" aria-label="Sort stories">
            <option value="latest" ${browseState.sort === 'latest' ? 'selected' : ''}>Latest</option>
            <option value="views" ${browseState.sort === 'views' ? 'selected' : ''}>Most Viewed</option>
            <option value="liked" ${browseState.sort === 'liked' ? 'selected' : ''}>Most Liked</option>
          </select>
        </div>
      </div>
      <section>
        <div class="container">
          <div class="grid" id="storyGrid">${stories.length ? stories.slice(0, 12).map(card).join('') : empty('No stories yet', 'Publish the first story.')}</div>
          <button id="more" class="btn load-more" ${stories.length < 12 ? 'hidden' : ''}>Load more</button>
        </div>
      </section>
      ${footer()}
    </div>
  `;
}

function reader(story) {
  if (!story) return `<div class="page auth-wrap">${empty('Story not found', 'It may have been removed.')}</div>`;

  const pages = paginateStoryHtml(sanitizeStoryHtml(story.content || ''));
  const isPublished = story.status === 'published';
  const index = stories.findIndex(item => item.slug === story.slug);
  const prev = index > 0 ? stories[index - 1] : null;
  const next = index >= 0 && index < stories.length - 1 ? stories[index + 1] : null;
  const related = stories
    .filter(item => item.id !== story.id && (item.categoryId === story.categoryId || item.tags.some(tag => (story.tags || []).includes(tag))))
    .slice(0, 3);
  const readerEnd = `
    <div class="reader-end">
      <span class="eyebrow">The end</span>
      <h2>Did this story move you?</h2>
      <button class="btn primary like ${likedStoryIds.has(story.id) ? 'active' : ''}" data-id="${story.id}" aria-pressed="${likedStoryIds.has(story.id)}"><span class="btn-icon">${icons.heart}</span><span>Appreciate · ${story.likes}</span></button>
      <div class="story-nav">
        ${prev ? `<a class="btn" href="#story/${prev.slug}">Previous story</a>` : '<span class="btn disabled">Previous story</span>'}
        ${next ? `<a class="btn" href="#story/${next.slug}">Next story</a>` : '<span class="btn disabled">Next story</span>'}
      </div>
    </div>`;

  return `
    <article class="page reader">
      <div class="reader-intro">
        <span class="eyebrow">${esc(story.cat)}</span>
        <h1>${esc(story.title)}</h1>
        <p class="subtitle">${esc(story.desc)}</p>
      </div>

      <div class="reader-cover">
        <img src="${img(story)}" alt="Cover for ${esc(story.title)}">
      </div>

      <div class="reader-meta">
        <div class="byline">
          ${avatarMarkup(story.authorAvatar, story.ini, 'peach')}
          <div>
            <b>${esc(story.author)}</b>
            <div class="meta">${esc(story.date)} · ${esc(story.time)} · <span class="story-view-count">${Number(story.views || 0).toLocaleString()}</span> views</div>
          </div>
          <div class="author-actions">
            ${story.isOwn || (session && session.user.id === story.authorId)
              ? '<span class="btn disabled">Your story</span>'
              : `<button class="btn followAuthor" data-username="${esc(story.username)}">Follow</button>`}
            ${story.authorContactEmail ? `<a class="btn" href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=${encodeURIComponent(story.authorContactEmail)}" target="_blank" rel="noopener noreferrer">Email writer</a>` : ''}
            ${contactSourceLink(story.authorContactSource)}
            ${instagramLink(story.authorInstagram)}
            ${story.authorDonationQr && !(story.isOwn || (session && session.user.id === story.authorId)) ? `<button class="btn openWriterDonation" data-qr="${esc(story.authorDonationQr)}" data-writer="${esc(story.author)}"><span aria-hidden="true">&#9825;</span> Support writer</button>` : ''}
            ${isPublished ? '<button class="btn reportStory">Report</button>' : '<span class="btn disabled">Private draft</span>'}
          </div>
        </div>
      </div>

      <div class="reader-tools">
        <button class="like icon-btn ${likedStoryIds.has(story.id) ? 'active' : ''}" data-id="${story.id}" aria-label="Like" aria-pressed="${likedStoryIds.has(story.id)}">${icons.heart}</button>
        <button class="bookmark icon-btn ${bookmarkedStoryIds.has(story.id) ? 'active' : ''}" data-id="${story.id}" aria-label="Bookmark" aria-pressed="${bookmarkedStoryIds.has(story.id)}">${icons.bookmark}</button>
        ${story.authorDonationQr && !(story.isOwn || (session && session.user.id === story.authorId)) ? `<button class="writer-donate-tool openWriterDonation icon-btn" data-qr="${esc(story.authorDonationQr)}" data-writer="${esc(story.author)}" aria-label="Donate to ${esc(story.author)}" title="Support this writer">${icons.donate}</button>` : ''}
        <button id="font" class="icon-btn" aria-label="Adjust font size"><span>Aa</span></button>
        <button id="readerMode" class="icon-btn" aria-label="Toggle reading mode">${icons.theme}</button>
        <button class="share icon-btn" aria-label="Share story">${icons.share}</button>
      </div>

      <div class="reader-body">
        <div class="reader-book">
          <button class="reader-page-arrow reader-page-prev" type="button" data-reader-direction="-1" aria-label="Previous page">←</button>
          <div class="reader-pages" aria-live="polite">
            ${pages.map((page, pageIndex) => `<section class="reader-paper" data-reader-page="${pageIndex}" ${pageIndex ? 'hidden' : ''}>${page}${pageIndex === pages.length - 1 ? readerEnd : ''}</section>`).join('')}
          </div>
          <button class="reader-page-arrow reader-page-next" type="button" data-reader-direction="1" aria-label="Next page">→</button>
          <div class="reader-page-status" id="readerPageStatus">Page 1 of ${pages.length}</div>
        </div>
      </div>

      <div class="related-stories">
        <div class="section-head">
          <div>
            <span class="eyebrow">Related reading</span>
            <h2>More stories to explore</h2>
          </div>
        </div>
        <div class="grid">
          ${related.length ? related.map(card).join('') : empty('No related stories yet', 'More matches will appear as the library grows.')}
        </div>
      </div>

      <div class="comments">
        <div class="section-head">
          <div>
            <span class="eyebrow">Conversation</span>
            <h2>Comments</h2>
          </div>
        </div>
        ${isPublished ? `
          <div id="commentList"></div>
          <textarea id="commentBody" maxlength="2000" placeholder="Leave a thoughtful response..." aria-label="Comment text"></textarea>
          <button class="btn primary" id="comment">Post comment</button>
        ` : empty('Comments locked', 'Publish this draft to start a conversation.')}
      </div>
    </article>
  `;
}

function setReaderPage(index, scroll = true) {
  const pages = $$('.reader-paper');
  if (!pages.length) return;
  readerPageIndex = Math.max(0, Math.min(index, pages.length - 1));
  pages.forEach((page, pageIndex) => { page.hidden = pageIndex !== readerPageIndex; });
  const status = $('#readerPageStatus');
  if (status) status.textContent = `Page ${readerPageIndex + 1} of ${pages.length}`;
  const previous = $('.reader-page-prev');
  const next = $('.reader-page-next');
  if (previous) previous.disabled = readerPageIndex === 0;
  if (next) next.disabled = readerPageIndex === pages.length - 1;
  if (scroll) $('.reader-book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function write(story = null) {
  if (!session) return auth('signup-writer', 'Add the required details to create a Writer account and start publishing.');
  if (!hasWriterAccess()) return `
    <div class="page auth-wrap">
      <div class="auth-card">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">Writer access</span>
        <h1>Become a writer.</h1>
        <p>Your Reader account already has a display name, login email, and password or social login. Add the required writer details below to unlock publishing.</p>
        <div class="field"><label>Display name</label><input value="${esc(session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || '')}" readonly></div>
        <div class="field"><label>Login email</label><input value="${esc(session.user.email || '')}" readonly></div>
        <div class="field"><label>Writer Gmail address ending in @gmail.com</label><input id="becomeWriterEmail" type="email" placeholder="yourname@gmail.com"></div>
        <div class="field"><label>Contact source (optional)</label><input id="becomeWriterSource" maxlength="300" placeholder="Website, portfolio, or social profile URL"></div>
        <div class="field"><label>Instagram handle (optional)</label><input id="becomeWriterInstagram" maxlength="30" placeholder="your_instagram"></div>
        <button id="becomeWriter" class="btn primary" type="button">Upgrade to Writer</button>
      </div>
    </div>
  `;

  editingStory = story;
  draftId = story?.id || null;
  const backup = readEditorBackup(story?.id || null);
  const initialTitle = backup?.title ?? story?.title ?? '';
  const initialSubtitle = backup?.subtitle ?? story?.desc ?? '';
  const initialCategory = backup?.category ?? story?.categoryId ?? '';
  const initialTags = backup?.tags ?? (story?.tags || []).join(', ');

  editorPages = backup?.pages?.length ? backup.pages : splitStoryPages(story?.content ? sanitizeStoryHtml(story.content) : '<p>Tell your story...</p>');
  activeEditorPage = Math.max(0, Math.min(Number(backup?.activePage || 0), editorPages.length - 1));
  const initialContent = editorPages[activeEditorPage] || editorPages[0];
  const initialCount = editorWordCount(initialTitle, initialSubtitle, editorPages.join(' '));
  const initialMinutes = Math.max(1, Math.ceil(initialCount / 220));

  return `
    <div class="page editor">
      <div class="editor-top">
        <div>
          <span class="eyebrow">${story ? 'Edit story' : 'New story'}</span>
          <small id="saveState">${backup ? 'Recovered unsaved local changes' : (story ? 'Saved draft' : 'Draft not saved')}</small>
          <small id="editorStats">${initialCount.toLocaleString()} words · ${initialMinutes} min read</small>
        </div>
        <div class="buttons editor-tools">
          ${story ? '<button class="btn danger deleteOwnStory">Delete</button>' : ''}
          <button class="btn" id="previewToggle" type="button">Preview</button>
          <button class="btn" id="importTxt" type="button">Import .txt</button>
          <input id="storyTxt" type="file" accept=".txt,text/plain" hidden>
          <button class="btn" id="importDocx" type="button">Import .docx</button>
          <input id="storyDocx" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
          <button class="btn saveDraft" type="button">Save draft</button>
          <button class="btn primary publish" type="button">Publish</button>
        </div>
      </div>
      <p class="editor-note">Import TXT or DOCX files, split longer work into pages, refine the layout below, and publish when it is ready. DOCX formatting and embedded images are preserved where supported.</p>
      <div class="page-manager" aria-label="Story pages">
        <div>
          <span class="eyebrow">Pages</span>
          <small id="pageCounter">${editorPages.length} page${editorPages.length === 1 ? '' : 's'} · editing page ${activeEditorPage + 1}</small>
        </div>
        <div class="page-actions">
          <button class="btn" id="addPage" type="button">Add page</button>
          <button class="btn" id="duplicatePage" type="button">Duplicate</button>
          <button class="btn" id="movePageLeft" type="button">Move left</button>
          <button class="btn" id="movePageRight" type="button">Move right</button>
          <button class="btn danger" id="removePage" type="button">Remove</button>
        </div>
        <div class="chips page-tabs" id="pageTabs">
          ${editorPages.map((_, index) => `<button class="chip ${index === activeEditorPage ? 'active' : ''}" type="button" data-page-index="${index}">Page ${index + 1}</button>`).join('')}
        </div>
      </div>
      <input class="title-input" id="storyTitle" maxlength="160" value="${esc(initialTitle)}" placeholder="Your story begins with a title..." aria-label="Story title">
      <input class="subtitle-input" id="storySubtitle" maxlength="300" value="${esc(initialSubtitle)}" placeholder="Add a compelling subtitle" aria-label="Story subtitle">
      <div class="editor-bar" aria-label="Formatting toolbar">
        <button data-cmd="undo" title="Undo" aria-label="Undo"><span class="material-symbols-outlined" aria-hidden="true">undo</span></button>
        <button data-cmd="redo" title="Redo" aria-label="Redo"><span class="material-symbols-outlined" aria-hidden="true">redo</span></button>
        <span class="toolbar-separator" aria-hidden="true"></span>
        <button data-cmd="formatBlock" data-value="p" title="Paragraph" aria-label="Paragraph"><span class="material-symbols-outlined" aria-hidden="true">notes</span></button>
        <button data-cmd="formatBlock" data-value="h2" title="Heading" aria-label="Heading"><span class="material-symbols-outlined" aria-hidden="true">title</span></button>
        <button data-cmd="formatBlock" data-value="h3" title="Subheading" aria-label="Subheading"><span class="material-symbols-outlined" aria-hidden="true">text_fields</span></button>
        <button data-cmd="formatBlock" data-value="blockquote" title="Quote" aria-label="Quote"><span class="material-symbols-outlined" aria-hidden="true">format_quote</span></button>
        <span class="toolbar-separator" aria-hidden="true"></span>
        <button data-cmd="bold" title="Bold" aria-label="Bold"><span class="material-symbols-outlined" aria-hidden="true">format_bold</span></button>
        <button data-cmd="italic" title="Italic" aria-label="Italic"><span class="material-symbols-outlined" aria-hidden="true">format_italic</span></button>
        <button data-cmd="underline" title="Underline" aria-label="Underline"><span class="material-symbols-outlined" aria-hidden="true">format_underlined</span></button>
        <button data-cmd="removeFormat" title="Clear formatting" aria-label="Clear formatting"><span class="material-symbols-outlined" aria-hidden="true">format_clear</span></button>
        <span class="toolbar-separator" aria-hidden="true"></span>
        <button data-cmd="insertUnorderedList" title="Bullet list" aria-label="Bullet list"><span class="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span></button>
        <button data-cmd="insertOrderedList" title="Numbered list" aria-label="Numbered list"><span class="material-symbols-outlined" aria-hidden="true">format_list_numbered</span></button>
        <button data-action="link" title="Add link" aria-label="Add link"><span class="material-symbols-outlined" aria-hidden="true">add_link</span></button>
        <button data-action="unlink" title="Remove link" aria-label="Remove link"><span class="material-symbols-outlined" aria-hidden="true">link_off</span></button>
        <button data-action="divider" title="Insert divider" aria-label="Insert divider"><span class="material-symbols-outlined" aria-hidden="true">horizontal_rule</span></button>
      </div>
      <div class="editor-stack">
        <div class="editor-area" id="storyContent" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Story content">${initialContent}</div>
        <div class="editor-preview" id="storyPreview" aria-live="polite"></div>
      </div>
      <div class="fields">
        <div class="field">
          <label>Category</label>
          <select id="storyCategory">
            <option value="">Select category</option>
            ${categories.map(category => `<option value="${category.id}" ${String(initialCategory) === String(category.id) ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Tags</label>
          <input id="storyTags" value="${esc(initialTags)}" placeholder="memory, travel, life">
        </div>
        <div class="field">
          <label>Cover image</label>
          <input id="storyCover" type="file" accept="image/jpeg,image/png,image/webp,image/avif">
        </div>
      </div>
    </div>
  `;
}

function auth(mode = 'signin', msg = '') {
  const signup = mode.startsWith('signup');
  const writerSignup = mode === 'signup-writer';
  return `
    <div class="page auth-wrap">
      <form class="auth-card">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">${signup ? 'Join us' : 'Welcome back'}</span>
        <h1>${signup ? (writerSignup ? 'Create your Writer account.' : 'Tell your story.') : 'Continue your story.'}</h1>
        <p>${esc(msg || 'Read, write, save, and join the conversation.')}</p>
        <button type="button" class="social" data-provider="google">Continue with Google</button>
        <button type="button" class="social" data-provider="github">Continue with GitHub</button>
        <div class="auth-provider-note" role="note">
          <span class="auth-provider-icon" aria-hidden="true">✓</span>
          <p><strong>Secure Storyteller login</strong><br>Google may show <code>syemkwyfefzdmogtsvmi.supabase.co</code>. This is Storyteller's official authentication service, so seeing it during sign-in is expected and safe.</p>
        </div>
        ${signup ? '<small>Social signup creates a Reader account. Choose email signup below to become a Writer.</small>' : ''}
        <div class="divider">or use email</div>
        ${signup ? '<div class="field"><label>Display name</label><input id="authName" required maxlength="80"></div>' : ''}
        ${signup ? `
          <fieldset class="role-picker">
            <legend>Choose your role</legend>
            <label><input type="radio" name="accountRole" value="reader" ${writerSignup ? '' : 'checked'}><span><b>Reader</b><small>Read and discover stories.</small></span></label>
            <label><input type="radio" name="accountRole" value="writer" ${writerSignup ? 'checked' : ''}><span><b>Writer</b><small>Write, publish, and manage your own stories.</small></span></label>
          </fieldset>
          <div id="writerSignupFields" ${writerSignup ? '' : 'hidden'}>
            <div class="field"><label>Writer Gmail address ending in @gmail.com</label><input id="writerGmail" type="email" autocomplete="email" placeholder="yourname@gmail.com" ${writerSignup ? 'required' : ''}></div>
            <div class="field"><label>Contact source (optional)</label><input id="writerContactSource" maxlength="300" placeholder="Website, portfolio, or social profile URL"></div>
            <div class="field"><label>Instagram handle (optional)</label><input id="writerInstagram" maxlength="30" placeholder="your_instagram"></div>
            <small>Your payment QR is optional and can be added later from your Writer profile.</small>
          </div>
        ` : ''}
        <div class="field"><label>Email</label><input id="authEmail" type="email" required></div>
        <div class="field"><label>Password</label><input id="authPassword" type="password" required minlength="8"></div>
        <button class="btn primary authSubmit">${signup ? 'Create account' : 'Sign in'}</button>
        <div class="between">
          <button type="button" class="meta authMode">${signup ? 'Already registered?' : 'Create account'}</button>
          <button type="button" class="meta forgot">Forgot password?</button>
        </div>
      </form>
    </div>
  `;
}

async function profile(tab = 'published') {
  const me = await StoryAPI.profile();
  if (!me) return auth();
  accountRole = me.role || 'reader';
  await syncNavbarAvatar(me);

  const writer = hasWriterAccess();
  const readerTabs = new Set(['liked', 'bookmarks', 'history']);
  const activeTab = writer ? tab : (readerTabs.has(tab) ? tab : 'bookmarks');
  const mine = writer
    ? (activeTab === 'published' ? await StoryAPI.myStories('published') : await StoryAPI.library(activeTab))
    : await StoryAPI.library(activeTab);
  const items = mine.map(story => {
    if (activeTab === 'drafts') {
      return `
        <article class="story">
          <div class="cover">
            <img src="${img(story)}" alt="">
            <span class="pill">Draft</span>
          </div>
          <h3>${esc(story.title)}</h3>
          <p>${esc(story.desc)}</p>
          <div class="buttons">
            <a class="btn" href="#write/${story.id}">Continue editing</a>
          </div>
        </article>
      `;
    }
    return card(story);
  }).join('');

  return `
    <div class="page">
      <section class="profile-hero">
        <div class="container profile-layout">
          <div class="profile-avatar">
            ${me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="">` : esc(me.display_name.split(/\s+/).map(part => part[0]).slice(0, 2).join(''))}
          </div>
          <div>
            <span class="eyebrow">${writer ? 'Writer profile' : 'Reader profile'}</span>
            <h1 class="page-title">${esc(me.display_name)}</h1>
            <p class="subtitle">${esc(me.bio || 'Your story is still being written.')}</p>
            <p class="meta">@${esc(me.username)} · ${esc(me.role)}</p>
            <div class="buttons">
              <button class="btn editProfile">Edit profile</button>
              ${!writer ? '<button class="btn primary becomeWriterHero" type="button">Become a writer</button>' : ''}
              ${adminMode ? '<a class="btn" href="#admin">Admin console</a>' : ''}
              <button class="btn signOut">Sign out</button>
            </div>
          </div>
        </div>
      </section>

      <div class="profile-editor container" hidden>
        <div class="field"><label>Display name</label><input id="profileName" maxlength="80" value="${esc(me.display_name)}"></div>
        <div class="field"><label>Username</label><input id="profileUsername" maxlength="30" value="${esc(me.username)}" aria-describedby="profileUsernameFeedback"><small class="field-error" id="profileUsernameFeedback" aria-live="polite"></small></div>
        <div class="field"><label>Bio</label><textarea id="profileBio" maxlength="500">${esc(me.bio)}</textarea></div>
        <div class="field"><label>Avatar</label><input id="profileAvatar" type="file" accept="image/jpeg,image/png,image/webp"></div>
        ${writer ? `<div class="field"><label>Writer Gmail</label><input id="profileContactEmail" type="email" value="${esc(me.contact_email || '')}" placeholder="yourname@gmail.com"></div>
        <div class="field"><label>Contact source (optional)</label><input id="profileContactSource" maxlength="300" value="${esc(me.contact_source || '')}" placeholder="Website, portfolio, or social profile URL"></div>
        <div class="field"><label>Instagram handle (optional)</label><input id="profileInstagram" maxlength="30" value="${esc(me.instagram_handle || '')}" placeholder="your_instagram"></div>` : ''}
        <button class="btn primary saveProfile">Save profile</button>
        ${!writer ? `<div class="writer-donation-settings become-writer-panel">
          <div>
            <span class="eyebrow">Start publishing</span>
            <h3>Become a writer</h3>
            <p>Reader accounts can be upgraded instantly. Add a Gmail address to unlock publishing. Contact source and Instagram are optional public profile details.</p>
            <div class="field"><label>Writer Gmail</label><input id="becomeWriterEmail" type="email" placeholder="yourname@gmail.com"></div>
            <div class="field"><label>Contact source (optional)</label><input id="becomeWriterSource" maxlength="300" placeholder="Website, portfolio, or social profile URL"></div>
            <div class="field"><label>Instagram handle (optional)</label><input id="becomeWriterInstagram" maxlength="30" placeholder="your_instagram"></div>
            <button id="becomeWriter" class="btn primary" type="button">Upgrade to Writer</button>
          </div>
          <div class="writer-qr-preview"><strong>Writer tools</strong><small>Drafts, publishing, and optional donation QR unlock after upgrade.</small></div>
        </div>` : ''}
        ${writer ? `<div class="writer-donation-settings">
          <div>
            <span class="eyebrow">Reader support</span>
            <h3>Writer donation QR</h3>
            <p>Let readers support your work directly. Uploading a QR makes a “Support writer” button appear on your published stories.</p>
            <label class="qr-upload"><span>Choose QR image</span><input id="writerDonationQrFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
            <button id="saveWriterDonationQr" class="btn" type="button">${me.donation_qr_url ? 'Replace QR code' : 'Add QR code'}</button>
            ${me.donation_qr_url ? '<button id="removeWriterDonationQr" class="btn danger" type="button">Remove QR</button>' : ''}
          </div>
          <div class="writer-qr-preview">${me.donation_qr_url ? `<img src="${esc(me.donation_qr_url)}" alt="Your current writer donation QR code"><small>Visible to readers</small>` : '<strong>Not enabled</strong><small>No QR code is public</small>'}</div>
        </div>` : ''}
      </div>

      <section>
        <div class="container">
          <div class="chips profile-tabs">
            ${(writer ? [['published', 'Published'], ['drafts', 'Drafts'], ['liked', 'Liked'], ['bookmarks', 'Bookmarks'], ['history', 'History']] : [['liked', 'Liked'], ['bookmarks', 'Bookmarks'], ['history', 'Reading history']])
              .map(item => `<a class="chip ${activeTab === item[0] ? 'active' : ''}" href="#profile/${item[0]}">${item[1]}</a>`).join('')}
          </div>
          <div class="grid profile-grid">${items || empty('Nothing here yet', activeTab === 'drafts' ? 'Your saved drafts appear here.' : 'Your reading history will grow as you explore.')}</div>
        </div>
      </section>
      ${footer()}
    </div>
  `;
}

function resetPassword() {
  return `
    <div class="page auth-wrap">
      <form class="auth-card resetForm">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">Secure your account</span>
        <h1>Choose a new password.</h1>
        <p>Use at least eight characters and avoid reusing an old password.</p>
        <div class="field"><label>New password</label><input id="newPassword" type="password" minlength="8" required></div>
        <div class="field"><label>Confirm password</label><input id="confirmPassword" type="password" minlength="8" required></div>
        <button class="btn primary">Update password</button>
      </form>
    </div>
  `;
}

function assetLibrary() {
  const assets = [
    { type: 'image', title: 'Storyteller mark', src: 'assets/storyteller-mark.png', note: 'Original brand artwork' },
    { type: 'image', title: 'Optimized app icon', src: 'assets/storyteller-mark-512.webp', note: 'Lightweight icon used by the app' },
    { type: 'image', title: 'Hero mountain artwork', src: 'assets/hero-1280.webp', note: 'Homepage cinematic background' },
    { type: 'image', title: 'Story world artwork', src: 'assets/hero-stories-1280.webp', note: 'Editorial story artwork' },
    { type: 'image', title: 'Social preview image', src: 'assets/og-image.jpg', note: 'Preview image for link sharing' },
    { type: 'video', title: 'StoryTeller intro video', src: 'assets/StoryTeller-intro.mp4', note: 'Replay the first-visit intro anytime' },
    { type: 'audio', title: 'Storyteller theme song', src: 'assets/storyteller-theme-song.mp3', note: 'Local theme music' },
  ];

  return `
    <div class="page assets-page">
      <section class="explore-head container">
        <span class="eyebrow">Storyteller assets</span>
        <h1 class="page-title">Images, video<br>and sound.</h1>
        <p>Replay the intro video or view the public artwork used across Storyteller.</p>
      </section>
      <section>
        <div class="container asset-grid">
          ${assets.map(item => `
            <article class="asset-card">
              <span class="eyebrow">${esc(item.type)}</span>
              <h3>${esc(item.title)}</h3>
              <p>${esc(item.note)}</p>
              ${item.type === 'image' ? `<img src="${esc(item.src)}" alt="${esc(item.title)}" loading="lazy">` : ''}
              ${item.type === 'video' ? `<video src="${esc(item.src)}" controls preload="metadata" playsinline></video>` : ''}
              ${item.type === 'audio' ? `<audio src="${esc(item.src)}" controls preload="metadata"></audio>` : ''}
              <a class="btn" href="${esc(item.src)}" target="_blank" rel="noopener noreferrer">Open asset</a>
            </article>
          `).join('')}
        </div>
      </section>
      ${footer()}
    </div>
  `;
}

function legal(kind) {
  const pages = {
    privacy: {
      eyebrow: 'Privacy policy',
      title: 'Your stories. Your data.',
      intro: 'This policy explains what Storyteller collects, why it is used, where it is stored, and the choices available to you.',
      sections: [
        ['Information we collect', 'Account information includes your email address, authentication identifiers, display name, username, biography, avatar and account status. Activity information includes stories, drafts, comments, likes, bookmarks, follows, reports, notifications and reading history. Basic technical information may be processed by our hosting and database providers to deliver and protect the service.'],
        ['How information is used', 'We use information to create and secure accounts, publish and organize stories, maintain your library, provide social features, investigate reports, prevent abuse, support users and improve Storyteller. We do not sell personal information.'],
        ['Public information', 'Published stories, public profile fields, visible comments and aggregate engagement counts can be viewed by other visitors. Drafts, bookmarks, reading history, notifications, account roles and suspension state are not intentionally exposed to the public.'],
        ['Donation QR codes and payments', 'Publishing a writer donation QR is optional. If you enable it, the QR image becomes public on your stories and may contain a payment identifier chosen by you. Storyteller does not process donations, receive transaction details or verify payments. Payments occur in the reader’s payment app under that provider’s terms.'],
        ['Storage and service providers', 'Supabase provides authentication, database, Edge Function and media-storage infrastructure. Vercel hosts the static website. Email messages you choose to send are handled by your email provider and Gmail. Each provider processes limited information under its own terms and privacy practices.'],
        ['Browser storage', 'Storyteller uses browser storage for authentication sessions, theme preferences and the current-tab human-verification state. Clearing site data or signing out removes or invalidates applicable local state.'],
        ['Security and retention', 'We use database access policies, minimized public views, content sanitization and restricted administrative functions. No online service can guarantee absolute security. Information is retained while needed to provide the service, meet security or moderation needs, resolve disputes and comply with applicable obligations.'],
        ['Your choices', 'You can edit your profile, drafts and published work, delete your stories and sign out at any time. To request account deletion, access or correction that is not available in the product, contact the administrator. Public copies shared by others or required moderation records may not disappear immediately.'],
        ['Children and sensitive information', 'Storyteller is not designed for children who cannot legally consent to online services in their location. Do not publish passwords, financial details, government identifiers, private addresses or another person’s sensitive information.'],
        ['Policy changes', 'We may update this policy as Storyteller changes. The updated date and revised text will appear on this page. Continued use after an update means the new policy applies to future use.'],
      ],
    },
    terms: {
      eyebrow: 'Terms and conditions',
      title: 'Create with care.',
      intro: 'These terms govern access to Storyteller. By using the service, you agree to follow them and the Community Rules.',
      sections: [
        ['Eligibility and acceptance', 'Use Storyteller only if you can lawfully agree to these terms. If you use the service for an organization, you confirm that you are authorized to act for it. Stop using the service if you do not agree.'],
        ['Accounts and security', 'Provide accurate information, protect your credentials and promptly report suspected unauthorized access. You are responsible for activity performed through your account. Accounts may not be sold, shared for abuse or used to evade enforcement.'],
        ['Your content', 'You retain ownership of original content you create. When you publish, you grant Storyteller a non-exclusive, worldwide, royalty-free license to host, reproduce, format and display that content solely to operate, promote and improve the service. You may end this license by deleting the content, subject to reasonable backups and legal or moderation retention.'],
        ['Your responsibilities', 'Publish only material you have the right to share. Do not post unlawful, threatening, deceptive, hateful, exploitative, plagiarized, privacy-violating or malicious content. Do not attack the service, scrape protected data, manipulate engagement, impersonate others or interfere with another user.'],
        ['Moderation and reports', 'Administrators may review reports, restrict visibility, remove content, change featured status, suspend accounts or permanently delete accounts when reasonably necessary to protect users, enforce these terms or comply with law. Reports must be made honestly and must not be used for harassment.'],
        ['Copyright and complaints', 'If you believe content violates your rights, send a detailed notice identifying the work, the Storyteller content, your contact information and a good-faith explanation. False or abusive notices may lead to restrictions.'],
        ['Direct donations', 'Donation QR codes are optional links between readers and writers. Storyteller does not process, hold, guarantee, refund or resolve these payments and does not verify the recipient displayed by a payment app. Readers must confirm the recipient and amount before paying. Writers are responsible for the QR they publish and for applicable tax, disclosure and legal obligations.'],
        ['Service availability', 'Storyteller may change, pause or discontinue features. We work to keep the service reliable but provide it on an “as available” basis without a guarantee of uninterrupted operation or permanent storage. Keep copies of important work.'],
        ['Liability', 'To the extent permitted by applicable law, Storyteller and its administrator are not responsible for indirect losses, user-generated content, third-party services or events outside reasonable control. Nothing here excludes rights that cannot legally be excluded.'],
        ['Termination and changes', 'You may stop using Storyteller at any time. We may restrict or terminate access for serious or repeated violations. Terms may be updated when the product, risks or legal requirements change; the current version will remain available here.'],
      ],
    },
    rules: {
      eyebrow: 'Community rules',
      title: 'Make this a place worth reading.',
      intro: 'These rules apply to stories, comments, profiles, reports and every other community interaction.',
      sections: [
        ['Respect people', 'Challenge ideas without attacking people. Harassment, threats, hate, dehumanizing language, targeted humiliation and encouragement of violence are not allowed.'],
        ['Share work you may publish', 'Post original work or material you have permission to use. Credit sources where appropriate. Plagiarism, copyright infringement and misleading authorship are prohibited.'],
        ['Protect privacy', 'Do not reveal private contact details, addresses, credentials, intimate material or sensitive personal information without clear permission. Never use Storyteller to dox, blackmail or stalk someone.'],
        ['Keep people safe', 'Do not promote exploitation, sexual content involving minors, instructions intended to cause serious harm, scams, malware or illegal transactions. Fiction may explore difficult subjects, but context and responsible presentation matter.'],
        ['Be honest', 'Do not impersonate people, fabricate reports, coordinate fake engagement, repeatedly manipulate views or use deceptive links. Clearly distinguish personal opinion, fiction and factual claims where confusion could cause harm.'],
        ['Avoid spam', 'Do not flood stories or comments, post repetitive promotions, automate unwanted interactions or use irrelevant tags and titles to capture attention.'],
        ['Use reports responsibly', 'Report content when you genuinely believe it violates these rules. Include a clear reason so administrators can understand the concern. Do not report content merely because you disagree with it.'],
        ['Enforcement', 'Responses may include a warning, reduced visibility, content removal, temporary suspension or permanent account deletion. Severity, context, history and immediate risk are considered. Contact the Help Centre if you believe an action was made in error.'],
      ],
    },
  };

  const page = pages[kind] || pages.terms;
  return `
    <div class="page legal">
      <div class="legal-copy">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">${page.eyebrow}</span>
        <h1>${page.title}</h1>
        <p class="legal-updated">Last updated July 22, 2026</p>
        <p class="legal-intro">${page.intro}</p>
        ${page.sections.map(([title, body]) => `<section><h2>${title}</h2><p>${body}</p></section>`).join('')}
        <section>
          <h2>Contact</h2>
          <p>Questions, requests and concerns can be sent to <a data-gmail href="${esc(gmailComposeUrl())}">kabirsayed.k@gmail.com</a> or through the <a data-help-center href="#helping-panel">Help Centre</a>.</p>
        </section>
      </div>
      ${footer()}
    </div>
  `;
}

function helpCenter() {
  return `
    <div class="page help-page" id="helping-panel">
      <section class="help-hero">
        <div class="container help-layout">
          <div>
            <span class="eyebrow">Help Centre</span>
            <h1 class="page-title">Tell us what<br>needs attention.</h1>
            <p>Ask for help, suggest a change, report a technical problem, or share an idea for Storyteller.</p>
            <a class="help-email" data-gmail href="${esc(gmailComposeUrl())}">kabirsayed.k@gmail.com</a>
          </div>
          <form id="helpForm" class="help-form">
            <div class="field">
              <label for="helpType">What can we help with?</label>
              <select id="helpType" required>
                <option value="Question">Question</option>
                <option value="Problem report">Report a problem</option>
                <option value="Change suggestion">Suggest a change</option>
                <option value="Account help">Account help</option>
                <option value="Moderation appeal">Moderation appeal</option>
              </select>
            </div>
            <div class="field"><label for="helpSubject">Subject</label><input id="helpSubject" maxlength="120" required placeholder="A short summary"></div>
            <div class="field"><label for="helpMessage">Details</label><textarea id="helpMessage" minlength="10" maxlength="2000" required placeholder="Explain what happened, what you expected, and any useful page or story link."></textarea></div>
            <button class="btn primary" type="submit">Prepare email</button>
            <p class="form-note">Submitting opens your email app with the message addressed to the Storyteller administrator. Nothing is sent without your confirmation.</p>
          </form>
        </div>
      </section>
      <section>
        <div class="container support-grid">
          <article><span class="eyebrow">Before writing</span><h2>Include useful context.</h2><p>Add the page or story name, what you were doing, what went wrong and the result you expected. Never include passwords or private authentication codes.</p></article>
          <article><span class="eyebrow">Community safety</span><h2>Report stories in place.</h2><p>For a published story, use its Report button. That securely links the reason, reporter and exact story inside the administrator control room.</p></article>
          <article><span class="eyebrow">Response</span><h2>We will review it.</h2><p>Messages are reviewed as availability permits. Urgent danger should be reported to the appropriate local emergency or legal authority.</p></article>
        </div>
      </section>
      ${footer()}
    </div>
  `;
}
async function admin() {
  if (!adminMode) return `<div class="page auth-wrap">${empty('Access denied', 'This area is reserved for administrators.')}</div>`;

  const [metrics, storiesData, commentsData, usersData, reportsData, donationSettings] = await Promise.all([
    StoryAPI.adminMetrics(),
    StoryAPI.adminStories(),
    StoryAPI.adminComments(),
    StoryAPI.adminUsers(),
    StoryAPI.adminReports(),
    StoryAPI.donationConfig(),
  ]);

  const storyRows = storiesData.map(story => `
    <div class="control-row">
      <div>
        <b>${esc(story.title)}</b>
        <small>${esc(story.profiles?.display_name)} · ${esc(story.status)} · ${story.view_count} views</small>
      </div>
      <div class="row-actions">
        <button data-admin="feature" data-id="${story.id}" data-value="${!story.is_featured}">${story.is_featured ? 'Unfeature' : 'Feature'}</button>
        <button class="danger" data-admin="delete-story" data-id="${story.id}">Delete</button>
      </div>
    </div>
  `).join('');

  const userRows = usersData.map(user => `
    <details class="control-detail account-detail">
      <summary class="control-row">
        <div class="admin-person">
          ${avatarMarkup(user.avatar_url, (user.display_name || user.username || 'U').slice(0, 2))}
          <span><b>${esc(user.display_name || 'Unnamed account')}</b><small>@${esc(user.username)} · ${esc(user.role)}${user.is_suspended ? ' · Suspended' : ''}</small></span>
        </div>
        <span class="detail-cue">View account details</span>
      </summary>
      <div class="control-detail-body">
        <div class="detail-grid">
          <div><small>Email</small><b>${esc(user.email || 'Unavailable until directory migration is applied')}</b></div>
          <div><small>Account ID</small><b>${esc(user.id)}</b></div>
          <div><small>Role</small><b>${esc(user.role)}</b></div>
          <div><small>Status</small><b>${user.is_suspended ? 'Suspended' : 'Active'}</b></div>
          <div><small>Joined</small><b>${esc(dateTime(user.created_at))}</b></div>
          <div><small>Updated</small><b>${esc(dateTime(user.updated_at))}</b></div>
          <div><small>Email confirmed</small><b>${esc(dateTime(user.email_confirmed_at))}</b></div>
          <div><small>Last sign-in</small><b>${esc(dateTime(user.last_sign_in_at))}</b></div>
          <div><small>Sign-in providers</small><b>${esc(providerNames(user.providers))}</b></div>
        </div>
        <div class="account-bio"><small>Biography</small><p>${esc(user.bio || 'No biography provided.')}</p></div>
        <div class="account-stats">
          <span><b>${user.story_count ?? '—'}</b>Stories</span>
          <span><b>${user.published_count ?? '—'}</b>Published</span>
          <span><b>${user.draft_count ?? '—'}</b>Drafts</span>
          <span><b>${user.comment_count ?? '—'}</b>Comments</span>
          <span><b>${user.like_count ?? '—'}</b>Likes</span>
          <span><b>${user.bookmark_count ?? '—'}</b>Bookmarks</span>
          <span><b>${user.follower_count ?? '—'}</b>Followers</span>
          <span><b>${user.following_count ?? '—'}</b>Following</span>
          <span><b>${user.report_count ?? '—'}</b>Reports</span>
        </div>
        <div class="row-actions">
          <button data-admin="role" data-id="${user.id}" data-value="${user.role === 'admin' ? 'writer' : 'admin'}">Make ${user.role === 'admin' ? 'writer' : 'admin'}</button>
          <button data-admin="suspend" data-id="${user.id}" data-value="${!user.is_suspended}">${user.is_suspended ? 'Restore' : 'Suspend'}</button>
          <button class="danger" data-admin="delete-user" data-id="${user.id}">Delete account</button>
        </div>
      </div>
    </details>
  `).join('');
  const commentRows = commentsData.map(comment => `
    <div class="control-row">
      <div>
        <b>${esc(comment.profiles?.display_name)} on ${esc(comment.stories?.title)}</b>
        <small>${esc(comment.body)}</small>
      </div>
      <div class="row-actions">
        <button data-admin="hide-comment" data-id="${comment.id}" data-value="${!comment.is_hidden}">${comment.is_hidden ? 'Show' : 'Hide'}</button>
        <button class="danger" data-admin="delete-comment" data-id="${comment.id}">Delete</button>
      </div>
    </div>
  `).join('');

  const reportRows = reportsData.map(report => {
    const targetStory = report.story || report.comment?.story || null;
    const targetLabel = report.story ? 'Story' : 'Comment';
    const targetTitle = report.story?.title || report.comment?.story?.title || 'Removed content';
    const targetLink = targetStory?.slug ? `#story/${encodeURIComponent(targetStory.slug)}` : '';
    return `
      <details class="control-detail report-detail">
        <summary class="control-row">
          <div>
            <b>${targetLabel}: ${esc(targetTitle)}</b>
            <small>Reported by ${esc(report.reporter?.display_name || 'Unknown user')} · ${esc(report.status)} · ${esc(dateTime(report.created_at))}</small>
          </div>
          <span class="detail-cue">Review report</span>
        </summary>
        <div class="control-detail-body">
          <div class="report-reason"><small>Reason provided</small><p>${esc(report.reason)}</p></div>
          <div class="detail-grid">
            <div><small>Report ID</small><b>${esc(report.id)}</b></div>
            <div><small>Reporter</small><b>${esc(report.reporter?.display_name || 'Unknown')} · @${esc(report.reporter?.username || 'unknown')}</b></div>
            <div><small>Target type</small><b>${targetLabel}</b></div>
            <div><small>Status</small><b>${esc(report.status)}</b></div>
            ${report.story ? `<div><small>Story author</small><b>${esc(report.story.author?.display_name || 'Unknown')} · @${esc(report.story.author?.username || 'unknown')}</b></div><div><small>Story state</small><b>${esc(report.story.status)}</b></div>` : ''}
          </div>
          ${report.comment ? `<div class="reported-content"><small>Reported comment</small><p>${esc(report.comment.body)}</p></div>` : ''}
          <div class="row-actions">
            ${targetLink ? `<a class="btn" href="${targetLink}">Open ${targetLabel.toLowerCase()} and story</a>` : '<span class="btn disabled">Content no longer available</span>'}
            <button data-admin="report-status" data-id="${report.id}" data-value="reviewing">Mark reviewing</button>
            <button data-admin="report-status" data-id="${report.id}" data-value="resolved">Resolve</button>
            <button data-admin="report-status" data-id="${report.id}" data-value="dismissed">Dismiss</button>
          </div>
        </div>
      </details>
    `;
  }).join('');
  return `
    <div class="page admin-shell">
      <aside class="admin-side">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">Control room</span>
        <a href="#admin">Overview</a>
        <a href="#admin-donations">Donations</a>
        <a href="#admin-stories">Stories</a>
        <a href="#admin-users">Users</a>
        <a href="#admin-comments">Comments</a>
        <a href="#admin-reports">Reports</a>
        <button class="btn signOut">Sign out</button>
      </aside>
      <main class="admin-content">
        <div class="admin-title">
          <div>
            <span class="eyebrow">Live operations</span>
            <h1>Editorial control.</h1>
          </div>
          <span class="live-badge">Live</span>
        </div>
        <div class="metric-grid">
          <div><small>Readers</small><b>${metrics.users || 0}</b></div>
          <div><small>Stories</small><b>${metrics.stories || 0}</b></div>
          <div><small>Total views</small><b>${metrics.views || 0}</b></div>
          <div><small>Open reports</small><b>${metrics.open_reports || 0}</b></div>
        </div>
        <section class="admin-section donation-admin" id="admin-donations">
          <div class="between"><h2>Donations</h2><span>Direct QR support</span></div>
          <div class="donation-admin-grid">
            <div><span class="eyebrow">No payment platform</span><h3>Donation QR code</h3><p>Upload the QR image that visitors should scan. Until one is uploaded, the public donation window displays “Coming soon...”.</p>
              <form id="donationQrForm"><label class="qr-upload"><span>Choose QR image</span><input id="donationQrFile" type="file" accept="image/png,image/jpeg,image/webp" required></label><button class="btn primary" type="submit">Upload QR code</button>${donationSettings?.qr_url ? '<button id="removeDonationQr" class="btn danger" type="button">Remove QR</button>' : ''}</form>
            </div>
            <div class="admin-qr-preview">${donationSettings?.qr_url ? `<img src="${esc(donationSettings.qr_url)}" alt="Current donation QR code"><small>Current public QR code</small>` : '<strong>Coming soon...</strong><small>No QR code uploaded</small>'}</div>
          </div>
        </section>
        <section class="admin-section" id="admin-stories">
          <div class="between"><h2>Stories</h2><span>${storiesData.length} records</span></div>
          ${storyRows || empty('No stories', 'Published and draft stories appear here.')}
        </section>
        <section class="admin-section" id="admin-users">
          <div class="between"><h2>People</h2><span>${usersData.length} accounts</span></div>
          ${userRows}
        </section>
        <section class="admin-section" id="admin-comments">
          <div class="between"><h2>Comments</h2><span>${commentsData.length} responses</span></div>
          ${commentRows || empty('No comments', 'Community responses appear here.')}
        </section>
        <section class="admin-section" id="admin-reports">
          <div class="between"><h2>Reports</h2><span>${reportsData.length} reports</span></div>
          ${reportRows || empty('No reports', 'Your community is clear.')}
        </section>
      </main>
    </div>
  `;
}

async function route() {
  if (!StoryAPI.configured) {
    $('#app').innerHTML = setup();
    return;
  }

  const [page, arg] = (location.hash.slice(1) || 'home').split('/');
  $('#app').innerHTML = '<div class="page auth-wrap"><div class="loader"></div></div>';

  try {
    if (page === 'story') {
      if (!session) {
        try { sessionStorage.setItem('storyteller.redirectAfterAuth', location.hash || '#home'); } catch {}
        $('#app').innerHTML = auth('signin', 'Sign in or create an account to read stories.');
      } else {
        currentStory = await StoryAPI.story(decodeURIComponent(arg || ''));
        $('#app').innerHTML = reader(currentStory);
      }
    } else if (page === 'explore' || page === 'read') {
      browseState = { category: arg || '', query: '', sort: 'latest' };
      stories = await StoryAPI.stories({ ...browseState, from: 0, to: 11 });
      $('#app').innerHTML = explore();
    } else if (page === 'profile') {
      $('#app').innerHTML = await profile(arg || 'published');
    } else if (page === 'admin' || page.startsWith('admin-')) {
      $('#app').innerHTML = await admin();
    } else if (page === 'write') {
      $('#app').innerHTML = write(arg ? await StoryAPI.storyById(arg) : null);
    } else if (page === 'auth') {
      $('#app').innerHTML = auth(arg);
    } else if (page === 'reset-password') {
      $('#app').innerHTML = resetPassword();
    } else if (page === 'privacy' || page === 'terms' || page === 'rules') {
      $('#app').innerHTML = legal(page);
    } else if (page === 'helping-panel') {
      $('#app').innerHTML = helpCenter();
    } else if (page === 'assets') {
      $('#app').innerHTML = assetLibrary();
    } else {
      await refresh();
      $('#app').innerHTML = home();
    }

    scrollTo(0, 0);
    bind();

    if (page === 'story' && currentStory?.status === 'published') {
      setTimeout(() => recordCurrentStoryView().catch(error => console.error('Could not record view', error)), 3500);
      loadComments().catch(error => console.error('Could not load comments', error));
      StoryAPI.markRead(currentStory.id, 10);
    }

    if (page.startsWith('admin-')) {
      setTimeout(() => document.getElementById(page)?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  } catch (error) {
    fail(error);
  }
}

function saveStory(publish) {
  clearTimeout(timer);
  saveQueue = saveQueue.catch(() => {}).then(() => persistStory(publish));
  return saveQueue;
}

async function persistStory(publish) {
  if (!$('#storyTitle') || !$('#storyContent')) return;
  const title = $('#storyTitle').value.trim();
  if (title.length < 3) throw Error('Add a title with at least 3 characters');
  const content = combinedEditorContent();
  const plainContent = stripHtml(content).replace(/\s+/g, ' ').trim();
  if (publish && (!plainContent || plainContent === 'Tell your story...')) throw Error('Add story content before publishing');

  let cover = editingStory?.cover || null;
  const file = $('#storyCover').files[0];
  if (file) cover = await StoryAPI.uploadCover(file);

  const payload = {
    id: draftId,
    title,
    subtitle: $('#storySubtitle').value,
    content,
    category: $('#storyCategory').value,
    tags: $('#storyTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    cover,
    currentStatus: editingStory?.status || null,
    publishedAt: editingStory?.publishedAt || editingStory?.published_at || null,
  };

  const previousDraftId = draftId;
  const record = await StoryAPI.saveStory(payload, publish);
  draftId = record.id;
  editingStory = { ...(editingStory || {}), ...record, cover };
  clearEditorBackup(previousDraftId);
  clearEditorBackup('new');
  if (!publish && !previousDraftId && location.hash === '#write') history.replaceState(null, '', `#write/${record.id}`);

  if ($('#saveState')) $('#saveState').textContent = publish ? 'Published' : 'Draft saved';
  toast(publish ? 'Story published' : 'Draft saved');

  if (publish) {
    await refresh();
    location.hash = `story/${record.slug}`;
  } else {
    editorStats();
  }
}

async function recordCurrentStoryView() {
  if (!currentStory?.id || currentStory.status !== 'published') return;
  const hourKey = new Date().toISOString().slice(0, 13);
  const storageKey = `storyteller.view.${currentStory.id}.${hourKey}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, 'pending');
  } catch {}

  const counted = await StoryAPI.view(currentStory.id);
  try { localStorage.setItem(storageKey, counted ? 'counted' : 'seen'); } catch {}
  if (counted) {
    currentStory.views = Number(currentStory.views || 0) + 1;
    $$('.story-view-count').forEach(node => { node.textContent = currentStory.views.toLocaleString(); });
  }
}

async function loadComments() {
  const rows = await StoryAPI.comments(currentStory.id);
  $('#commentList').innerHTML = rows.length
    ? rows.map(comment => `
        <div class="notice">
          ${avatarMarkup(comment.author_avatar_url || comment.profiles?.avatar_url, (comment.author_name || comment.profiles?.display_name)?.[0])}
          <p>
            <b>${esc(comment.author_name || comment.profiles?.display_name)}</b>
            <small>${new Date(comment.created_at).toLocaleDateString()}</small>
            <span>${esc(comment.body)}</span>
          </p>
        </div>
      `).join('')
    : empty('No comments yet', 'Start the conversation.');
}

function enhanceFormLabels() {
  $$('.field').forEach((field, index) => {
    const label = field.querySelector('label');
    const control = field.querySelector('input, select, textarea');
    if (!label || !control) return;
    if (!control.id) control.id = `storyteller-field-${index}`;
    label.htmlFor = control.id;
    if (!control.getAttribute('aria-label')) control.setAttribute('aria-label', label.textContent.trim());
  });
}

function bind() {
  startHeroRotation();
  enhanceFormLabels();
  requestAnimationFrame(() => $$('.reveal').forEach(card => card.classList.add('seen')));

  $$('[data-story-url]').forEach(storyCard => {
    storyCard.onclick = event => {
      if (event.target.closest('button, a, input, select, textarea')) return;
      location.hash = storyCard.dataset.storyUrl;
    };
    storyCard.onkeydown = event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === storyCard) {
        event.preventDefault();
        location.hash = storyCard.dataset.storyUrl;
      }
    };
  });

  $$('.openHelp').forEach(button => { button.onclick = openHelpModal; });
  $('#helpForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const type = $('#helpType').value;
    const subject = $('#helpSubject').value.trim();
    const message = $('#helpMessage').value.trim();
    const emailSubject = `[Storyteller ${type}] ${subject}`;
    const emailBody = `${message}\n\nPage: ${location.href}\nSigned in: ${session ? 'Yes' : 'No'}`;
    openGmail(emailSubject, emailBody);
    toast('Your email app is ready');
  });

    $$('.save,.bookmark').forEach(button => {
    button.onclick = async event => {
      event.preventDefault();
      try {
        const active = await StoryAPI.toggle('bookmarks', button.dataset.id);
        if (active) bookmarkedStoryIds.add(button.dataset.id);
        else bookmarkedStoryIds.delete(button.dataset.id);
        $$('.save,.bookmark').filter(item => item.dataset.id === button.dataset.id).forEach(item => {
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        toast(active ? 'Saved' : 'Bookmark removed');
      } catch (error) {
        authFail(error);
      }
    };
  });

  $$('.like').forEach(button => {
    button.onclick = async () => {
      try {
        const active = await StoryAPI.toggle('likes', button.dataset.id);
        if (active) likedStoryIds.add(button.dataset.id);
        else likedStoryIds.delete(button.dataset.id);
        $$('.like').filter(item => item.dataset.id === button.dataset.id).forEach(item => {
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        if (currentStory?.id === button.dataset.id) {
          currentStory.likes = Math.max(0, currentStory.likes + (active ? 1 : -1));
          $$('.like .btn-icon + span').forEach(label => { label.textContent = `Appreciate · ${currentStory.likes}`; });
        }
        toast(active ? 'Story appreciated' : 'Appreciation removed');
      } catch (error) {
        authFail(error);
      }
    };
  });
$('#comment')?.addEventListener('click', async () => {
    try {
      const body = $('#commentBody').value.trim();
      if (body) {
        await StoryAPI.comment(currentStory.id, body);
        $('#commentBody').value = '';
        await loadComments();
      }
    } catch (error) {
      authFail(error);
    }
  });

  $('.followAuthor')?.addEventListener('click', async event => {
    try {
      const button = event.currentTarget;
      const targetUsername = button?.dataset.username;
      if (!targetUsername) return toast('Writer not available');
      const following = await StoryAPI.follow(targetUsername);
      if (button) {
        button.textContent = following ? 'Following' : 'Follow';
        button.classList.toggle('active', following);
        button.setAttribute('aria-pressed', String(following));
      }
      toast(following ? 'Author followed' : 'Author unfollowed');
    } catch (error) {
      authFail(error);
    }
  });

  $('.reportStory')?.addEventListener('click', async () => {
    const reason = prompt('Why are you reporting this story?');
    if (reason?.trim().length >= 5) {
      try {
        await StoryAPI.reportStory(currentStory.id, reason.trim());
        toast('Report sent to moderators');
      } catch (error) {
        authFail(error);
      }
    }
  });

  const runFilter = () => filter().catch(authFail);
  if ($('#category')) $('#category').onchange = runFilter;
  if ($('#sort')) $('#sort').onchange = runFilter;
  if ($('#exploreSearch')) $('#exploreSearch').oninput = debounce(runFilter, 300);
  if ($('#more')) $('#more').onclick = () => more().catch(authFail);

  $$('.editor-bar button').forEach(button => {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      const editor = $('#storyContent');
      editor?.focus();
      if (button.dataset.action === 'link') {
        const url = prompt('Paste a link URL starting with https://');
        if (!url) return;
        try {
          const link = new URL(url);
          if (!['http:', 'https:'].includes(link.protocol)) throw new Error('Use an http or https link');
          document.execCommand('createLink', false, link.href);
          editor?.querySelectorAll('a[href]').forEach(anchor => {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          });
        } catch (error) {
          return toast(error.message || 'Invalid link');
        }
      } else if (button.dataset.action === 'unlink') {
        document.execCommand('unlink', false, null);
      } else if (button.dataset.action === 'divider') {
        document.execCommand('insertHTML', false, '<hr><p><br></p>');
      } else if (button.dataset.cmd) {
        document.execCommand(button.dataset.cmd, false, button.dataset.value || null);
      }
      markEditorChanged();
    };
  });

  const markEditorChanged = () => {
    saveEditorBackup();
    if ($('#saveState')) $('#saveState').textContent = 'Unsaved';
    editorStats();
    clearTimeout(timer);
    timer = setTimeout(() => saveStory(false).catch(error => {
      if ($('#saveState')) $('#saveState').textContent = error.message;
    }), 1500);
  };

  $('#pageTabs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-page-index]');
    if (button) setEditorPage(Number(button.dataset.pageIndex));
  });
  $('#addPage')?.addEventListener('click', () => {
    syncActiveEditorPage();
    editorPages.splice(activeEditorPage + 1, 0, '<p>New page...</p>');
    setEditorPage(activeEditorPage + 1, false);
    markEditorChanged();
  });
  $('#duplicatePage')?.addEventListener('click', () => {
    syncActiveEditorPage();
    editorPages.splice(activeEditorPage + 1, 0, editorPages[activeEditorPage] || '<p></p>');
    setEditorPage(activeEditorPage + 1, false);
    markEditorChanged();
  });
  $('#removePage')?.addEventListener('click', () => {
    if (editorPages.length === 1) return toast('At least one page is required');
    if (!confirm('Remove this page?')) return;
    syncActiveEditorPage();
    editorPages.splice(activeEditorPage, 1);
    setEditorPage(Math.min(activeEditorPage, editorPages.length - 1), false);
    markEditorChanged();
  });
  $('#movePageLeft')?.addEventListener('click', () => {
    if (activeEditorPage === 0) return;
    syncActiveEditorPage();
    [editorPages[activeEditorPage - 1], editorPages[activeEditorPage]] = [editorPages[activeEditorPage], editorPages[activeEditorPage - 1]];
    setEditorPage(activeEditorPage - 1, false);
    markEditorChanged();
  });
  $('#movePageRight')?.addEventListener('click', () => {
    if (activeEditorPage >= editorPages.length - 1) return;
    syncActiveEditorPage();
    [editorPages[activeEditorPage + 1], editorPages[activeEditorPage]] = [editorPages[activeEditorPage], editorPages[activeEditorPage + 1]];
    setEditorPage(activeEditorPage + 1, false);
    markEditorChanged();
  });

  $$('#storyTitle,#storySubtitle,#storyCategory,#storyTags,#storyContent').forEach(node => {
    node?.addEventListener('input', () => {
      clearTimeout(timer);
      saveEditorBackup();
      if ($('#saveState')) $('#saveState').textContent = 'Unsaved';
      editorStats();
      if ($('#storyContent')) {
        timer = setTimeout(() => saveStory(false).catch(error => {
          if ($('#saveState')) $('#saveState').textContent = error.message;
        }), 1500);
      }
    });
  });

  $('#storyContent')?.addEventListener('paste', event => {
    if (event.clipboardData?.types?.includes('text/plain')) {
      event.preventDefault();
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    }
  });

  $('#storyContent')?.addEventListener('dragover', event => event.preventDefault());
  $('#storyContent')?.addEventListener('drop', async event => {
    const file = [...(event.dataTransfer?.files || [])].find(item => /\.txt$/i.test(item.name) || item.type === 'text/plain' || /\.docx$/i.test(item.name) || item.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (!file) return;
    event.preventDefault();
    try {
      if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) await importDocxStory(file);
      else await importTxtStory(file);
    } catch (error) { authFail(error); }
  });

  $('#previewToggle')?.addEventListener('click', () => {
    const editor = $('.editor');
    if (!editor) return;
    editor.classList.toggle('previewing');
    $('#previewToggle').textContent = editor.classList.contains('previewing') ? 'Edit' : 'Preview';
    editorStats();
  });

  $('#importTxt')?.addEventListener('click', () => $('#storyTxt')?.click());
  $('#storyTxt')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file) await importTxtStory(file);
    event.target.value = '';
  });
  $('#importDocx')?.addEventListener('click', () => $('#storyDocx')?.click());
  $('#storyDocx')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (file) {
      try { await importDocxStory(file); } catch (error) { authFail(error); }
    }
    event.target.value = '';
  });

  $('.saveDraft')?.addEventListener('click', () => saveStory(false).catch(authFail));
  $('.publish')?.addEventListener('click', () => saveStory(true).catch(authFail));
  $('.deleteOwnStory')?.addEventListener('click', async () => {
    if (confirm('Delete this story permanently?')) {
      try {
        await StoryAPI.deleteMyStory(draftId);
        toast('Story deleted');
        location.hash = 'profile/drafts';
      } catch (error) {
        authFail(error);
      }
    }
  });


  $('#font')?.addEventListener('click', event => {
    const enlarged = $('.reader-body')?.classList.toggle('reader-large') ?? false;
    event.currentTarget.classList.toggle('active', enlarged);
    event.currentTarget.setAttribute('aria-pressed', String(enlarged));
  });
  readerPageIndex = 0;
  $$('.reader-page-arrow').forEach(button => button.addEventListener('click', () => {
    setReaderPage(readerPageIndex + Number(button.dataset.readerDirection || 0));
  }));
  setReaderPage(0, false);
  $('#readerMode')?.addEventListener('click', () => toggleTheme());
  $('.share')?.addEventListener('click', event => {
    const button = event.currentTarget;
    button.classList.add('active');
    window.setTimeout(() => button.classList.remove('active'), 700);
    if (navigator.share) navigator.share({ title: currentStory.title, url: location.href });
    else navigator.clipboard.writeText(location.href).then(() => toast('Link copied'));
  });
  $('.auth-card:not(.resetForm)')?.addEventListener('submit', handleAuth);
  $$('input[name="accountRole"]').forEach(input => input.addEventListener('change', () => {
    const writerSelected = $('input[name="accountRole"]:checked')?.value === 'writer';
    const fields = $('#writerSignupFields');
    if (!fields) return;
    fields.hidden = !writerSelected;
    $('#writerGmail').required = writerSelected;
  }));
  $('.resetForm')?.addEventListener('submit', handlePasswordReset);
  $$('.social').forEach(button => button.onclick = () => StoryAPI.social(button.dataset.provider).catch(authFail));
  $('.authMode')?.addEventListener('click', () => location.hash = location.hash.includes('signup') ? 'auth/signin' : 'auth/signup');
  $('.forgot')?.addEventListener('click', async () => {
    const email = $('#authEmail').value;
    if (!email) return toast('Enter your email');
    try {
      await StoryAPI.resetPassword(email);
      toast('Check your email');
    } catch (error) {
      authFail(error);
    }
  });

  $('.editProfile')?.addEventListener('click', () => { $('.profile-editor').hidden = !$('.profile-editor').hidden; });
  $('.becomeWriterHero')?.addEventListener('click', () => {
    const editor = $('.profile-editor');
    if (editor) editor.hidden = false;
    $('#becomeWriterEmail')?.focus();
  });
  $('.saveProfile')?.addEventListener('click', saveProfile);
  $('#profileUsername')?.addEventListener('input', clearProfileUsernameError);
  $('#becomeWriter')?.addEventListener('click', becomeWriter);
  $('#saveWriterDonationQr')?.addEventListener('click', async event => {
    const file = $('#writerDonationQrFile')?.files?.[0];
    if (!file) return toast('Choose a QR image');
    const button = event.currentTarget;
    try {
      button.disabled = true;
      button.textContent = 'Uploading...';
      await StoryAPI.uploadWriterDonationQr(file);
      toast('Writer donation QR published');
      await route();
    } catch (error) { authFail(error); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  $('#removeWriterDonationQr')?.addEventListener('click', async () => {
    if (!confirm('Remove your public donation QR code?')) return;
    try { await StoryAPI.clearWriterDonationQr(); toast('Writer donation QR removed'); await route(); }
    catch (error) { authFail(error); }
  });
  $('.signOut')?.addEventListener('click', async () => {
    await StoryAPI.signOut();
    location.hash = 'home';
  });

  $$('[data-admin]').forEach(button => button.onclick = () => adminAction(button));

  $('#donationQrForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const file = $('#donationQrFile')?.files?.[0];
    if (!file) return toast('Choose a QR image');
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    try {
      submit.disabled = true;
      submit.textContent = 'Uploading...';
      await StoryAPI.adminUploadDonationQr(file);
      toast('Donation QR code published');
      await route();
    } catch (error) { authFail(error); }
    finally { if (submit.isConnected) { submit.disabled = false; submit.textContent = 'Upload QR code'; } }
  });
  $('#removeDonationQr')?.addEventListener('click', async () => {
    if (!confirm('Remove the public donation QR code?')) return;
    try { await StoryAPI.adminClearDonationQr(); toast('Donation QR code removed'); await route(); }
    catch (error) { authFail(error); }
  });
  editorStats();
}

function startHeroRotation() {
  clearInterval(heroTimer);
  heroTimer = null;
  const slides = $$('.hero-slide');
  if (slides.length < 2) return;

  slides.forEach((slide, index) => slide.classList.toggle('active', index === 0));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let active = 0;
  heroTimer = setInterval(() => {
    if (document.hidden || !document.querySelector('.hero-slide')) return;
    slides[active].classList.remove('active');
    active = (active + 1) % slides.length;
    slides[active].classList.add('active');
  }, 30000);
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const newPassword = $('#newPassword').value;
  const confirmPassword = $('#confirmPassword').value;
  if (newPassword !== confirmPassword) return toast('Passwords do not match');

  try {
    await StoryAPI.updatePassword(newPassword);
    toast('Password updated');
    location.hash = 'profile';
  } catch (error) {
    authFail(error);
  }
}

async function becomeWriter(event) {
  const button = event?.currentTarget;
  const email = $('#becomeWriterEmail')?.value.trim().toLowerCase() || '';
  const source = $('#becomeWriterSource')?.value.trim() || '';
  const instagram = ($('#becomeWriterInstagram')?.value.trim() || '').replace(/^@/, '');
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(email)) return toast('Enter a valid Gmail address');
  if (source && source.length < 3) return toast('Contact source must be at least 3 characters');
  if (instagram && !/^[a-z0-9._]{1,30}$/i.test(instagram)) return toast('Enter a valid Instagram handle');

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Upgrading...';
    }
    const updatedProfile = await StoryAPI.becomeWriter(email, source, instagram);
    accountRole = updatedProfile?.role || 'writer';
    await syncNavbarAvatar(updatedProfile);
    toast('Writer tools unlocked');
    location.hash = 'profile/drafts';
    route();
  } catch (error) {
    authFail(error);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = 'Upgrade to Writer';
    }
  }
}

async function saveProfile() {
  try {
    let avatar = null;
    const file = $('#profileAvatar').files[0];
    if (file) avatar = await StoryAPI.uploadAvatar(file);

    const updatedProfile = await StoryAPI.updateProfile({
      display_name: $('#profileName').value.trim(),
      username: $('#profileUsername').value.trim().toLowerCase(),
      bio: $('#profileBio').value.trim(),
      ...(hasWriterAccess() && {
        contact_email: $('#profileContactEmail')?.value.trim().toLowerCase() || null,
        contact_source: $('#profileContactSource')?.value.trim() || null,
        instagram_handle: ($('#profileInstagram')?.value.trim() || '').replace(/^@/, '') || null,
      }),
      ...(avatar && { avatar_url: avatar }),
    });

    stories = stories.map(story => story.authorId === updatedProfile.id || story.isOwn ? {
      ...story,
      author: updatedProfile.display_name,
      username: updatedProfile.username,
      authorAvatar: updatedProfile.avatar_url || '',
      ini: updatedProfile.display_name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(),
    } : story);
    await syncNavbarAvatar(updatedProfile);
    toast('Profile updated');
    route();
  } catch (error) {
    if (isUsernameTakenError(error)) {
      showProfileUsernameError(friendlyErrorMessage(error));
      $('#profileUsername')?.focus();
      return;
    }
    authFail(error);
  }
}

async function adminAction(button) {
  const action = button.dataset.admin;
  const id = button.dataset.id;
  const value = button.dataset.value === 'true';
  const destructive = action.startsWith('delete');

  if (destructive && !confirm('This action is permanent. Continue?')) return;

  try {
    if (action === 'feature') await StoryAPI.adminUpdate('stories', id, { is_featured: value });
    else if (action === 'delete-story') await StoryAPI.adminDelete('stories', id);
    else if (action === 'role') await StoryAPI.adminSetUser(id, button.dataset.value, null);
    else if (action === 'suspend') await StoryAPI.adminSetUser(id, null, value);
    else if (action === 'delete-user') await StoryAPI.adminDeleteUser(id);
    else if (action === 'hide-comment') await StoryAPI.adminUpdate('comments', id, { is_hidden: value });
    else if (action === 'delete-comment') await StoryAPI.adminDelete('comments', id);
    else if (action === 'resolve') await StoryAPI.adminUpdate('reports', id, { status: 'resolved' });
    else if (action === 'report-status') await StoryAPI.adminUpdate('reports', id, { status: button.dataset.value });
    toast('Admin change saved');
    route();
  } catch (error) {
    authFail(error);
  }
}

async function handleAuth(event) {
  event.preventDefault();
  try {
    if (location.hash.includes('signup')) {
      const selectedRole = $('input[name="accountRole"]:checked')?.value || 'reader';
      const writerGmail = $('#writerGmail')?.value.trim() || '';
      const contactSource = $('#writerContactSource')?.value.trim() || '';
      const instagram = ($('#writerInstagram')?.value.trim() || '').replace(/^@/, '');
      if (selectedRole === 'writer' && !/^[^\s@]+@gmail\.com$/i.test(writerGmail)) throw new Error('Writers must provide a valid Gmail address');
      if (selectedRole === 'writer' && contactSource && contactSource.length < 3) throw new Error('Contact source must be at least 3 characters');
      if (selectedRole === 'writer' && instagram && !/^[a-z0-9._]{1,30}$/i.test(instagram)) throw new Error('Enter a valid Instagram handle');
      const data = await StoryAPI.signUp($('#authEmail').value, $('#authPassword').value, $('#authName').value, selectedRole, writerGmail, contactSource, instagram);
      toast(data.session ? 'Account created' : 'Verify your email');
    } else {
      await StoryAPI.signIn($('#authEmail').value, $('#authPassword').value);
    }
    session = await StoryAPI.session();
    let redirect = 'home';
    try {
      redirect = sessionStorage.getItem('storyteller.redirectAfterAuth') || 'home';
      sessionStorage.removeItem('storyteller.redirectAfterAuth');
    } catch {}
    location.hash = redirect.replace(/^#?/, '');
  } catch (error) {
    authFail(error);
  }
}

async function filter() {
  const requestId = ++filterRequest;
  browseState = {
    category: $('#category').value,
    query: $('#exploreSearch').value.trim(),
    sort: $('#sort').value,
  };

  const results = await StoryAPI.stories({ ...browseState, from: 0, to: 11 });
  if (requestId !== filterRequest) return;
  stories = results;
  $('#storyGrid').innerHTML = stories.length ? stories.map(card).join('') : empty('No matches', 'Try another search.');
  $('#more') && ($('#more').hidden = stories.length < 12);
  bind();
}

async function more() {
  const extra = await StoryAPI.stories({
    ...browseState,
    from: stories.length,
    to: stories.length + 11,
  });

  stories.push(...extra);
  $('#storyGrid').insertAdjacentHTML('beforeend', extra.map(card).join(''));
  if (extra.length < 12) $('#more').hidden = true;
  bind();
}

async function refresh() {
  const [nextCategories, nextStories, reactions] = await Promise.all([
    StoryAPI.categories(),
    StoryAPI.stories({ to: 23 }),
    session ? StoryAPI.reactionState().catch(() => ({ likes: [], bookmarks: [] })) : Promise.resolve({ likes: [], bookmarks: [] }),
  ]);
  categories = nextCategories;
  stories = nextStories;
  likedStoryIds = new Set(reactions.likes);
  bookmarkedStoryIds = new Set(reactions.bookmarks);
}
function toggleTheme(force) {
  if (force === 'light') document.body.classList.add('light');
  else if (force === 'dark') document.body.classList.remove('light');
  else document.body.classList.toggle('light');
  localStorage.theme = document.body.classList.contains('light') ? 'light' : 'dark';
  syncChromeIcons();
}

function syncChromeIcons() {
  const searchOpen = Boolean($('#search')?.classList.contains('open'));
  const notificationsOpen = Boolean($('#notifications')?.classList.contains('open'));
  const helpOpen = Boolean($('#helpOverlay')?.classList.contains('open'));
  const lightMode = document.body.classList.contains('light');
  if ($('#searchBtn')) {
    $('#searchBtn').innerHTML = searchOpen ? icons.close : icons.search;
    $('#searchBtn').classList.toggle('active', searchOpen);
    $('#searchBtn').setAttribute('aria-pressed', String(searchOpen));
  }
  if ($('#bell')) {
    $('#bell').innerHTML = `${icons.bell}<i></i>`;
    $('#bell').classList.toggle('active', notificationsOpen);
    $('#bell').setAttribute('aria-pressed', String(notificationsOpen));
  }
  if ($('#theme')) {
    $('#theme').innerHTML = icons.theme;
    $('#theme').classList.toggle('active', lightMode);
    $('#theme').setAttribute('aria-pressed', String(lightMode));
  }
  if ($('#helpBtn')) {
    $('#helpBtn').innerHTML = helpOpen ? icons.close : icons.help;
    $('#helpBtn').classList.toggle('active', helpOpen);
    $('#helpBtn').setAttribute('aria-pressed', String(helpOpen));
  }
  if ($('#readerMode')) {
    $('#readerMode').classList.toggle('active', lightMode);
    $('#readerMode').setAttribute('aria-pressed', String(lightMode));
  }
}
async function syncNavbarAvatar(profile = null) {
  const button = $('#navAvatar');
  if (!button) return;
  if (!session) {
    accountRole = 'guest';
    syncRoleNavigation();
    button.classList.remove('has-image');
    button.textContent = 'ST';
    button.title = 'Sign in or create an account';
    return;
  }

  const userId = session.user.id;
  try {
    const person = profile || await StoryAPI.profile();
    if (!person || session?.user.id !== userId) return;
    accountRole = person.role || 'reader';
    syncRoleNavigation();
    const initials = person.display_name?.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'ST';
    button.classList.toggle('has-image', Boolean(person.avatar_url));
    button.innerHTML = person.avatar_url
      ? `<img src="${esc(person.avatar_url)}" alt="${esc(person.display_name || 'Your profile')}">`
      : esc(initials);
    button.title = person.display_name || 'Open profile';
  } catch (error) {
    console.error('Unable to load navbar avatar', error);
  }
}

function syncRoleNavigation() {
  $$('[data-writer-only]').forEach(node => { node.hidden = !hasWriterAccess(); });
}

const usernameTakenMessages = [
  'Username already taken — choose a different one.',
  'Nahh, that username is already claimed.',
  'Make it different — someone got there first.',
  'That username is busy. Try another vibe.',
  'Too slow, that username already exists.',
  'Pick another username — this one has an owner.',
];
const isUsernameTakenError = error => /profiles_username_key|duplicate key value.*username|username.*already/i.test(String(error?.message || error || ''));
const friendlyErrorMessage = error => {
  const text = String(error?.message || error || 'Something went wrong');
  if (isUsernameTakenError(error)) return usernameTakenMessages[Math.floor(Math.random() * usernameTakenMessages.length)];
  if (/provider is not enabled/i.test(text)) return 'That social login is not enabled yet. Use email and password for now.';
  return text;
};
const showProfileUsernameError = message => {
  const field = $('#profileUsername')?.closest('.field');
  const feedback = $('#profileUsernameFeedback');
  if (!field || !feedback) return toast(message);
  field.classList.add('invalid');
  feedback.textContent = message;
};
const clearProfileUsernameError = () => {
  $('#profileUsername')?.closest('.field')?.classList.remove('invalid');
  if ($('#profileUsernameFeedback')) $('#profileUsernameFeedback').textContent = '';
};

function authFail(error) {
  console.error(error);
  const message = friendlyErrorMessage(error);
  toast(message);
  if (/sign in/i.test(error.message || '')) setTimeout(() => { location.hash = 'auth/signin'; }, 500);
}

function fail(error) {
  console.error(error);
  $('#app').innerHTML = `<div class="page auth-wrap">${empty('Something went wrong', error.message)}</div>`;
}

function debounce(fn, delay) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), delay);
  };
}

let toastTimer = null;
function toast(message) {
  let node = $('#siteMessage');
  const page = $('.page') || $('#app');
  if (!node) {
    node = document.createElement('div');
    node.id = 'siteMessage';
    node.className = 'site-message';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    page?.prepend(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3600);
}

const overlay = $('#search');
const helpOverlay = $('#helpOverlay');
const donationOverlay = $('#donationOverlay');
const closeDonationModal = () => {
  donationOverlay.classList.remove('open');
  donationOverlay.setAttribute('aria-hidden', 'true');
};
const openDonationModal = async (qrUrl = '', recipient = 'the developer') => {
  donationOverlay.classList.add('open');
  donationOverlay.setAttribute('aria-hidden', 'false');
  $('#donationTitle').textContent = recipient === 'the developer' ? 'Donate to the developer.' : `Support ${recipient}.`;
  $('#donationContent').innerHTML = '<p>Your support helps independent stories and the people who create them.</p><strong class="coming-soon">Coming soon...</strong>';
  $('#closeDonation')?.focus();
  let publicQr = qrUrl;
  if (!publicQr) publicQr = (await StoryAPI.donationConfig())?.qr_url || '';
  if (!publicQr || !donationOverlay.classList.contains('open')) return;
  $('#donationContent').innerHTML = `<p>Scan this QR code with your preferred payment app. Your donation goes directly to ${esc(recipient)}.</p><div class="donation-qr"><img src="${esc(publicQr)}" alt="Donation payment QR code for ${esc(recipient)}"><small>Verify the recipient in your payment app before confirming.</small></div>`;
};
const openHelpModal = () => {
  helpOverlay.classList.add('open');
  helpOverlay.setAttribute('aria-hidden', 'false');
  $('#closeHelp')?.focus();
  syncChromeIcons();
};
const closeHelpModal = () => {
  helpOverlay.classList.remove('open');
  helpOverlay.setAttribute('aria-hidden', 'true');
  syncChromeIcons();
};
$('#helpBtn').onclick = openHelpModal;
$('#closeHelp').onclick = closeHelpModal;
$('#closeDonation').onclick = closeDonationModal;
helpOverlay.onclick = event => event.target === helpOverlay && closeHelpModal();
donationOverlay.onclick = event => event.target === donationOverlay && closeDonationModal();
document.addEventListener('click', event => {
  const writerDonationAction = event.target.closest('.openWriterDonation');
  if (writerDonationAction) {
    event.preventDefault();
    openDonationModal(writerDonationAction.dataset.qr || '', writerDonationAction.dataset.writer || 'this writer');
    return;
  }
  const donationAction = event.target.closest('.openDonation');
  if (donationAction) {
    event.preventDefault();
    openDonationModal();
    return;
  }
  const gmailAction = event.target.closest('[data-gmail]');
  if (gmailAction) {
    event.preventDefault();
    openGmail(gmailAction.dataset.subject || '', gmailAction.dataset.body || '');
    return;
  }
  const helpAction = event.target.closest('[data-help-center]');
  if (helpAction) {
    event.preventDefault();
    closeHelpModal();
    location.hash = 'helping-panel';
  }
}, true);
$('#searchBtn').onclick = () => {
  const opening = !overlay.classList.contains('open');
  overlay.classList.toggle('open', opening);
  if (opening) $('#searchInput').focus();
  syncChromeIcons();
};
$('#searchInput').oninput = debounce(async event => {
  const query = event.target.value.trim();
  if (!query) return ($('#results').innerHTML = '');
  try {
    const results = await StoryAPI.stories({ query, to: 4 });
    $('#results').innerHTML = results.length ? results.map(story => `
      <a class="result" href="#story/${encodeURIComponent(story.slug)}">
        <img src="${img(story)}" alt="">
        <span><b>${esc(story.title)}</b><small>${esc(story.author)}</small></span>
      </a>
    `).join('') : empty('No matches', 'Try another title or subtitle.');
  } catch (error) {
    $('#results').innerHTML = empty('Search unavailable', 'Please try again.');
  }
}, 250);

overlay.onclick = event => { if (event.target === overlay) { overlay.classList.remove('open'); syncChromeIcons(); } };

$('#bell').onclick = async () => {
  if (!session) return location.hash = 'auth/signin';
  try {
    $('#notifications').classList.toggle('open');
    syncChromeIcons();
    const items = await StoryAPI.notifications();
    $('#notificationList').innerHTML = items.length
      ? items.map(notification => `
          <div class="notice">
            ${avatarMarkup(notification.actor_avatar_url || notification.actor?.avatar_url, (notification.actor_name || notification.actor?.display_name)?.[0] || 'S')}
            <p>
              <b>${esc(notification.message || notification.kind)}</b>
              <small>${new Date(notification.created_at).toLocaleString()}</small>
            </p>
          </div>
        `).join('')
      : empty('All caught up', 'No notifications.');
  } catch (error) {
    authFail(error);
  }
};

$('#markRead').onclick = async () => {
  try {
    await StoryAPI.markNotificationsRead();
    toast('Notifications marked read');
  } catch (error) {
    authFail(error);
  }
};

$('#theme').onclick = () => toggleTheme();
$('#navAvatar').onclick = () => { location.hash = session ? 'profile' : 'auth/signin'; };
if (localStorage.theme === 'light') document.body.classList.add('light');
syncChromeIcons();

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    overlay.classList.remove('open');
    closeHelpModal();
    closeDonationModal();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    $('.saveDraft')?.click();
  }
});

addEventListener('hashchange', () => {
  overlay.classList.remove('open');
  closeDonationModal();
  closeHelpModal();
  $('#notifications').classList.remove('open');
  route();
});
addEventListener('visibilitychange', () => {
  if (document.hidden) saveEditorBackup();
});
addEventListener('pagehide', saveEditorBackup);
addEventListener('beforeunload', saveEditorBackup);

addEventListener('scroll', () => {
  const header = $('#header');
  header.classList.toggle('scrolled', scrollY > 30);

  const doc = document.documentElement;
  const total = doc.scrollHeight - doc.clientHeight;
  $('#progress').style.width = `${total > 0 ? scrollY / total * 100 : 0}%`;

  if (currentStory && location.hash.startsWith('#story/')) {
    clearTimeout(readTimer);
    readTimer = setTimeout(() => {
      StoryAPI.markRead(currentStory.id, Math.min(100, Math.round(total > 0 ? scrollY / total * 100 : 0)));
    }, 800);
  }
}, { passive: true });

(async () => {
  if (StoryAPI.configured) {
    session = await StoryAPI.session();
    accountRole = session ? ((await StoryAPI.profile())?.role || 'reader') : 'guest';
    await refresh();
    adminMode = session ? await StoryAPI.isAdmin() : false;
    syncRoleNavigation();
    await syncNavbarAvatar();
    StoryAPI.onAuthChange(async (nextSession, event) => {
      const previousUserId = session?.user?.id || null;
      const nextUserId = nextSession?.user?.id || null;
      session = nextSession;
      accountRole = nextSession ? ((await StoryAPI.profile())?.role || 'reader') : 'guest';
      adminMode = nextSession ? await StoryAPI.isAdmin() : false;
      syncRoleNavigation();
      await syncNavbarAvatar();
      if (event === 'PASSWORD_RECOVERY') {
        location.hash = 'reset-password';
        return;
      }
      // Supabase may emit SIGNED_IN/TOKEN_REFRESHED when a tab becomes active again.
      // Do not re-render the SPA for the same user, because that interrupts writing.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_IN' && previousUserId === nextUserId) return;
      route();
    });
  }

  if (!StoryAPI.configured) await syncNavbarAvatar();
  route();
})();
