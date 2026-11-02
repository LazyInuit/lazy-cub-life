/**
 * Spellitaire's modes and leaderboard keys, with no rules or artwork, so saves, the leaderboard and
 * scripts can use them.
 */

export const SPELL_MODE_IDS = ['classic', 'flipflop', 'pyramid', 'freecell', 'spider', 'golf'] as const
export type SpellMode = (typeof SPELL_MODE_IDS)[number]
export type Difficulty = 'easy' | 'hard'

type LaterMode = Exclude<SpellMode, 'classic'>
export type SpellitaireKey = 'solitaire' | 'solitaire-hard' | `solitaire-${LaterMode}` | `solitaire-${LaterMode}-hard`

/**
 * The leaderboard key for a mode and difficulty. Classic keeps its original keys so existing scores
 * stay; later modes are 'solitaire-<mode>' and 'solitaire-<mode>-hard'.
 */
export function boardKey(mode: SpellMode, difficulty: Difficulty): SpellitaireKey {
  const base: 'solitaire' | `solitaire-${LaterMode}` = mode === 'classic' ? 'solitaire' : `solitaire-${mode}`
  return difficulty === 'hard' ? `${base}-hard` : base
}

/** Every Spellitaire leaderboard key; the Spellitaire board adds a player's best in each. */
export const SPELLITAIRE_KEYS: readonly SpellitaireKey[] = SPELL_MODE_IDS.flatMap((mode) =>
  (['easy', 'hard'] as const).map((difficulty) => boardKey(mode, difficulty)),
)

/** Keys saved in the mode bests map; Classic's two have their own save fields. */
export const LATER_MODE_KEYS = SPELLITAIRE_KEYS.filter((key) => key !== 'solitaire' && key !== 'solitaire-hard')

export function isSpellMode(value: unknown): value is SpellMode {
  return SPELL_MODE_IDS.some((mode) => mode === value)
}

export function isSpellitaireKey(value: unknown): value is SpellitaireKey {
  return SPELLITAIRE_KEYS.some((key) => key === value)
}
