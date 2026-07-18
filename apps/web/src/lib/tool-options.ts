import { getSupabaseServer } from './supabase/server';

/** Select options (categories, vendors, locations) for the tool form. */
export async function getToolFormOptions(orgId: string) {
  const supabase = await getSupabaseServer();
  const [categories, vendors, locations] = await Promise.all([
    supabase.from('tool_categories').select('id, name').eq('org_id', orgId).order('name'),
    supabase.from('vendors').select('id, name').eq('org_id', orgId).order('name'),
    supabase
      .from('locations')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);
  return {
    categories: categories.data ?? [],
    vendors: vendors.data ?? [],
    locations: locations.data ?? [],
  };
}
