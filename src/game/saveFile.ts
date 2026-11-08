/**
 * How a scorecard or replay can be kept on this device. Websites cannot write to an iPhone's Photos
 * directly; the share sheet's Save Image / Save Video is the only way there. Android and desktop save
 * downloads quietly. In-app browsers (X, TikTok, Instagram, Facebook) often drop downloads without a word.
 */
export type SaveRoute =
  /** Save opens the share sheet, where Save Image / Save Video put the file in Photos. */
  | 'share-sheet'
  /** Save downloads the file. */
  | 'download'
  /** Nothing can save it from here: for a picture, press and hold it instead. */
  | 'hold'
  /** Nothing can save a video from here: open the site in the phone's own browser. */
  | 'other-browser'

function ua() {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

/** iPhone, iPod or iPad (iPads also report themselves as a Mac with a touch screen). */
export function isIos() {
  return /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroid() {
  return /Android/.test(ua())
}

/** The app whose built-in browser this is, or null in a normal browser. */
export function inAppBrowser(): string | null {
  const agent = ua()
  if (/TikTok|musical_ly|Bytedance/i.test(agent)) return 'TikTok'
  if (/Instagram/.test(agent)) return 'Instagram'
  if (/FBAN|FBAV|FB_IAB/.test(agent)) return 'Facebook'
  if (/Twitter/.test(agent)) return 'X'
  if (/Snapchat/.test(agent)) return 'Snapchat'
  if (/\bLine\//.test(agent)) return 'LINE'
  if (/; wv\)/.test(agent)) return 'this app'
  return null
}

export function canShareFiles(files: File[]) {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files })
  } catch {
    return false
  }
}

/** The best way to keep `file` here. */
export function saveRoute(file: File): SaveRoute {
  const shareable = canShareFiles([file])
  const video = file.type.startsWith('video/')
  if (isIos()) {
    if (shareable) return 'share-sheet'
    if (inAppBrowser()) return video ? 'other-browser' : 'hold'
    return 'download'
  }
  if (inAppBrowser()) {
    if (shareable) return 'share-sheet'
    return video ? 'other-browser' : 'hold'
  }
  return 'download'
}

export function downloadUrl(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  // An iPhone shows a download in its own viewer; in a new tab, so the game is still there afterwards.
  if (isIos()) link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
