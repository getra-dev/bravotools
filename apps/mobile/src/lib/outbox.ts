import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import { supabase } from './supabase';

// SPEC 2.6 offline outbox. Jobs are whole handovers (photos + signatures +
// RPC args) queued locally in SQLite and replayed when connectivity returns.
// Server-side idempotency by client movement UUID makes double sync a no-op,
// so retries are always safe (append-only model, never UPDATE history).

export type OutboxPhoto = { uri: string; component_id?: string };

export type HandoverJob = {
  mode: 'initiate' | 'perform';
  org_id: string;
  tool_id: string;
  movement_id: string;
  act_id: string;
  args: Record<string, unknown>;
  photos: OutboxPhoto[];
  signatures: { name: string; json: string }[];
};

const db = SQLite.openDatabaseSync('bravotools-outbox.db');
db.execSync(`
  create table if not exists outbox (
    id text primary key,
    kind text not null,
    payload text not null,
    created_at text not null,
    attempts integer not null default 0,
    last_error text,
    synced_at text
  );
`);

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  listeners.forEach((listener) => listener());
}
export function onOutboxChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingCount(): number {
  const row = db.getFirstSync<{ n: number }>(
    'select count(*) as n from outbox where synced_at is null',
  );
  return row?.n ?? 0;
}

export function enqueueHandover(job: HandoverJob): void {
  db.runSync(
    'insert or replace into outbox (id, kind, payload, created_at) values (?, ?, ?, ?)',
    [job.movement_id, 'handover', JSON.stringify(job), new Date().toISOString()],
  );
  emit();
}

function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(i + 1) - 0xdc00);
      i += 1;
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

async function uploadBytes(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes.buffer as ArrayBuffer, { contentType, upsert: true });
  if (error) throw error;
}

async function processHandover(job: HandoverJob): Promise<void> {
  // photos first, then rows (SPEC 2.6 ordering)
  const photoItems: { storage_path: string; component_id?: string }[] = [];
  for (let i = 0; i < job.photos.length; i += 1) {
    const photo = job.photos[i];
    const b64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: 'base64' });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${job.org_id}/${job.tool_id}/${job.movement_id}/${i + 1}.jpg`;
    await uploadBytes('tool-photos', path, bytes, 'image/jpeg');
    photoItems.push(
      photo.component_id
        ? { storage_path: path, component_id: photo.component_id }
        : { storage_path: path },
    );
  }
  for (const signature of job.signatures) {
    await uploadBytes(
      'signatures',
      `${job.org_id}/acts/${job.act_id}/${signature.name}.json`,
      utf8Bytes(signature.json),
      'application/json',
    );
  }

  const args = { ...job.args, photos: photoItems } as never;
  const { error } =
    job.mode === 'initiate'
      ? await supabase.rpc('initiate_handover', { args })
      : await supabase.rpc('perform_handover', { args });
  if (error) throw error;
}

let syncing = false;

/** Replays every unsynced job; safe to call repeatedly (idempotent server). */
export async function syncOutbox(): Promise<void> {
  if (syncing) return;
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.isInternetReachable === false) return;

  syncing = true;
  try {
    const rows = db.getAllSync<{ id: string; kind: string; payload: string }>(
      'select id, kind, payload from outbox where synced_at is null order by created_at',
    );
    for (const row of rows) {
      try {
        if (row.kind === 'handover') {
          await processHandover(JSON.parse(row.payload) as HandoverJob);
        }
        db.runSync('update outbox set synced_at = ? where id = ?', [
          new Date().toISOString(),
          row.id,
        ]);
        emit();
      } catch (error) {
        db.runSync('update outbox set attempts = attempts + 1, last_error = ? where id = ?', [
          error instanceof Error ? error.message : 'unknown',
          row.id,
        ]);
        emit();
      }
    }
  } finally {
    syncing = false;
  }
}

export async function isOffline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (!state) return false;
  return state.isConnected === false || state.isInternetReachable === false;
}
