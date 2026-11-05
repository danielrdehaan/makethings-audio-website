// Where the account pages talk to. The anon key is Supabase's public client key: row-level security is what protects
// the data, and the same key ships in the StemShare app. shared/supabase.js is @supabase/supabase-js 2.116.0 (MIT),
// its UMD build, copied from npm as is.
export const SUPABASE_URL = 'https://ffnowrgmdckdnnnvmstd.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmbm93cmdtZGNrZG5ubnZtc3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzUzMzcsImV4cCI6MjA5NzgxMTMzN30.AWw8faCc7gXOiDSB9Q_r3J7d6xikxypnf-r6szHdzqg'
export const PLUGIN_API = 'https://stems.makethings.audio/api/plugin'
export const APP_URL = 'https://stems.makethings.audio'
// Cloudflare Turnstile's public site key for the sign-up form. Empty keeps /signup closed, whatever the switches say.
export const TURNSTILE_SITE_KEY = ''
// src/lib/terms.ts TERMS_VERSION in the stem-share repo: what a new account records agreeing to.
export const TERMS_VERSION = '2026-06-25'
