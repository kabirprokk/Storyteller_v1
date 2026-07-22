(function () {
  const cfg = window.STORYTELLER_CONFIG;
  const configured = cfg && cfg.supabasePublishableKey && !cfg.supabasePublishableKey.startsWith('PASTE_');
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const required = () => { if (!client) throw new Error('Add the Supabase publishable key in js/config.js'); return client; };
  let hardenedSchema = null;
  const isHardened = async () => {
    if (hardenedSchema !== null) return hardenedSchema;
    const {error} = await required().from('public_story_feed').select('id').limit(0);
    hardenedSchema = !error;
    return hardenedSchema;
  };
  const slugify = value => {
    const base = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'story';
    return `${base}-${Date.now().toString(36)}`;
  };
  const usernameFromName = value => {
    const base = String(value || '').toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 21);
    return `${base || 'writer'}_${crypto.randomUUID().slice(0, 8)}`;
  };
  const wordsToMinutes = html => Math.max(1, Math.ceil(html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 220));
  const normalize = row => ({
    id: row.id, slug: row.slug, title: row.title, desc: row.subtitle || '',
    author: row.author_name || row.profiles?.display_name || 'Unknown writer', ini: (row.author_name || row.profiles?.display_name || 'ST').split(/\s+/).map(x => x[0]).slice(0,2).join('').toUpperCase(),
    authorId: row.author_id, username: row.author_username || row.profiles?.username, authorAvatar: row.author_avatar_url || row.profiles?.avatar_url || '', cat: row.category_name || row.categories?.name || 'Uncategorized',
    categoryId: row.category_id, time: `${row.reading_minutes || 1} min read`, likes: row.likes?.[0]?.count || row.like_count || 0,
    views: row.view_count || 0, date: row.published_at ? new Date(row.published_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : 'Draft',
    publishedAt: row.published_at || null,
    cover: row.cover_url || 'assets/hero.png', content: row.content_html, tags: row.tags || [], status: row.status, featured: row.is_featured,
    isOwn: row.is_own ?? false
  });
  const storySelect = 'id,slug,title,subtitle,content_html,cover_url,tags,status,is_featured,reading_minutes,view_count,published_at,created_at,author_id,category_id,profiles!stories_author_id_fkey(display_name,username,avatar_url),categories(name,slug),likes(count)';

  window.StoryAPI = {
    client, configured,
    async session() { if (!client) return null; const {data} = await client.auth.getSession(); return data.session; },
    onAuthChange(fn) { return client?.auth.onAuthStateChange((event, session) => fn(session,event)); },
    async signUp(email,password,displayName) { const {data,error}=await required().auth.signUp({email,password,options:{data:{display_name:displayName.trim(),username:usernameFromName(displayName)}}}); if(error)throw error; return data; },
    async signIn(email,password) { const {data,error}=await required().auth.signInWithPassword({email,password}); if(error)throw error; return data; },
    async social(provider) { const {error}=await required().auth.signInWithOAuth({provider,options:{redirectTo:location.href.split('#')[0]}}); if(error)throw error; },
    async resetPassword(email) { const {error}=await required().auth.resetPasswordForEmail(email,{redirectTo:location.href.split('#')[0]}); if(error)throw error; },
    async signOut() { const {error}=await required().auth.signOut(); if(error)throw error; },
    async updatePassword(password) { const {data,error}=await required().auth.updateUser({password});if(error)throw error;return data; },
    async categories() { const {data,error}=await required().from('categories').select('*').order('name'); if(error)throw error; return data; },
    async stories({category,query,sort='latest',from=0,to=11}={}) {
      let q=(await isHardened())
        ? required().from('public_story_feed').select('*')
        : required().from('stories').select(storySelect).eq('status','published');
      if(category)q=q.eq('category_id',category);
      if(query){const safe=query.replace(/[%_,()]/g,'').trim();if(safe)q=q.or(`title.ilike.%${safe}%,subtitle.ilike.%${safe}%`);}
      q=sort==='views'?q.order('view_count',{ascending:false}):q.order('published_at',{ascending:false});
      q=q.range(sort==='liked'?0:from,sort==='liked'?999:to);
      const {data,error}=await q;
      if(error)throw error;
      const rows=data.map(normalize);
      return sort==='liked'?rows.sort((a,b)=>b.likes-a.likes||new Date(b.publishedAt||0)-new Date(a.publishedAt||0)).slice(from,to+1):rows;
    },
    async story(slug) { const source=(await isHardened())?required().from('public_story_feed').select('*'):required().from('stories').select(storySelect);const {data,error}=await source.eq('slug',slug).single();if(error)throw error;return normalize(data); },
    async saveStory(input,publish=false) {
      const session=await this.session();
      if(!session)throw new Error('Sign in to save a story');
      const wasPublished = input.currentStatus === 'published';
      const status = publish || wasPublished ? 'published' : 'draft';
      const payload={author_id:session.user.id,title:input.title.trim(),subtitle:input.subtitle.trim(),content_html:input.content,category_id:input.category||null,tags:input.tags,cover_url:input.cover||null,reading_minutes:wordsToMinutes(input.content),status,published_at:status==='published'?(input.publishedAt||new Date().toISOString()):null};
      if(input.id){const {data,error}=await required().from('stories').update(payload).eq('id',input.id).eq('author_id',session.user.id).select().single();if(error)throw error;return data;}
      payload.slug=slugify(input.title);const {data,error}=await required().from('stories').insert(payload).select().single();if(error)throw error;return data;
    },
    async uploadCover(file) { const session=await this.session(); if(!session)throw new Error('Sign in to upload'); if(file.size>5*1024*1024)throw new Error('Cover must be under 5 MB'); const ext=file.name.split('.').pop().toLowerCase(); const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`; const {error}=await required().storage.from('story-covers').upload(path,file,{cacheControl:'31536000',upsert:false});if(error)throw error;return required().storage.from('story-covers').getPublicUrl(path).data.publicUrl; },
    async reactionState() { const session=await this.session();if(!session)return {likes:[],bookmarks:[]};const [likes,bookmarks]=await Promise.all([required().from('likes').select('story_id').eq('user_id',session.user.id),required().from('bookmarks').select('story_id').eq('user_id',session.user.id)]);if(likes.error)throw likes.error;if(bookmarks.error)throw bookmarks.error;return {likes:likes.data.map(row=>row.story_id),bookmarks:bookmarks.data.map(row=>row.story_id)}; },
    async toggle(table,storyId) { const session=await this.session(); if(!session)throw new Error('Sign in first'); const key={user_id:session.user.id,story_id:storyId}; const {data}=await required().from(table).select('story_id').match(key).maybeSingle(); if(data){const {error}=await required().from(table).delete().match(key);if(error)throw error;return false;} const {error}=await required().from(table).insert(key);if(error)throw error;return true; },
    async comments(storyId) { const q=(await isHardened())?required().from('public_comments').select('*'):required().from('comments').select('id,body,created_at,profiles(display_name,username,avatar_url)').eq('is_hidden',false);const {data,error}=await q.eq('story_id',storyId).order('created_at',{ascending:false});if(error)throw error;return data; },
    async comment(storyId,body) { const session=await this.session();if(!session)throw new Error('Sign in to comment');const {error}=await required().from('comments').insert({story_id:storyId,user_id:session.user.id,body});if(error)throw error; },
    async notifications() { const session=await this.session();if(!session)return[];const q=(await isHardened())?required().from('my_notifications').select('*'):required().from('notifications').select('*,actor:profiles!notifications_actor_id_fkey(display_name,avatar_url)');const {data,error}=await q.order('created_at',{ascending:false}).limit(20);if(error)throw error;return data; },
    async markNotificationsRead() { const session=await this.session();if(!session)return;const {error}=await required().from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',session.user.id).is('read_at',null);if(error)throw error; },
    async profile() { const session=await this.session();if(!session)return null;const {data,error}=await required().from('profiles').select('*').eq('id',session.user.id).single();if(error)throw error;return data; },
    async updateProfile(changes) { const session=await this.session();if(!session)throw new Error('Sign in first');const {data,error}=await required().from('profiles').update(changes).eq('id',session.user.id).select().single();if(error)throw error;return data; },
    async uploadAvatar(file) { const session=await this.session();if(!session)throw new Error('Sign in first');if(file.size>2*1024*1024)throw new Error('Avatar must be under 2 MB');const ext=file.name.split('.').pop().toLowerCase();const path=`${session.user.id}/avatar-${Date.now()}.${ext}`;const {error}=await required().storage.from('avatars').upload(path,file,{cacheControl:'3600'});if(error)throw error;return required().storage.from('avatars').getPublicUrl(path).data.publicUrl; },
    async myStories(status) { const session=await this.session();if(!session)return[];let q=required().from('stories').select(storySelect).eq('author_id',session.user.id).order('updated_at',{ascending:false});if(status)q=q.eq('status',status);const {data,error}=await q;if(error)throw error;return data.map(normalize); },
    async storyById(id) { const {data,error}=await required().from('stories').select(storySelect).eq('id',id).single();if(error)throw error;return normalize(data); },
    async deleteMyStory(id) { const {error}=await required().from('stories').delete().eq('id',id);if(error)throw error; },
    async follow(username) {
      if(!username)throw new Error('Missing writer to follow');
      if(await isHardened()){const {data,error}=await required().rpc('toggle_follow',{target_username:username});if(error)throw error;return data;}
      const session=await this.session();if(!session)throw new Error('Sign in first');
      const {data:profile,error:profileError}=await required().from('profiles').select('id').eq('username',username).single();if(profileError)throw profileError;
      const key={follower_id:session.user.id,following_id:profile.id};const {data}=await required().from('follows').select('following_id').match(key).maybeSingle();
      if(data){const {error}=await required().from('follows').delete().match(key);if(error)throw error;return false}const {error}=await required().from('follows').insert(key);if(error)throw error;return true;
    },
    async reportStory(storyId,reason) { const session=await this.session();if(!session)throw new Error('Sign in to report');const {error}=await required().from('reports').insert({reporter_id:session.user.id,story_id:storyId,reason});if(error)throw error; },
    async library(kind) { const session=await this.session();if(!session)return[];if(kind==='drafts')return this.myStories('draft');const table=kind==='liked'?'likes':kind==='history'?'reading_history':'bookmarks';const order=kind==='history'?'last_read_at':'created_at';if(!(await isHardened())){const relation=kind==='history'?'story_id,progress,last_read_at,stories('+storySelect+')':'story_id,created_at,stories('+storySelect+')';const {data,error}=await required().from(table).select(relation).eq('user_id',session.user.id).order(order,{ascending:false}).limit(50);if(error)throw error;return data.filter(x=>x.stories).map(x=>normalize(x.stories));}const {data:links,error:linkError}=await required().from(table).select(`story_id,${order}`).eq('user_id',session.user.id).order(order,{ascending:false}).limit(50);if(linkError)throw linkError;const ids=links.map(x=>x.story_id);if(!ids.length)return[];const {data,error}=await required().from('public_story_feed').select('*').in('id',ids);if(error)throw error;const byId=new Map(data.map(row=>[row.id,normalize(row)]));return ids.map(id=>byId.get(id)).filter(Boolean); },
    async view(storyId) { if(await isHardened()){const {error}=await required().functions.invoke('record-story-view',{body:{storyId}});if(error)throw error;return}await required().rpc('increment_story_view',{target:storyId}); },
    async markRead(storyId,progress) { const session=await this.session();if(!session)return;await required().from('reading_history').upsert({user_id:session.user.id,story_id:storyId,progress,last_read_at:new Date().toISOString()}); },
    async donationConfig() { const {data,error}=await required().from('site_settings').select('value').eq('key','donation_qr').maybeSingle();if(error)return null;return data?.value || null; },
    async adminUploadDonationQr(file) { const session=await this.session();if(!session)throw new Error('Sign in first');if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use a PNG, JPEG, or WebP QR image');if(file.size>3*1024*1024)throw new Error('QR image must be under 3 MB');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`donations/payment-qr-${Date.now()}.${ext}`;const client=required();const upload=await client.storage.from('donation-assets').upload(path,file,{cacheControl:'3600',upsert:false});if(upload.error)throw upload.error;const qr_url=client.storage.from('donation-assets').getPublicUrl(path).data.publicUrl;const {error}=await client.from('site_settings').upsert({key:'donation_qr',value:{qr_url},updated_at:new Date().toISOString()});if(error)throw error;return qr_url; },
    async adminClearDonationQr() { const {error}=await required().from('site_settings').upsert({key:'donation_qr',value:{},updated_at:new Date().toISOString()});if(error)throw error; },
    async isAdmin() { const p=await this.profile();return p?.role==='admin'&&!p?.is_suspended; },
    async adminMetrics() { const {data,error}=await required().rpc('admin_dashboard_metrics');if(error)throw error;return data; },
    async adminStories() { const {data,error}=await required().from('stories').select('id,title,status,is_featured,view_count,created_at,profiles!stories_author_id_fkey(display_name)').order('created_at',{ascending:false}).limit(100);if(error)throw error;return data; },
    async adminComments() { const {data,error}=await required().from('comments').select('id,body,is_hidden,created_at,profiles(display_name),stories(title)').order('created_at',{ascending:false}).limit(100);if(error)throw error;return data; },
    async adminUsers() { const {data,error}=await required().rpc('admin_user_directory');if(!error)return Array.isArray(data)?data:[];const fallback=await required().from('profiles').select('id,username,display_name,bio,avatar_url,role,is_suspended,created_at,updated_at').order('created_at',{ascending:false}).limit(100);if(fallback.error)throw fallback.error;return fallback.data; },
    async adminReports() { const select='id,reason,status,created_at,reporter_id,story_id,comment_id,reporter:profiles!reports_reporter_id_fkey(id,display_name,username,avatar_url),story:stories(id,slug,title,subtitle,cover_url,status,author_id,author:profiles!stories_author_id_fkey(display_name,username)),comment:comments(id,body,is_hidden,story_id,story:stories(id,slug,title))';const {data,error}=await required().from('reports').select(select).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data; },
    async adminUpdate(table,id,changes) { const {error}=await required().from(table).update(changes).eq('id',id);if(error)throw error; },
    async adminSetUser(userId,role=null,suspended=null) { const {error}=await required().rpc('admin_set_user_state',{target:userId,new_role:role,suspended});if(error)throw error; },
    async adminDelete(table,id) { const {error}=await required().from(table).delete().eq('id',id);if(error)throw error; },
    async adminDeleteUser(userId) { const {data,error}=await required().rpc('admin_delete_user',{target:userId});if(error)throw error;return data; }
  };
})();
