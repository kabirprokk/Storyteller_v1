(function () {
  const cfg = window.STORYTELLER_CONFIG;
  const configured = cfg && cfg.supabasePublishableKey && !cfg.supabasePublishableKey.startsWith('PASTE_');
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const required = () => { if (!client) throw new Error('Add the Supabase publishable key in js/config.js'); return client; };
  const slugify = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  const wordsToMinutes = html => Math.max(1, Math.ceil(html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 220));
  const normalize = row => ({
    id: row.id, slug: row.slug, title: row.title, desc: row.subtitle || '',
    author: row.profiles?.display_name || 'Unknown writer', ini: (row.profiles?.display_name || 'ST').split(/\s+/).map(x => x[0]).slice(0,2).join('').toUpperCase(),
    authorId: row.author_id, username: row.profiles?.username, cat: row.categories?.name || 'Uncategorized',
    categoryId: row.category_id, time: `${row.reading_minutes || 1} min read`, likes: row.likes?.[0]?.count || 0,
    views: row.view_count || 0, date: row.published_at ? new Date(row.published_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : 'Draft',
    cover: row.cover_url || 'assets/hero.png', content: row.content_html, tags: row.tags || [], status: row.status, featured: row.is_featured
  });
  const storySelect = 'id,slug,title,subtitle,content_html,cover_url,tags,status,is_featured,reading_minutes,view_count,published_at,created_at,author_id,category_id,profiles!stories_author_id_fkey(display_name,username,avatar_url),categories(name,slug),likes(count)';

  window.StoryAPI = {
    client, configured,
    async session() { if (!client) return null; const {data} = await client.auth.getSession(); return data.session; },
    onAuthChange(fn) { return client?.auth.onAuthStateChange((_event, session) => fn(session)); },
    async signUp(email,password,displayName) { const {data,error}=await required().auth.signUp({email,password,options:{data:{display_name:displayName,username:slugify(displayName).replace(/-[^-]+$/,'')}}}); if(error)throw error; return data; },
    async signIn(email,password) { const {data,error}=await required().auth.signInWithPassword({email,password}); if(error)throw error; return data; },
    async social(provider) { const {error}=await required().auth.signInWithOAuth({provider,options:{redirectTo:location.href.split('#')[0]}}); if(error)throw error; },
    async resetPassword(email) { const {error}=await required().auth.resetPasswordForEmail(email,{redirectTo:location.href.split('#')[0]+'#auth'}); if(error)throw error; },
    async signOut() { const {error}=await required().auth.signOut(); if(error)throw error; },
    async categories() { const {data,error}=await required().from('categories').select('*').order('name'); if(error)throw error; return data; },
    async stories({category,query,sort='latest',from=0,to=11}={}) { let q=required().from('stories').select(storySelect).eq('status','published').range(from,to); if(category)q=q.eq('category_id',category); if(query)q=q.or(`title.ilike.%${query.replace(/[%_,()]/g,'')}%,subtitle.ilike.%${query.replace(/[%_,()]/g,'')}%`); q=sort==='views'?q.order('view_count',{ascending:false}):sort==='liked'?q.order('published_at',{ascending:false}):q.order('published_at',{ascending:false}); const {data,error}=await q; if(error)throw error; return data.map(normalize); },
    async story(slug) { const {data,error}=await required().from('stories').select(storySelect).eq('slug',slug).single(); if(error)throw error; return normalize(data); },
    async saveStory(input,publish=false) { const session=await this.session(); if(!session)throw new Error('Sign in to save a story'); const payload={author_id:session.user.id,title:input.title.trim(),subtitle:input.subtitle.trim(),content_html:input.content,category_id:input.category||null,tags:input.tags,cover_url:input.cover||null,reading_minutes:wordsToMinutes(input.content),status:publish?'published':'draft',published_at:publish?new Date().toISOString():null}; if(input.id){const {data,error}=await required().from('stories').update(payload).eq('id',input.id).select().single();if(error)throw error;return data;} payload.slug=slugify(input.title);const {data,error}=await required().from('stories').insert(payload).select().single();if(error)throw error;return data; },
    async uploadCover(file) { const session=await this.session(); if(!session)throw new Error('Sign in to upload'); if(file.size>5*1024*1024)throw new Error('Cover must be under 5 MB'); const ext=file.name.split('.').pop().toLowerCase(); const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`; const {error}=await required().storage.from('story-covers').upload(path,file,{cacheControl:'31536000',upsert:false});if(error)throw error;return required().storage.from('story-covers').getPublicUrl(path).data.publicUrl; },
    async toggle(table,storyId) { const session=await this.session(); if(!session)throw new Error('Sign in first'); const key={user_id:session.user.id,story_id:storyId}; const {data}=await required().from(table).select('story_id').match(key).maybeSingle(); if(data){const {error}=await required().from(table).delete().match(key);if(error)throw error;return false;} const {error}=await required().from(table).insert(key);if(error)throw error;return true; },
    async comments(storyId) { const {data,error}=await required().from('comments').select('id,body,created_at,profiles(display_name,username,avatar_url)').eq('story_id',storyId).eq('is_hidden',false).order('created_at',{ascending:false});if(error)throw error;return data; },
    async comment(storyId,body) { const session=await this.session();if(!session)throw new Error('Sign in to comment');const {error}=await required().from('comments').insert({story_id:storyId,user_id:session.user.id,body});if(error)throw error; },
    async notifications() { const session=await this.session();if(!session)return[];const {data,error}=await required().from('notifications').select('*,actor:profiles!notifications_actor_id_fkey(display_name,avatar_url)').order('created_at',{ascending:false}).limit(20);if(error)throw error;return data; },
    async profile() { const session=await this.session();if(!session)return null;const {data,error}=await required().from('profiles').select('*').eq('id',session.user.id).single();if(error)throw error;return data; },
    async myStories(status) { const session=await this.session();if(!session)return[];let q=required().from('stories').select(storySelect).eq('author_id',session.user.id).order('updated_at',{ascending:false});if(status)q=q.eq('status',status);const {data,error}=await q;if(error)throw error;return data.map(normalize); },
    async view(storyId) { await required().rpc('increment_story_view',{target:storyId}); },
    async markRead(storyId,progress) { const session=await this.session();if(!session)return;await required().from('reading_history').upsert({user_id:session.user.id,story_id:storyId,progress,last_read_at:new Date().toISOString()}); }
  };
})();
