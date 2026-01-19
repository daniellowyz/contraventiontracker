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
export const SUPPORTING_DOCS_BUCKET = 'supporting-documents';

export async function uploadApprovalPdf(file: File, referenceNo: string): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  const fileExt = file.name.split('.').pop();
  const fileName = `${referenceNo}-${Date.now()}.${fileExt}`;
  const filePath = `approvals/${fileName}`;

  const { error } = await supabase.storage
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

/**
 * Upload a supporting document file to Supabase storage
 * @param file The file to upload
 * @param referenceNo The contravention reference number (for naming)
 * @returns The public URL of the uploaded file
 */
export async function uploadSupportingDoc(file: File, referenceNo: string): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${referenceNo}-${Date.now()}-${sanitizedFileName}`;
  const filePath = fileName;

  const { error } = await supabase.storage
    .from(SUPPORTING_DOCS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading supporting doc:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(SUPPORTING_DOCS_BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}
