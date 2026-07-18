export type ScannedTool = {
  id: string;
  name: string;
  qr_code: string | null;
  status: string;
  serial_number: string | null;
  category: { name: string } | null;
  location: { name: string } | null;
  holder: { full_name: string | null } | null;
  external_holder: { full_name: string } | null;
};
