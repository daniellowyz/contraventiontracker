import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. PDF upload will be disabled.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const APPROVAL_BUCKET = 'approval-documents';

export async function uploadApprovalPdf(file: File, referenceNo: string): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${referenceNo}-${Date.now()}.${fileExt}`;
  const filePath = `approvals/${fileName}`;

  const { data, error } = await supabase.storage
    .from(APPROVAL_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(APPROVAL_BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export async function deleteApprovalPdf(filePath: string): Promise<void> {
  if (!supabase) {
    console.error('Supabase not configured');
    return;
  }

  const { error } = await supabase.storage
    .from(APPROVAL_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('Error deleting file:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
