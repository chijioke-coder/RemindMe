import { supabase } from './supabase';

/** Public address of a product icon stored in the product-icons bucket. */
export const iconUrl = (path?: string | null): string | null =>
  path ? supabase.storage.from('product-icons').getPublicUrl(path).data.publicUrl : null;

/** Crops to a square and shrinks to a small WebP so icons load fast. */
export async function resizeImage(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image'))), 'image/webp', 0.85));
}

export const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
