import { atom } from 'jotai'

export type GallerySortBy = 'date'
export type GallerySortOrder = 'asc' | 'desc'
export const gallerySettingAtom = atom({
  sortBy: 'date' as GallerySortBy,
  sortOrder: 'desc' as GallerySortOrder,
  selectedTags: [] as string[],
})
