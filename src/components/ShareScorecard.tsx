import { useEffect, useState } from 'react'
import { renderScorecard, scorecardPost, xPostUrl, type ScorecardSpec } from '../game/scorecard'

type Share = {
  spec: ScorecardSpec
  status: 'making' | 'ready' | 'failed'
  blob?: Blob
  url?: string
  /** True when this browser can hand the image file to the phone's share sheet. */
  canShareFile?: boolean
  note?: string
}

function fileName(spec: ScorecardSpec) {
  return `lazycub-${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${spec.score}.png`
}

/**
 * Share to X for a results screen: `open(spec)` makes the scorecard and shows it, and `modal` is the
 * preview to render inside the game screen. X's web link cannot carry a picture, so the image is shared
 * through the phone's share sheet where it can be, and otherwise saved for the player to attach.
 */
export function useScorecardShare() {
  const [share, setShare] = useState<Share | null>(null)

  useEffect(() => {
    const url = share?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [share?.url])

  const open = (spec: ScorecardSpec | null) => {
    if (!spec) return
    setShare({ spec, status: 'making' })
    renderScorecard(spec)
      .then((blob) => {
        const file = new File([blob], fileName(spec), { type: 'image/png' })
        const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
        setShare((current) => (current?.spec === spec ? { spec, status: 'ready', blob, url: URL.createObjectURL(blob), canShareFile } : current))
      })
      .catch(() => setShare((current) => (current?.spec === spec ? { spec, status: 'failed' } : current)))
  }

  const close = () => setShare(null)
  const note = (text: string) => setShare((current) => (current ? { ...current, note: text } : current))

  const shareImage = async () => {
    if (!share?.blob) return
    const text = scorecardPost(share.spec)
    try {
      await navigator.share({ files: [new File([share.blob], fileName(share.spec), { type: 'image/png' })], text })
      note('Sent to the app you picked. Check your post there before it goes out.')
    } catch (error) {
      if ((error as Error).name !== 'AbortError') note("Your phone couldn't share the image. Save it instead and add it to your post.")
    }
  }

  const saveImage = () => {
    if (!share?.url) return
    const link = document.createElement('a')
    link.href = share.url
    link.download = fileName(share.spec)
    document.body.appendChild(link)
    link.click()
    link.remove()
    note('Image saved. Add it to your post on X with the photo button.')
  }

  const openX = () => {
    if (!share) return
    window.open(xPostUrl(scorecardPost(share.spec)), '_blank', 'noopener,noreferrer')
    note('X opened with your post written. The image is not attached yet: add your saved scorecard before posting.')
  }

  const modal = share ? (
    <div className="share-pop" role="presentation" onClick={close}>
      <div className="share-card share-scroll" role="dialog" aria-modal="true" aria-label="Share your score" onClick={(event) => event.stopPropagation()}>
        <h2>Share Your Score</h2>
        <div className="share-preview">
          {share.status === 'ready' && share.url ? (
            <img src={share.url} alt={`${share.spec.title} scorecard: ${share.spec.username} scored ${share.spec.score.toLocaleString('en-US')}`} />
          ) : (
            <p>{share.status === 'failed' ? "The scorecard couldn't be made. Try again." : 'Making your scorecard…'}</p>
          )}
        </div>
        <p className="share-text">{scorecardPost(share.spec)}</p>
        {share.note ? <p className="share-note">{share.note}</p> : null}
        {share.canShareFile ? (
          <button type="button" className="share-btn share-btn-main" onClick={shareImage}>
            Share Image
          </button>
        ) : null}
        <button type="button" className={`share-btn${share.canShareFile ? '' : ' share-btn-main'}`} onClick={saveImage} disabled={share.status !== 'ready'}>
          Save Image
        </button>
        <button type="button" className="share-btn share-btn-x" onClick={openX}>
          Open X Post
        </button>
        <p className="share-help">X can't add the picture to a post by itself, so save it and attach it on X{share.canShareFile ? ', or use Share Image and pick X' : ''}.</p>
        <button type="button" className="share-btn share-btn-ghost" onClick={close}>
          Close
        </button>
      </div>
    </div>
  ) : null

  return { open, modal }
}
