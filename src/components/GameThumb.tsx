import dashThumb from '../assets/galactic-dash-cover.jpg'
import archerThumb from '../assets/cupid-archer/cover.jpg'
import hoopsThumb from '../assets/lazy-hoops/cover-select.jpg'
import baseballThumb from '../assets/baseball/cover-select.jpg'
import bubbleThumb from '../assets/bubble-blast/thumb.jpg'
import riverThumb from '../assets/lazy-river/game-thumb-cub.jpg'
import dojoBg from '../assets/lazy-dojo/backgrounds/dojo-1.png'
import dojoCover from '../assets/lazy-dojo/ui/ninja-cub-cover.png'
import lionPawUrl from '../assets/lion-paw-clear.png'
import { traitSlug } from '../game/cubTraits'
import type { DailyGame } from '../game/dailyTasks'
import { SolAsset } from './solitaire/SolAsset'

/** A game's picture from the games menu. `sash` adds the "New" ribbon the menu shows on new games. */
export function GameThumb({ game, sash = false }: { game: DailyGame; sash?: boolean }) {
  const ribbon = sash ? <span className="game-new-sash">New</span> : null
  switch (game) {
    case 'baseball':
      return (
        <span className="game-thumb thumb-baseball" aria-hidden="true">
          <img src={baseballThumb} alt="" />
          {ribbon}
        </span>
      )
    case 'solitaire':
      return (
        <span className="game-thumb thumb-solitaire" aria-hidden="true">
          <SolAsset
            name="thumbnail"
            fallback={
              <span className="sol-thumb-ph">
                <span className="sol-thumb-card">A♠</span>
                <span className="sol-thumb-card red">K♥</span>
              </span>
            }
          />
          {ribbon}
        </span>
      )
    case 'river':
      return (
        <span className="game-thumb thumb-river" aria-hidden="true">
          <img src={riverThumb} alt="" />
          {ribbon}
        </span>
      )
    case 'bubble':
      return (
        <span className="game-thumb thumb-bubble" aria-hidden="true">
          <img src={bubbleThumb} alt="" />
          {ribbon}
        </span>
      )
    case 'flight':
      return (
        <span className="game-thumb thumb-flight" aria-hidden="true">
          <img src={dashThumb} alt="" />
        </span>
      )
    case 'hoops':
      return (
        <span className="game-thumb thumb-hoops" aria-hidden="true">
          <img src={hoopsThumb} alt="" />
        </span>
      )
    case 'dojo':
      return (
        <span className="game-thumb thumb-dojo" aria-hidden="true">
          <img className="thumb-dojo-bg" src={dojoBg} alt="" />
          <img className="thumb-dojo-cover" src={dojoCover} alt="" />
        </span>
      )
    case 'archer':
      return <span className="game-thumb thumb-archer" aria-hidden="true" style={{ backgroundImage: `url("${archerThumb}")` }} />
    case 'match':
      return (
        <span className="game-thumb thumb-match" aria-hidden="true">
          <PrideThumbBack />
          <PrideThumbCell body="Zebra" />
          <PrideThumbCell body="Zebra" />
          <PrideThumbBack />
        </span>
      )
  }
}

function prideLayer(part: string, name: string) {
  return `/traits/layers/old/${part}/${traitSlug(name)}.png`
}

function PrideThumbCell({ body }: { body: string }) {
  return (
    <span className="pride-thumb-cell">
      <span className="pride-thumb-bust">
        <img src={prideLayer('body', body)} alt="" />
        <img src={prideLayer('mouth', 'Smirk')} alt="" />
        <img src={prideLayer('eyes', 'Surprised')} alt="" />
        <img src={prideLayer('mane', 'Black')} alt="" />
      </span>
    </span>
  )
}

function PrideThumbBack() {
  return (
    <span className="pride-thumb-cell pride-thumb-back">
      <img className="pride-thumb-paw" src={lionPawUrl} alt="" />
    </span>
  )
}
