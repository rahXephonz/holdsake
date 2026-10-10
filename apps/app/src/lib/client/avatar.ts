import { UserFacingError } from '@/lib/client/api'

const SIZE = 512

/**
 * A square, 512px crop from the middle of the photo, re-encoded in the browser. Re-encoding also
 * drops the file's metadata (camera, location), which would otherwise go public with the photo.
 */
export async function avatarFrom(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new UserFacingError('That photo can’t be used. Try a JPEG or PNG.')
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new UserFacingError('That photo can’t be used. Try another one.')
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  )
  bitmap.close()
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  // Safari can't write WebP and quietly hands back a PNG instead; JPEG is small everywhere
  const webp = await encode('image/webp')
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg')
  if (!blob) throw new UserFacingError('That photo can’t be used. Try another one.')
  return blob
}
