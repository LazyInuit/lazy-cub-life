import { supabase } from './supabase'

const BUCKET = 'avatars'
/** Saved photos are square JPEGs this many pixels across. */
export const PHOTO_SIZE = 320

function photoPath(userId: string) {
  return `${userId}/avatar.jpg`
}

function plainError(message: string) {
  const text = message.toLowerCase()
  if (text.includes('bucket not found') || text.includes('not found')) return 'Profile photos need a database update.'
  if (text.includes('row-level security') || text.includes('unauthorized') || text.includes('policy')) {
    return 'Profile photos need a database update.'
  }
  if (text.includes('payload too large') || text.includes('exceeded')) return 'That photo is too large. Try another one.'
  return 'Could not save the photo. Try again.'
}

/** Public address for a stored photo. The version makes phones fetch a replaced photo. */
export function profilePhotoUrl(path: string, version: number) {
  if (!supabase) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?v=${version}`
}

async function signedInId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function uploadProfilePhoto(photo: Blob) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const userId = await signedInId()
  if (!userId) throw new Error('Sign in to add a photo.')
  const { error } = await supabase.storage.from(BUCKET).upload(photoPath(userId), photo, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '60',
  })
  if (error) throw new Error(plainError(error.message))
}

export async function removeProfilePhoto(userId?: string) {
  if (!supabase) throw new Error('Accounts are not connected.')
  const owner = userId ?? (await signedInId())
  if (!owner) throw new Error('Sign in to remove a photo.')
  const { data, error } = await supabase.storage.from(BUCKET).remove([photoPath(owner)])
  if (error) throw new Error(plainError(error.message))
  return (data?.length ?? 0) > 0
}
