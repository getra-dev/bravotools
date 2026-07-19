'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from './supabase/server';
import { getSessionContext } from './org';

function errorCode(message: string): string {
  if (message.includes('not_allowed')) return 'not_allowed';
  if (message.includes('already_written_off')) return 'already_written_off';
  return 'save_failed';
}

export async function writeOffToolAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const toolId = String(formData.get('toolId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const note = String(formData.get('note') ?? '');

  const supabase = await getSupabaseServer();
  const photoPaths: { storage_path: string }[] = [];
  const file = formData.get('photo');
  if (file instanceof File && file.size > 0) {
    const path = `${ctx.activeOrg.orgId}/${toolId}/writeoff-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('tool-photos')
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
    if (!uploadError) photoPaths.push({ storage_path: path });
  }

  const { error } = await supabase.rpc('write_off_tool', {
    target_tool: toolId,
    reason,
    note,
    photo_paths: photoPaths,
  });
  if (error) redirect(`/tools/${toolId}/write-off?error=${errorCode(error.message)}`);
  revalidatePath(`/tools/${toolId}`);
  redirect(`/tools/${toolId}`);
}

export async function addComponentAction(formData: FormData) {
  const toolId = String(formData.get('toolId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('add_tool_component', {
    target_tool: toolId,
    component_name: String(formData.get('name') ?? ''),
    component_qty: Number(formData.get('qty') ?? 1) || 1,
  });
  if (error) redirect(`/tools/${toolId}?error=save_failed`);
  revalidatePath(`/tools/${toolId}`);
  redirect(`/tools/${toolId}`);
}

export async function removeComponentAction(formData: FormData) {
  const toolId = String(formData.get('toolId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('remove_tool_component', {
    component_id: String(formData.get('componentId') ?? ''),
  });
  if (error) redirect(`/tools/${toolId}?error=save_failed`);
  revalidatePath(`/tools/${toolId}`);
  redirect(`/tools/${toolId}`);
}

export async function addInspectionAction(formData: FormData) {
  const toolId = String(formData.get('toolId') ?? '');
  const supabase = await getSupabaseServer();
  const { error } = await supabase.rpc('add_inspection_schedule', {
    target_tool: toolId,
    itype: String(formData.get('itype') ?? 'general'),
    months: Number(formData.get('months') ?? 12) || 12,
    due: String(formData.get('due') ?? ''),
  });
  if (error) redirect(`/tools/${toolId}?error=save_failed`);
  revalidatePath(`/tools/${toolId}`);
  redirect(`/tools/${toolId}`);
}

export async function addToolPhotoAction(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx?.activeOrg) redirect('/onboarding');
  const toolId = String(formData.get('toolId') ?? '');
  const file = formData.get('photo');

  const supabase = await getSupabaseServer();
  if (file instanceof File && file.size > 0) {
    const path = `${ctx.activeOrg.orgId}/${toolId}/original-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('tool-photos')
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
    if (!uploadError) {
      await supabase.rpc('add_tool_photo', { target_tool: toolId, path });
    }
  }
  revalidatePath(`/tools/${toolId}`);
  redirect(`/tools/${toolId}`);
}
