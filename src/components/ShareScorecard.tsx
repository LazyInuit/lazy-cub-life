import { useEffect, useMemo, useRef, useState } from 'react'
import { duckGameAudio } from '../game/audioBus'
import { useReplayState } from '../game/replay'
import { canShareFiles, downloadUrl, inAppBrowser, isAndroid, isIos, saveRoute, type SaveRoute } from '../game/saveFile'
import { renderScorecard, scorecardPost, xPostUrl, type ScorecardSpec } from '../game/scorecard'
import { countShare, type ShareEvent } from '../game/shareStats'

type Share = {
  spec: ScorecardSpec
  status: 'making' | 'ready' | 'failed'
  blob?: Blob
  url?: string
  /** Opened from the Replay button: the replay starts playing straight away. */
  playReplay: boolean
  note?: string
}

/** Which file the save preview is showing. */
type Preview = 'image' | 'replay'

function baseName(spec: ScorecardSpec) {
  return `lazycub-${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${spec.score}`
}

/** The replay, playing with sound when the player asked for it. Game sound is turned down while it plays. */
function ReplayPlayer({
  url,
  poster,
  autoPlay,
  hold = false,
  className = 'share-replay-video',
}: {
  url: string
  poster?: string
  autoPlay: boolean
  hold?: boolean
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video || !autoPlay) return
    video.play().catch(() => {
      // The browser would not start it with sound: start muted, and the player can unmute.
      video.muted = true
      void video.play().catch(() => undefined)
    })
  }, [autoPlay, url])

  // Pause when another screen covers it, or when the player moves on from watching it.
  useEffect(() => {
    if (hold || !autoPlay) ref.current?.pause()
  }, [hold, autoPlay])

  useEffect(() => () => duckGameAudio(false), [])

  return (
    <video
      ref={ref}
      className={className}
      src={url}
      poster={poster}
      playsInline
      controls
      preload={autoPlay ? 'auto' : 'metadata'}
      onPlay={() => duckGameAudio(true)}
      onPause={() => duckGameAudio(false)}
      onEnded={() => duckGameAudio(false)}
    />
  )
}

