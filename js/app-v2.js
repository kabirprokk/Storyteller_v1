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
const logo = 'assets/storyteller-mark.png';
const brand = `<img class="brand-mark" src="${logo}" alt="" aria-hidden="true"><span>STORYTELLER</span>`;
const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
  bell: '<svg class="lucide lucide-bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>',
  theme: '<svg class="lucide lucide-sun-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2" /><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" /><path d="M16 12a4 4 0 0 0-4-4" /><path d="m19 5-1.256 1.256" /><path d="M20 12h2" /></svg>',
  heart: '<svg class="lucide lucide-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /></svg>',
  bookmark: '<svg class="lucide lucide-bookmark" viewBox="0 0 24 24" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>',
  share: '<svg class="lucide lucide-arrow-up-right" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>',
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

const stripHtml = value => String(value ?? '').replace(/<[^>]*>/g, ' ');
const words = value => String(value ?? '').trim().split(/\s+/).filter(Boolean).length;
const img = story => esc(story?.cover || 'assets/hero.png');

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

const sanitizeStoryHtml = html => DOMPurify.sanitize(html || '<p></p>', {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
});

function editorPreview() {
  const box = $('#storyPreview');
  if (!box) return;

  const title = $('#storyTitle')?.value.trim() || 'Untitled Story';
  const subtitle = $('#storySubtitle')?.value.trim();
  const content = sanitizeStoryHtml($('#storyContent')?.innerHTML || '<p></p>');
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
      <div class="preview-copy">${content}</div>
      ${tags.length ? `<div class="chips preview-tags">${tags.map(tag => `<span class="chip">${esc(tag)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function editorStats() {
  const meta = $('#editorStats');
  if (!meta) return;

  const title = $('#storyTitle')?.value.trim() || '';
  const subtitle = $('#storySubtitle')?.value.trim() || '';
  const body = $('#storyContent')?.innerText || '';
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
  if ($('#storyContent')) $('#storyContent').innerHTML = data.content;

  $('#saveState') && ($('#saveState').textContent = 'Unsaved');
  editorStats();
  toast(`Imported ${file.name}`);
}

const card = story => `
  <article class="story reveal">
    <div class="cover">
      <img src="${img(story)}" loading="lazy" alt="">
      <span class="pill">${esc(story.cat)}</span>
      <button class="save icon-btn" data-id="${story.id}" aria-label="Bookmark">${icons.bookmark}</button>
    </div>
    <h3><a href="#story/${encodeURIComponent(story.slug)}">${esc(story.title)}</a></h3>
    <p>${esc(story.desc)}</p>
    <div class="between meta">
      <span class="author"><i class="avatar peach">${esc(story.ini)}</i>${esc(story.author)}</span>
      <span>${esc(story.time)} · Like ${story.likes}</span>
    </div>
  </article>
`;

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
        </div>
        <div>
          <h5>DISCOVER</h5>
          <a href="#explore">Explore</a>
          <a href="#explore">Trending</a>
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
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
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
                  <span class="author"><i class="avatar peach">${esc(featured.ini)}</i>${esc(featured.author)}</span>
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

  const content = sanitizeStoryHtml(story.content || '');
  const isPublished = story.status === 'published';
  const index = stories.findIndex(item => item.slug === story.slug);
  const prev = index > 0 ? stories[index - 1] : null;
  const next = index >= 0 && index < stories.length - 1 ? stories[index + 1] : null;
  const related = stories
    .filter(item => item.id !== story.id && (item.categoryId === story.categoryId || item.tags.some(tag => (story.tags || []).includes(tag))))
    .slice(0, 3);

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
          <span class="avatar peach">${esc(story.ini)}</span>
          <div>
            <b>${esc(story.author)}</b>
            <div class="meta">${esc(story.date)} · ${esc(story.time)} · ${story.views} views</div>
          </div>
          <div class="author-actions">
            ${session && session.user.id === story.authorId
              ? '<span class="btn disabled">Your story</span>'
              : `<button class="btn followAuthor" data-id="${story.authorId}">Follow</button>`}
            ${isPublished ? '<button class="btn reportStory">Report</button>' : '<span class="btn disabled">Private draft</span>'}
          </div>
        </div>
      </div>

      <div class="reader-tools">
        <button class="like icon-btn" data-id="${story.id}" aria-label="Like">${icons.heart}</button>
        <button class="bookmark icon-btn" data-id="${story.id}" aria-label="Bookmark">${icons.bookmark}</button>
        <button id="font" class="icon-btn" aria-label="Adjust font size"><span>Aa</span></button>
        <button id="readerMode" class="icon-btn" aria-label="Toggle reading mode">${icons.theme}</button>
        <button class="share icon-btn" aria-label="Share story">${icons.share}</button>
      </div>

      <div class="reader-body">${content}
        <div class="reader-end">
          <span class="eyebrow">The end</span>
          <h2>Did this story move you?</h2>
          <button class="btn primary like" data-id="${story.id}"><span class="btn-icon">${icons.heart}</span><span>Appreciate · ${story.likes}</span></button>
          <div class="story-nav">
            ${prev ? `<a class="btn" href="#story/${prev.slug}">Previous story</a>` : '<span class="btn disabled">Previous story</span>'}
            ${next ? `<a class="btn" href="#story/${next.slug}">Next story</a>` : '<span class="btn disabled">Next story</span>'}
          </div>
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
          <textarea id="commentBody" maxlength="2000" placeholder="Leave a thoughtful response..."></textarea>
          <button class="btn primary" id="comment">Post comment</button>
        ` : empty('Comments locked', 'Publish this draft to start a conversation.')}
      </div>
    </article>
  `;
}

function write(story = null) {
  if (!session) return auth('signin', 'Sign in to write and publish.');

  editingStory = story;
  draftId = story?.id || null;

  const initialCount = editorWordCount(story?.title || '', story?.desc || '', story?.content || '');
  const initialMinutes = Math.max(1, Math.ceil(initialCount / 220));
  const initialContent = story?.content ? sanitizeStoryHtml(story.content) : '<p>Tell your story...</p>';

  return `
    <div class="page editor">
      <div class="editor-top">
        <div>
          <span class="eyebrow">${story ? 'Edit story' : 'New story'}</span>
          <small id="saveState">${story ? 'Saved draft' : 'Draft not saved'}</small>
          <small id="editorStats">${initialCount.toLocaleString()} words · ${initialMinutes} min read</small>
        </div>
        <div class="buttons editor-tools">
          ${story ? '<button class="btn danger deleteOwnStory">Delete</button>' : ''}
          <button class="btn" id="previewToggle" type="button">Preview</button>
          <button class="btn" id="importTxt" type="button">Import .txt</button>
          <input id="storyTxt" type="file" accept=".txt,text/plain" hidden>
          <button class="btn saveDraft" type="button">Save draft</button>
          <button class="btn primary publish" type="button">Publish</button>
        </div>
      </div>
      <p class="editor-note">Upload a plain text story file, refine the layout below, and publish when it is ready.</p>
      <input class="title-input" id="storyTitle" maxlength="160" value="${esc(story?.title || '')}" placeholder="Your story begins with a title...">
      <input class="subtitle-input" id="storySubtitle" maxlength="300" value="${esc(story?.desc || '')}" placeholder="Add a compelling subtitle">
      <div class="editor-bar">
        <button data-cmd="bold"><b>B</b></button>
        <button data-cmd="italic"><i>I</i></button>
        <button data-cmd="formatBlock">Quote</button>
        <button data-cmd="insertUnorderedList">List</button>
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
            ${categories.map(category => `<option value="${category.id}" ${String(story?.categoryId) === String(category.id) ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Tags</label>
          <input id="storyTags" value="${esc((story?.tags || []).join(', '))}" placeholder="memory, travel, life">
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
  const signup = mode === 'signup';
  return `
    <div class="page auth-wrap">
      <form class="auth-card">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">${signup ? 'Join us' : 'Welcome back'}</span>
        <h1>${signup ? 'Tell your story.' : 'Continue your story.'}</h1>
        <p>${esc(msg || 'Read, write, save, and join the conversation.')}</p>
        <button type="button" class="social" data-provider="google">Continue with Google</button>
        <button type="button" class="social" data-provider="github">Continue with GitHub</button>
        <div class="divider">or use email</div>
        ${signup ? '<div class="field"><label>Display name</label><input id="authName" required maxlength="80"></div>' : ''}
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

  const mine = tab === 'published' ? await StoryAPI.myStories('published') : await StoryAPI.library(tab);
  const items = mine.map(story => {
    if (tab === 'drafts') {
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
            <span class="eyebrow">Writer profile</span>
            <h1 class="page-title">${esc(me.display_name)}</h1>
            <p class="subtitle">${esc(me.bio || 'Your story is still being written.')}</p>
            <p class="meta">@${esc(me.username)} · ${esc(me.role)}</p>
            <div class="buttons">
              <button class="btn editProfile">Edit profile</button>
              ${adminMode ? '<a class="btn" href="#admin">Admin console</a>' : ''}
              <button class="btn signOut">Sign out</button>
            </div>
          </div>
        </div>
      </section>

      <div class="profile-editor container" hidden>
        <div class="field"><label>Display name</label><input id="profileName" maxlength="80" value="${esc(me.display_name)}"></div>
        <div class="field"><label>Username</label><input id="profileUsername" maxlength="30" value="${esc(me.username)}"></div>
        <div class="field"><label>Bio</label><textarea id="profileBio" maxlength="500">${esc(me.bio)}</textarea></div>
        <div class="field"><label>Avatar</label><input id="profileAvatar" type="file" accept="image/jpeg,image/png,image/webp"></div>
        <button class="btn primary saveProfile">Save profile</button>
      </div>

      <section>
        <div class="container">
          <div class="chips profile-tabs">
            ${[['published', 'Published'], ['drafts', 'Drafts'], ['liked', 'Liked'], ['bookmarks', 'Bookmarks'], ['history', 'History']]
              .map(item => `<a class="chip ${tab === item[0] ? 'active' : ''}" href="#profile/${item[0]}">${item[1]}</a>`).join('')}
          </div>
          <div class="grid profile-grid">${items || empty('Nothing here yet', tab === 'drafts' ? 'Your saved drafts appear here.' : 'Your library will grow as you read.')}</div>
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

function legal(kind) {
  const privacy = kind === 'privacy';
  return `
    <div class="page legal">
      <div class="legal-copy">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">${privacy ? 'Privacy' : 'Terms'}</span>
        <h1>${privacy ? 'Your stories. Your data.' : 'A thoughtful community.'}</h1>
        <p>Last updated July 21, 2026</p>
        ${privacy ? `
          <h2>What we collect</h2>
          <p>We store account details, profile information, stories, comments, reactions, bookmarks and reading history needed to operate STORYTELLER. Google sign-in supplies your basic profile and email; we do not receive your Google password.</p>
          <h2>How we use information</h2>
          <p>Information is used to authenticate you, publish your work, personalize your library, moderate the community and secure the service. We do not sell personal information.</p>
          <h2>Your choices</h2>
          <p>You may edit your profile and delete your content. Contact the site administrator to request complete account deletion.</p>
          <h2>Service providers</h2>
          <p>Supabase provides authentication, database and storage infrastructure. GitHub Pages hosts the website.</p>
        ` : `
          <h2>Publish responsibly</h2>
          <p>You retain ownership of your writing and grant STORYTELLER permission to display content you publish. Do not post illegal, abusive, plagiarized or privacy-violating material.</p>
          <h2>Moderation</h2>
          <p>Administrators may hide or remove content, suspend accounts and act on reports to protect the community.</p>
          <h2>Accounts</h2>
          <p>Keep your account secure and provide accurate information. You are responsible for activity performed through your account.</p>
          <h2>Availability</h2>
          <p>The service may change as it develops. We aim for reliability but cannot guarantee uninterrupted availability.</p>
        `}
        <p>Questions can be directed to the project administrator.</p>
      </div>
      ${footer()}
    </div>
  `;
}

async function admin() {
  if (!adminMode) return `<div class="page auth-wrap">${empty('Access denied', 'This area is reserved for administrators.')}</div>`;

  const [metrics, storiesData, commentsData, usersData, reportsData] = await Promise.all([
    StoryAPI.adminMetrics(),
    StoryAPI.adminStories(),
    StoryAPI.adminComments(),
    StoryAPI.adminUsers(),
    StoryAPI.adminReports(),
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
    <div class="control-row">
      <div>
        <b>${esc(user.display_name)}</b>
        <small>@${esc(user.username)} · ${esc(user.role)}</small>
      </div>
      <div class="row-actions">
        <button data-admin="role" data-id="${user.id}" data-value="${user.role === 'admin' ? 'writer' : 'admin'}">Make ${user.role === 'admin' ? 'writer' : 'admin'}</button>
        <button data-admin="suspend" data-id="${user.id}" data-value="${!user.is_suspended}">${user.is_suspended ? 'Restore' : 'Suspend'}</button>
        <button class="danger" data-admin="delete-user" data-id="${user.id}">Delete</button>
      </div>
    </div>
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

  const reportRows = reportsData.map(report => `
    <div class="control-row">
      <div>
        <b>${esc(report.reason)}</b>
        <small>${esc(report.profiles?.display_name)} · ${esc(report.status)}</small>
      </div>
      <button data-admin="resolve" data-id="${report.id}">Resolve</button>
    </div>
  `).join('');

  return `
    <div class="page admin-shell">
      <aside class="admin-side">
        <a class="brand" href="#home">${brand}</a>
        <span class="eyebrow">Control room</span>
        <a href="#admin">Overview</a>
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
      currentStory = await StoryAPI.story(decodeURIComponent(arg || ''));
      if (currentStory.status === 'published') await StoryAPI.view(currentStory.id).catch(() => {});
      $('#app').innerHTML = reader(currentStory);
    } else if (page === 'explore') {
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
    } else if (page === 'privacy' || page === 'terms') {
      $('#app').innerHTML = legal(page);
    } else {
      await refresh();
      $('#app').innerHTML = home();
    }

    scrollTo(0, 0);
    bind();

    if (page === 'story' && currentStory.status === 'published') {
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
  const content = $('#storyContent').innerHTML;
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

  const record = await StoryAPI.saveStory(payload, publish);
  draftId = record.id;
  editingStory = { ...(editingStory || {}), ...record, cover };

  if ($('#saveState')) $('#saveState').textContent = publish ? 'Published' : 'Draft saved';
  toast(publish ? 'Story published' : 'Draft saved');

  if (publish) {
    await refresh();
    location.hash = `story/${record.slug}`;
  } else {
    editorStats();
  }
}

async function loadComments() {
  const rows = await StoryAPI.comments(currentStory.id);
  $('#commentList').innerHTML = rows.length
    ? rows.map(comment => `
        <div class="notice">
          <span class="avatar">${esc(comment.profiles.display_name[0])}</span>
          <p>
            <b>${esc(comment.profiles.display_name)}</b>
            <small>${new Date(comment.created_at).toLocaleDateString()}</small>
            <span>${esc(comment.body)}</span>
          </p>
        </div>
      `).join('')
    : empty('No comments yet', 'Start the conversation.');
}

function bind() {
  startHeroRotation();
  requestAnimationFrame(() => $$('.reveal').forEach(card => card.classList.add('seen')));

  $$('.save,.bookmark').forEach(button => {
    button.onclick = async event => {
      event.preventDefault();
      try {
        toast(await StoryAPI.toggle('bookmarks', button.dataset.id) ? 'Saved' : 'Bookmark removed');
      } catch (error) {
        authFail(error);
      }
    };
  });

  $$('.like').forEach(button => {
    button.onclick = async () => {
      try {
        toast(await StoryAPI.toggle('likes', button.dataset.id) ? 'Story appreciated' : 'Like removed');
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
      const targetId = button?.dataset.id;
      if (!targetId) return toast('Writer not available');
      if (session && session.user.id === targetId) return toast('You cannot follow yourself');
      const following = await StoryAPI.follow(targetId);
      if (button) button.textContent = following ? 'Following' : 'Follow';
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

  $$('.editor-bar [data-cmd]').forEach(button => {
    button.onclick = () => document.execCommand(button.dataset.cmd, false, button.dataset.cmd === 'formatBlock' ? 'blockquote' : null);
  });

  $$('#storyTitle,#storySubtitle,#storyTags,#storyContent').forEach(node => {
    node?.addEventListener('input', () => {
      clearTimeout(timer);
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
    const file = [...(event.dataTransfer?.files || [])].find(item => /\.txt$/i.test(item.name) || item.type === 'text/plain');
    if (!file) return;
    event.preventDefault();
    await importTxtStory(file);
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

  $('#font')?.addEventListener('click', () => $('.reader-body')?.classList.toggle('reader-large'));
  $('#readerMode')?.addEventListener('click', () => toggleTheme());
  $('.share')?.addEventListener('click', () => {
    if (navigator.share) navigator.share({ title: currentStory.title, url: location.href });
    else navigator.clipboard.writeText(location.href).then(() => toast('Link copied'));
  });

  $('.auth-card:not(.resetForm)')?.addEventListener('submit', handleAuth);
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
  $('.saveProfile')?.addEventListener('click', saveProfile);
  $('.signOut')?.addEventListener('click', async () => {
    await StoryAPI.signOut();
    location.hash = 'home';
  });

  $$('[data-admin]').forEach(button => button.onclick = () => adminAction(button));
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

async function saveProfile() {
  try {
    let avatar = null;
    const file = $('#profileAvatar').files[0];
    if (file) avatar = await StoryAPI.uploadAvatar(file);

    await StoryAPI.updateProfile({
      display_name: $('#profileName').value.trim(),
      username: $('#profileUsername').value.trim().toLowerCase(),
      bio: $('#profileBio').value.trim(),
      ...(avatar && { avatar_url: avatar }),
    });

    toast('Profile updated');
    route();
  } catch (error) {
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
      const data = await StoryAPI.signUp($('#authEmail').value, $('#authPassword').value, $('#authName').value);
      toast(data.session ? 'Account created' : 'Verify your email');
    } else {
      await StoryAPI.signIn($('#authEmail').value, $('#authPassword').value);
    }
    session = await StoryAPI.session();
    location.hash = 'home';
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
  [categories, stories] = await Promise.all([
    StoryAPI.categories(),
    StoryAPI.stories({ to: 23 }),
  ]);
}

function toggleTheme(force) {
  if (force === 'light') document.body.classList.add('light');
  else if (force === 'dark') document.body.classList.remove('light');
  else document.body.classList.toggle('light');
  localStorage.theme = document.body.classList.contains('light') ? 'light' : 'dark';
  syncChromeIcons();
}

function syncChromeIcons() {
  $('#searchBtn') && ($('#searchBtn').innerHTML = icons.search);
  $('#bell') && ($('#bell').innerHTML = `${icons.bell}<i></i>`);
  $('#theme') && ($('#theme').innerHTML = icons.theme);
}

function authFail(error) {
  console.error(error);
  const message = /provider is not enabled/i.test(error.message || '')
    ? 'That social login is not enabled yet. Use email and password for now.'
    : error.message;
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
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

const overlay = $('#search');
$('#searchBtn').onclick = () => {
  overlay.classList.add('open');
  $('#searchInput').focus();
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

overlay.onclick = event => event.target === overlay && overlay.classList.remove('open');

$('#bell').onclick = async () => {
  if (!session) return location.hash = 'auth/signin';
  try {
    $('#notifications').classList.toggle('open');
    const items = await StoryAPI.notifications();
    $('#notificationList').innerHTML = items.length
      ? items.map(notification => `
          <div class="notice">
            <span class="avatar">${esc(notification.actor?.display_name?.[0] || 'S')}</span>
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
if (localStorage.theme === 'light') document.body.classList.add('light');
syncChromeIcons();

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') overlay.classList.remove('open');
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    $('.saveDraft')?.click();
  }
});

addEventListener('hashchange', () => {
  overlay.classList.remove('open');
  $('#notifications').classList.remove('open');
  route();
});
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
    await refresh();
    adminMode = session ? await StoryAPI.isAdmin() : false;
    StoryAPI.onAuthChange(async (nextSession, event) => {
      session = nextSession;
      adminMode = nextSession ? await StoryAPI.isAdmin() : false;
      if (event === 'PASSWORD_RECOVERY') location.hash = 'reset-password';
      route();
    });
  }

  route();
})();
