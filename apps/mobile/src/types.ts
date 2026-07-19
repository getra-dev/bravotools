export type ScannedTool = {
  id: string;
  org_id: string;
  name: string;
  qr_code: string | null;
  status: string;
  ownership: string;
  serial_number: string | null;
  tracks_engine_hours: boolean;
  engine_hours: number | null;
  category: { name: string } | null;
  location: { name: string } | null;
  holder: { full_name: string | null } | null;
  external_holder: { full_name: string } | null;
};

export type HandoverAction = 'checkout' | 'checkin' | 'transfer';

export type Receiver =
  | { kind: 'profile'; id: string; name: string }
  | { kind: 'external'; id: string; name: string };

export type ChecklistItem = {
  component_id: string;
  name: string;
  included: boolean;
  condition_note: string;
};

export type SignatureStrokes = {
  width: number;
  height: number;
  strokes: { x: number; y: number }[][];
};

export type IncomingOrderItem = {
  id: string;
  description: string;
  quantity: number;
  delivered_quantity: number | null;
  unit: string | null;
};

export type IncomingOrder = {
  id: string;
  org_id: string;
  order_number: string;
  status: string;
  is_hot: boolean;
  needed_by: string | null;
  site: { name: string } | null;
  items: IncomingOrderItem[];
};