/** The words on the Save button and the hint under the preview, for how this device saves. */
function saveWords(route: SaveRoute, kind: Preview) {
  const thing = kind === 'image' ? 'image' : 'video'
  const app = inAppBrowser()
  switch (route) {
    case 'share-sheet':
      return {
        button: isIos() ? 'Save to Photos' : `Save ${kind === 'image' ? 'Image' : 'Replay'}`,
        hint: isIos() ? `Tap Save to Photos, then pick Save ${kind === 'image' ? 'Image' : 'Video'}.` : `Tap Save, then pick where to keep the ${thing}.`,
      }
    case 'download':
      return { button: `Save ${kind === 'image' ? 'Image' : 'Replay'}`, hint: null }
    case 'hold':
      return { button: null, hint: `Press and hold the picture, then tap ${isIos() ? 'Save to Photos' : 'Download image'}.` }
    case 'other-browser':
      return {
        button: null,
        hint: `${app ? `${app}'s browser` : 'This browser'} can't save videos. Open lazycub.life in ${isIos() ? 'Safari' : 'Chrome'} to save your replays.`,
      }
  }
}

/**
 * Share to X for a results screen: `open(spec)` makes the scorecard and shows it with the run's replay,
 * and `modal` is the screen to render inside the game. X's web link cannot carry files, so the image and
 * replay are shared through the phone's share sheet where it can, and otherwise saved for the player to attach.
 * Save Image and Save Replay open a preview first; nothing is downloaded until the player chooses to.
 */
export function useScorecardShare() {
  const [share, setShare] = useState<Share | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const replay = useReplayState()
  /** Actions already counted for this scorecard: saving the same image twice counts once. */
  const counted = useRef(new Set<ShareEvent>())

  const count = (event: ShareEvent) => {
    if (!share || counted.current.has(event)) return
    counted.current.add(event)
    countShare(share.spec.game, event)
  }

  useEffect(() => {
    const url = share?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [share?.url])

  const open = (spec: ScorecardSpec | null, options: { replay?: boolean } = {}) => {
    if (!spec) return
    const playReplay = Boolean(options.replay)
    counted.current = new Set()
    setPreview(null)
    setShare({ spec, status: 'making', playReplay })
    renderScorecard(spec)
      .then((blob) => {
        setShare((current) => (current?.spec === spec ? { spec, status: 'ready', blob, url: URL.createObjectURL(blob), playReplay: current.playReplay } : current))
      })
      .catch(() => setShare((current) => (current?.spec === spec ? { spec, status: 'failed', playReplay: current.playReplay } : current)))
  }

  const close = () => {
    duckGameAudio(false)
    setPreview(null)
    setShare(null)
  }
  const note = (text: string) => setShare((current) => (current ? { ...current, note: text } : current))

  // One File wrapper each for the image and the replay; they point at the blobs already made, so nothing is copied.
  const image = useMemo(() => (share?.blob ? new File([share.blob], `${baseName(share.spec)}.png`, { type: 'image/png' }) : null), [share?.blob, share?.spec])
  const replayBlob = replay.status === 'ready' ? replay.blob : null
  const replayFile = useMemo(
    () => (share && replayBlob ? new File([replayBlob], `${baseName(share.spec)}-replay.mp4`, { type: 'video/mp4' }) : null),
    [replayBlob, share],
  )
  const canShareImage = Boolean(image && canShareFiles([image]))
  const canShareBoth = Boolean(image && replayFile && canShareFiles([image, replayFile]))
  const canShareReplay = Boolean(replayFile && canShareFiles([replayFile]))

  const shareFiles = async (files: File[], what: string, done: (text: string) => void = note) => {
    if (!share) return
    try {
      await navigator.share({ files, text: scorecardPost(share.spec) })
      if (files.some((file) => file.type.startsWith('image/'))) count('share-image')
      if (files.some((file) => file.type.startsWith('video/'))) count('share-replay')
      done(`Sent to the app you picked. Check ${what} attached before you post.`)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') done("Your phone couldn't share that. Try Save instead and add it to your post.")
    }
  }

  const openPreview = (kind: Preview) => {
    setPreviewNote(null)
    setPreview(kind)
  }
  const closePreview = () => {
    duckGameAudio(false)
    setPreview(null)
  }

  /** Saves the previewed file the best way this device allows. */
  const save = async (kind: Preview) => {
    if (!share) return
    const file = kind === 'image' ? image : replayFile
    const url = kind === 'image' ? share.url : replay.status === 'ready' ? replay.url : null
    if (!file || !url) return
    const route = saveRoute(file)
    const saved = kind === 'image' ? 'save-image' : 'save-replay'
    if (route === 'share-sheet') {
      try {
        // Only the file, no text: with text attached some apps save a note instead of the picture.
        await navigator.share({ files: [file] })
        count(saved)
        setPreviewNote(isIos() ? `If you picked Save ${kind === 'image' ? 'Image' : 'Video'}, it's in your Photos.` : 'Done.')
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          // The share sheet failed: fall back to a plain download.
          downloadUrl(url, file.name)
          count(saved)
          setPreviewNote('Saved to your downloads.')
        }
      }
      return
    }
    if (route === 'download') {
      downloadUrl(url, file.name)
      count(saved)
      setPreviewNote(
        isAndroid()
          ? 'Saved to your Downloads. It shows in your gallery too.'
          : isIos()
            ? `Opened in a new tab. Tap the share button there and pick Save ${kind === 'image' ? 'Image' : 'Video'}, then come back to this tab.`
            : 'Saved to your downloads.',
      )
    }
  }

  const openX = () => {
    if (!share) return
    window.open(xPostUrl(scorecardPost(share.spec)), '_blank', 'noopener,noreferrer')
    count('x-post')
    note('X opened with your post written. Nothing is attached yet: add your saved scorecard or replay before posting.')
  }

  const replaySection =
    replay.status === 'ready' ? (
      <>
        <div className="share-replay">
          <ReplayPlayer url={replay.url} poster={replay.poster} autoPlay={share?.playReplay ?? false} hold={preview !== null} />
        </div>
        {import.meta.env.DEV && replay.stats ? <p className="replay-dev-note">Recorded at {replay.stats}</p> : null}
      </>
    ) : replay.status === 'making' ? (
      <div className="share-replay share-replay-making">
        <p>Making your replay…</p>
      </div>
    ) : null

  const previewFile = preview === 'image' ? image : preview === 'replay' ? replayFile : null
  const previewRoute = previewFile ? saveRoute(previewFile) : null
  const words = preview && previewRoute ? saveWords(previewRoute, preview) : null
  const previewCanShare = preview === 'image' ? canShareImage : canShareReplay

  const savePop =
    share && preview && previewFile && words ? (
      <div
        className="save-pop"
        role="presentation"
        onClick={(event) => {
          event.stopPropagation()
          closePreview()
        }}
      >
        <div className="save-card share-scroll" role="dialog" aria-modal="true" aria-label={preview === 'image' ? 'Your scorecard' : 'Your replay'} onClick={(event) => event.stopPropagation()}>
          <h2>{preview === 'image' ? 'Your Scorecard' : 'Your Replay'}</h2>
          <div className={`save-preview save-preview-${preview}`}>
            {preview === 'image' && share.url ? (
              <img src={share.url} alt={`${share.spec.title} scorecard: ${share.spec.username} scored ${share.spec.score.toLocaleString('en-US')}`} />
            ) : replay.status === 'ready' ? (
              <ReplayPlayer url={replay.url} poster={replay.poster} autoPlay={false} className="save-video" />
            ) : null}
          </div>
          {words.hint ? <p className="save-hint">{words.hint}</p> : null}
          {previewNote ? <p className="share-note">{previewNote}</p> : null}
          {words.button ? (
            <button type="button" className="share-btn share-btn-main" onClick={() => void save(preview)}>
              {words.button}
            </button>
          ) : null}
          {previewCanShare ? (
            <button
              type="button"
              className="share-btn"
              onClick={() => void shareFiles([previewFile], preview === 'image' ? 'the image is' : 'the replay is', setPreviewNote)}
            >
              Share
            </button>
          ) : null}
          <button type="button" className="share-btn share-btn-ghost" onClick={closePreview}>
            Close
          </button>
        </div>
      </div>
    ) : null

  /** From the replay screen to the share screen, where the save and share options are. */
  const showOptions = () => {
    duckGameAudio(false)
    setShare((current) => (current ? { ...current, playReplay: false } : current))
  }

  const modal = share && share.playReplay ? (
    <div className="share-pop" role="presentation" onClick={close}>
      <div className="share-card share-scroll" role="dialog" aria-modal="true" aria-label="Your replay" onClick={(event) => event.stopPropagation()}>
        <h2>Your Replay</h2>
        {replaySection}
        <button type="button" className="share-btn share-btn-main" onClick={showOptions}>
          Share &amp; Save
        </button>
        <button type="button" className="share-btn share-btn-ghost" onClick={close}>
          Close
        </button>
      </div>
    </div>
  ) : share ? (
    <div className="share-pop" role="presentation" onClick={close}>
      <div className="share-card share-scroll" role="dialog" aria-modal="true" aria-label="Share your score" onClick={(event) => event.stopPropagation()}>
        <h2>Share Your Score</h2>
        {replaySection}
        <div className="share-preview">
          {share.status === 'ready' && share.url ? (
            <img src={share.url} alt={`${share.spec.title} scorecard: ${share.spec.username} scored ${share.spec.score.toLocaleString('en-US')}`} />
          ) : (
            <p>{share.status === 'failed' ? "The scorecard couldn't be made. Try again." : 'Making your scorecard…'}</p>
          )}
        </div>
        <p className="share-text">{scorecardPost(share.spec)}</p>
        {share.note ? <p className="share-note">{share.note}</p> : null}
        {canShareBoth && image && replayFile ? (
          <button type="button" className="share-btn share-btn-main" onClick={() => void shareFiles([image, replayFile], 'the image and replay are both')}>
            Share Image &amp; Replay
          </button>
        ) : canShareImage && image ? (
          <button type="button" className="share-btn share-btn-main" onClick={() => void shareFiles([image], 'the image is')}>
            Share Image
          </button>
        ) : null}
        {!canShareBoth && canShareReplay && replayFile ? (
          <button type="button" className="share-btn" onClick={() => void shareFiles([replayFile], 'the replay is')}>
            Share Replay
          </button>
        ) : null}
        <button type="button" className={`share-btn${canShareImage ? '' : ' share-btn-main'}`} onClick={() => openPreview('image')} disabled={share.status !== 'ready'}>
          Save Image
        </button>
        {replay.status === 'ready' || replay.status === 'making' ? (
          <button type="button" className="share-btn" onClick={() => openPreview('replay')} disabled={replay.status !== 'ready'}>
            Save Replay
          </button>
        ) : null}
        <button type="button" className="share-btn share-btn-x" onClick={openX}>
          Open X Post
        </button>
        <p className="share-help">
          {`X can't add files to a post by itself, so save them and attach them on X${
            canShareBoth ? ', or use Share Image & Replay and pick X' : canShareImage ? ', or use Share Image and pick X' : ''
          }.`}
        </p>
        <button type="button" className="share-btn share-btn-ghost" onClick={close}>
          Close
        </button>
      </div>
      {savePop}
    </div>
  ) : null

  return { open, modal }
}

/** The Replay button for a results screen: shown only while this run's replay is being made or is ready. */
export function ReplayButton({ className, onOpen, label = 'Replay' }: { className: string; onOpen: () => void; label?: string }) {
  const replay = useReplayState()
  if (import.meta.env.DEV && replay.status === 'off') return <p className="replay-dev-note">Replay off: {replay.reason ?? 'unknown'}</p>
  if (replay.status !== 'ready' && replay.status !== 'making') return null
  return (
    <button type="button" className={`${className} replay-red-btn`} onClick={onOpen}>
      <span className="replay-red-tri" aria-hidden="true" />
      {label}
    </button>
  )
}
