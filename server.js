import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { customAlphabet } from 'nanoid'

dotenv.config()

const app = express()
app.use(helmet())
app.use(express.json({ limit: '200kb' }))

const PORT = process.env.PORT || 8080
const ADMIN_KEY = process.env.ADMIN_KEY

const allowedOrigins = [
  'http://localhost:5173',             // dev
  'https://quicktext-six.vercel.app'   // production frontend
]

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('CORS not allowed'))
    }
  },
  credentials: true
}))

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Missing Supabase credentials. Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Generate 7-char Base62 code
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const nanoid = customAlphabet(alphabet, 7)

// Rate limiter for /api/receive: 5 attempts per minute per IP
const receiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    warning: 'You have exceeded the limit of 5 attempts per minute. Please wait before trying again.'
  }
})

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Create (Send) a message
app.post('/api/send', async (req, res) => {
  try {
    const { topic, author, message } = req.body || {}
    if (!topic || !author || !message) {
      return res.status(400).json({ error: 'Missing topic/author/message' })
    }
    if (String(message).length > 10000) {
      return res.status(400).json({ error: 'Message too long (max 10k chars)' })
    }

    // generate unique code (retry on collision)
    let code = nanoid()
    let attempts = 0
    while (attempts < 5) {
      const { data: exists, error: existsErr } = await supabase
        .from('messages').select('id').eq('code', code).maybeSingle()
      if (existsErr) {
        console.error(existsErr)
        return res.status(500).json({ error: 'DB error checking code' })
      }
      if (!exists) break
      code = nanoid()
      attempts++
    }

    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase.from('messages').insert({
      topic, author, code, message, expires_at
    }).select().single()

    if (error) {
      console.error(error)
      return res.status(500).json({ error: 'Failed to save message' })
    }
    res.json({ id: data.id, code: data.code, expires_at: data.expires_at })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

// Receive a message (rate-limited)
app.post('/api/receive', receiveLimiter, async (req, res) => {
  try {
    const { code } = req.body || {}
    if (!code) return res.status(400).json({ error: 'Missing code' })

    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('messages')
      .select('id, topic, author, message, created_at, expires_at')
      .eq('code', code)
      .gt('expires_at', nowIso)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Invalid or expired code' })
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin middleware
function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key')
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// Admin list
app.get('/api/admin/messages', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, topic, author, code, message, created_at, expires_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'DB error' })
  res.json(data)
})

// Admin delete
app.delete('/api/admin/messages/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) return res.status(500).json({ error: 'DB error' })
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
