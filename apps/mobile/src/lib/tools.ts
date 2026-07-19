import { supabase } from './supabase';
import type { ScannedTool } from '../types';

const TOOL_SELECT = `id, org_id, name, qr_code, status, ownership, serial_number, tracks_engine_hours, engine_hours,
  category:tool_categories(name),
  location:locations!tools_current_location_id_fkey(name),
  holder:profiles!tools_current_holder_id_fkey(full_name),
  external_holder:external_persons!tools_current_external_holder_id_fkey(full_name)`;

export async function fetchToolByQr(code: string): Promise<ScannedTool | null | 'error'> {
  const { data, error } = await supabase
    .from('tools')
    .select(TOOL_SELECT)
    .eq('qr_code', code)
    .maybeSingle();
  if (error) return 'error';
  return (data as ScannedTool | null) ?? null;
}

export async function fetchToolById(id: string): Promise<ScannedTool | null> {
  const { data } = await supabase.from('tools').select(TOOL_SELECT).eq('id', id).maybeSingle();
  return (data as ScannedTool | null) ?? null;
}

export type ToolSearchRow = {
  id: string;
  name: string;
  qr_code: string | null;
  serial_number: string | null;
  inventory_code: string | null;
  status: string;
};

/** Sticker-less identification: serial / inventory code / name / QR text. */
export async function searchTools(query: string): Promise<ToolSearchRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const { data } = await supabase
    .from('tools')
    .select('id, name, qr_code, serial_number, inventory_code, status')
    .or(
      `serial_number.ilike.${like},inventory_code.ilike.${like},name.ilike.${like},qr_code.ilike.${like}`,
    )
    .order('name')
    .limit(20);
  return (data as ToolSearchRow[]) ?? [];
}
