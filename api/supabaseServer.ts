import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hmqcfelpvhhzspqgjyfa.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

export interface DbRoomState {
  title: string;
  primary_hls_url: string;
  backup_embed_url: string;
  discord_url: string;
  auto_play: boolean;
  ambient_glow: boolean;
  is_locked_down: boolean;
  host_epoch: number;
  scheduled_time?: string | null;
  scheduled_title?: string | null;
  scheduled_url?: string | null;
}

export interface DbSecurityState {
  master_passcode: string;
  master_recovery_otp: string;
  host_passcode: string;
  viewer_passcode: string;
  owner_email: string;
}

/**
 * Fetch active room state from Supabase
 */
export async function fetchRoomFromDb(): Promise<DbRoomState | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('party_room')
      .select('*')
      .eq('room_slug', 'main')
      .maybeSingle();

    if (error || !data) return null;
    return data as DbRoomState;
  } catch (err) {
    console.warn('Supabase fetchRoom error:', err);
    return null;
  }
}

/**
 * Update room state in Supabase (triggers Supabase Realtime for all viewers)
 */
export async function updateRoomInDb(updates: Partial<DbRoomState>): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    const { error } = await supabase
      .from('party_room')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('room_slug', 'main');

    return !error;
  } catch (err) {
    console.warn('Supabase updateRoom error:', err);
    return false;
  }
}

/**
 * Fetch security credentials from Supabase
 */
export async function fetchSecurityFromDb(): Promise<DbSecurityState | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('party_security')
      .select('*')
      .eq('room_slug', 'main')
      .maybeSingle();

    if (error || !data) return null;
    return data as DbSecurityState;
  } catch (err) {
    console.warn('Supabase fetchSecurity error:', err);
    return null;
  }
}

/**
 * Update security credentials in Supabase
 */
export async function updateSecurityInDb(updates: Partial<DbSecurityState>): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    const { error } = await supabase
      .from('party_security')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('room_slug', 'main');

    return !error;
  } catch (err) {
    console.warn('Supabase updateSecurity error:', err);
    return false;
  }
}
