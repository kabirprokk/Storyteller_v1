import { createClient } from 'npm:@supabase/supabase-js@2.110.7'

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'https://kabirprokk.github.io')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request)
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers })

  const origin = request.headers.get('origin') || ''
  if (origin && !allowedOrigins.includes(origin)) {
    return Response.json({ error: 'Origin not allowed' }, { status: 403, headers })
  }

  try {
    const { storyId } = await request.json()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId || '')) {
      return Response.json({ error: 'Invalid story' }, { status: 400, headers })
    }

    const forwarded = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-real-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown'
    const salt = Deno.env.get('VIEW_COUNT_SALT')
    if (!salt) throw new Error('VIEW_COUNT_SALT is not configured')
    const fingerprint = await sha256(`${forwarded}|${salt}`)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data, error } = await admin.rpc('record_story_view', { target: storyId, fingerprint })
    if (error) throw error

    return Response.json({ counted: Boolean(data) }, {
      headers: { ...headers, 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Unable to record view' }, { status: 500, headers })
  }
})
