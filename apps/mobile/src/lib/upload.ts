import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

export async function uploadJpeg(bucket: string, path: string, uri: string): Promise<void> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}
