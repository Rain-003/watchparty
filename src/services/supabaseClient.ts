import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://hmqcfelpvhhzspqgjyfa.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY || 'dummy-anon-key-replace-in-env'
);

/**
 * Subscribes to real-time changes on the party_room table.
 * When the Host updates the stream, Supabase WebSockets push the new
 * stream to all connected viewers in <50ms without polling!
 */
export function subscribeToRoomRealtime(onUpdate: (newRoomState: any) => void) {
  if (!SUPABASE_ANON_KEY) return () => {};

  try {
    const channel = supabase
      .channel('party_room_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_room' },
        (payload) => {
          if (payload.new) {
            onUpdate(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Supabase Realtime subscription error:', err);
    return () => {};
  }
}
