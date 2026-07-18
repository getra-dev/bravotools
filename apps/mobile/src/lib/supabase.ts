import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@bravotools/db';

// LOCAL-FIRST (ADR-014): when no EXPO_PUBLIC_SUPABASE_URL is set, point at
// the local Supabase on the same machine that serves Metro — the phone can
// reach it over LAN because supabase binds 0.0.0.0.
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (metroHost ? `http://${metroHost}:55321` : 'http://127.0.0.1:55321');

// Shared local-dev publishable key (same as apps/web/.env.local); override
// via EXPO_PUBLIC_SUPABASE_KEY for any non-local environment.
const key =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
