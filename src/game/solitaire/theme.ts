/**
 * Spellitaire artwork. Every picture is optional: drop a PNG (or WebP, which wins if both exist)
 * named after `file` into src/assets/solitaire/ and it replaces the placeholder. No code changes needed.
 * Each piece also has its own position and scale settings here.
 */

/** Every image under src/assets/solitaire, found at build time. Missing files are simply absent. */
const FILES = import.meta.glob('../../assets/solitaire/**/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const BY_NAME = new Map<string, string>()
for (const [path, url] of Object.entries(FILES)) {
  const name = path.replace(/^.*\/assets\/solitaire\//, '')
  BY_NAME.set(name, url)
}

/**
 * The URL for an artwork file name without extension, or null when it has not been added yet.
 * WebP wins, then PNG; JPG suits pictures with no transparency, such as the background.
 */
export function solitaireAsset(file: string): string | null {
  return (
    BY_NAME.get(`${file}.webp`) ??
    BY_NAME.get(`${file}.png`) ??
    BY_NAME.get(`${file}.jpg`) ??
    BY_NAME.get(`${file}.jpeg`) ??
    null
  )
}

export type AssetSpec = {
  /** File name without extension, inside src/assets/solitaire/. */
  file: string
  /** Recommended artwork size in pixels (2-3x the size it shows at, for sharp phones). */
  width: number
  height: number
  /** What it is, for the artwork list. */
  note: string
}

export const SOLITAIRE_ASSETS = {
  background: {
    file: 'spellitaire-bg',
    width: 1290,
    height: 2300,
    note: 'Full-screen background with the title, score bar and Wizard Cub painted in (portrait). JPG is fine.',
  },
  cardBack: { file: 'card-back', width: 360, height: 522, note: 'Back of every face-down card. Corners are rounded by the game.' },
  cardFace: {
    file: 'card-face',
    width: 360,
    height: 522,
    note: 'Blank card front under the rank and suit (optional). Corners are rounded by the game.',
  },
  suitSpades: { file: 'suit-spades', width: 128, height: 128, note: 'Spade symbol on card faces.' },
  suitHearts: { file: 'suit-hearts', width: 128, height: 128, note: 'Heart symbol on card faces.' },
  suitDiamonds: { file: 'suit-diamonds', width: 128, height: 128, note: 'Diamond symbol on card faces.' },
  suitClubs: { file: 'suit-clubs', width: 128, height: 128, note: 'Club symbol on card faces.' },
  slotTableau: { file: 'slot-tableau', width: 250, height: 350, note: 'Empty tableau column outline.' },
  slotFoundation: { file: 'slot-foundation', width: 250, height: 350, note: 'Empty foundation outline.' },
  slotStock: { file: 'slot-stock', width: 250, height: 350, note: 'Stock outline when there are cards to turn back over.' },
  slotStockEmpty: { file: 'slot-stock-empty', width: 250, height: 350, note: 'Stock outline when the stock and waste are both empty.' },
  slotWaste: { file: 'slot-waste', width: 250, height: 350, note: 'Empty waste outline.' },
  button: { file: 'button', width: 220, height: 140, note: 'Background shared by the control buttons.' },
  iconEnd: { file: 'icon-end', width: 96, height: 96, note: 'End Game button icon.' },
  iconUndo: { file: 'icon-undo', width: 96, height: 96, note: 'Undo button icon.' },
  iconHint: { file: 'icon-hint', width: 96, height: 96, note: 'Hint button icon.' },
  panelScore: { file: 'panel-score', width: 360, height: 130, note: 'Score display background.' },
  panelTimer: { file: 'panel-timer', width: 360, height: 130, note: 'Timer display background.' },
  panelMoves: { file: 'panel-moves', width: 360, height: 130, note: 'Moves display background.' },
  winBanner: { file: 'win-banner', width: 1024, height: 512, note: 'Banner shown when the game is won, and on the results.' },
  sparkle: { file: 'sparkle', width: 128, height: 128, note: 'Magic sparkle used for effects.' },
  thumbnail: { file: 'game-thumb', width: 512, height: 512, note: 'Games menu tile (square). JPG is fine.' },
} as const satisfies Record<string, AssetSpec>

export type SolitaireAssetName = keyof typeof SOLITAIRE_ASSETS

/**
 * Optional full card faces, one file per card: cards/AS.png, cards/10H.png, cards/KC.png ...
 * (rank A, 2-10, J, Q, K then suit S, H, D, C). Recommended 250 x 350.
 */
export function cardFaceAsset(cardId: string) {
  return solitaireAsset(`cards/${cardId}`)
}

/**
 * Where and how big each piece shows. Sizes are fractions of the board width unless noted;
 * offsets move a piece without touching the layout around it.
 */
export const SOLITAIRE_LAYOUT = {
  /** Card height / width, matching the card artwork. Poker cards are 1.4, bridge cards 1.56. */
  cardAspect: 1.45,
  /**
   * Rank and suit on top of the card-face artwork, kept inside its gold border. Positions are fractions
   * of the card's width (x) and height (y); sizes are fractions of the card's width.
   */
  faceArt: { cornerX: 0.12, cornerY: 0.045, rankSize: 0.27, suitSize: 0.21, pipSize: 0.56, pipY: 0.55 },
  /** Space between columns, as a share of a card's width. */
  columnGap: 0.12,
  /** Most a card can be overlapped by the next one in a column, as a share of card height. */
  faceUpOverlap: 0.3,
  faceDownOverlap: 0.16,
  /** Least overlap when a long column has to squeeze to fit the screen. */
  minFaceUpOverlap: 0.2,
  minFaceDownOverlap: 0.07,
  /** Hard mode: how far each of the top three waste cards fans out, as a share of a card's width. */
  wasteFan: 0.24,
  /** Widest the board gets on a tablet, in CSS pixels. */
  maxBoardWidth: 520,
  /**
   * The background artwork, with the title, score bar and Wizard Cub painted in. It is shown full
   * width from the top, keeping its shape, and the score, time and moves are written onto its bar
   * instead of using the separate panels. All spots are fractions of the picture's width (x) and height (y).
   */
  background: {
    /** Picture width / height. */
    aspect: 575 / 1024,
    /** True when the picture has its own score bar with Score, Time and Moves labels. */
    hasScoreBar: true,
    /** Centre of each value, just under its label on the bar. */
    scoreAt: { x: 0.263, y: 0.189 },
    timeAt: { x: 0.502, y: 0.189 },
    movesAt: { x: 0.738, y: 0.189 },
    /** Value text height as a share of the picture width. */
    valueSize: 0.04,
    /** Where the card table starts, below the title and score bar. */
    tableTop: 0.232,
  },
  winBanner: { scale: 1, offsetY: 0 },
  /** Milliseconds for a card to slide to a new spot. */
  moveMs: 170,
  /** Two taps on the same card within this many milliseconds is a double-tap. */
  doubleTapMs: 320,
} as const
