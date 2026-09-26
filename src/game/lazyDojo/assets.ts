import dojoBg from '../../assets/lazy-dojo/backgrounds/dojo-1.png'
import ninjaCub from '../../assets/lazy-dojo/ui/ninja-cub.png'
import ninjaCubCover from '../../assets/lazy-dojo/ui/ninja-cub-cover.png'
import ninjaCubsLogo from '../../assets/lazy-dojo/ui/ninja-cubs-logo.png'

import watermelon from '../../assets/lazy-dojo/sprites/fruit/watermelon.png'
import pineapple from '../../assets/lazy-dojo/sprites/fruit/pineapple.png'
import orange from '../../assets/lazy-dojo/sprites/fruit/orange.png'
import apple from '../../assets/lazy-dojo/sprites/fruit/apple.png'
import banana from '../../assets/lazy-dojo/sprites/fruit/banana.png'
import strawberry from '../../assets/lazy-dojo/sprites/fruit/strawberry.png'
import coconut from '../../assets/lazy-dojo/sprites/fruit/coconut.png'

import watermelonLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/watermelon-left.png'
import watermelonRight from '../../assets/lazy-dojo/sprites/fruit/sliced/watermelon-right.png'
import pineappleLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/pineapple-left.png'
import pineappleRight from '../../assets/lazy-dojo/sprites/fruit/sliced/pineapple-right.png'
import orangeLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/orange-left.png'
import orangeRight from '../../assets/lazy-dojo/sprites/fruit/sliced/orange-right.png'
import appleLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/apple-left.png'
import appleRight from '../../assets/lazy-dojo/sprites/fruit/sliced/apple-right.png'
import bananaLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/banana-left.png'
import bananaRight from '../../assets/lazy-dojo/sprites/fruit/sliced/banana-right.png'
import strawberryLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/strawberry-left.png'
import strawberryRight from '../../assets/lazy-dojo/sprites/fruit/sliced/strawberry-right.png'
import coconutLeft from '../../assets/lazy-dojo/sprites/fruit/sliced/coconut-left.png'
import coconutRight from '../../assets/lazy-dojo/sprites/fruit/sliced/coconut-right.png'

import bomb from '../../assets/lazy-dojo/sprites/hazards/bomb.png'
import golden from '../../assets/lazy-dojo/sprites/bonuses/golden.png'
import lazyCoin from '../../assets/lazy-dojo/sprites/bonuses/lazy-coin.png'
import bgmEasyBonus from '../../assets/lazy-dojo/audio/bgm-easy-bonus-lounge.wav'

import type { FruitId } from './config'

export const DOJO_ASSETS = {
  backgrounds: {
    dojo: dojoBg,
  },
  ui: {
    ninjaCub,
    ninjaCubCover,
    ninjaCubsLogo,
  },
  fruit: {
    watermelon,
    pineapple,
    orange,
    apple,
    banana,
    strawberry,
    coconut,
  } satisfies Record<FruitId, string>,
  fruitSliced: {
    watermelon: { left: watermelonLeft, right: watermelonRight },
    pineapple: { left: pineappleLeft, right: pineappleRight },
    orange: { left: orangeLeft, right: orangeRight },
    apple: { left: appleLeft, right: appleRight },
    banana: { left: bananaLeft, right: bananaRight },
    strawberry: { left: strawberryLeft, right: strawberryRight },
    coconut: { left: coconutLeft, right: coconutRight },
  } satisfies Record<FruitId, { left: string; right: string }>,
  hazards: {
    bomb,
  },
  bonuses: {
    golden,
    lazyCoin,
  },
  audio: {
    bgm: bgmEasyBonus,
  },
}

export type DojoAssetMap = typeof DOJO_ASSETS

export type DojoSprites = {
  fruit: Partial<Record<FruitId, HTMLImageElement>>
  fruitSliced: Partial<Record<FruitId, { left: HTMLImageElement; right: HTMLImageElement }>>
  bomb: HTMLImageElement | null
  golden: HTMLImageElement | null
  lazyCoin: HTMLImageElement | null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
    img.src = src
  })
}

export async function loadDojoSprites(): Promise<DojoSprites> {
  const fruitIds = Object.keys(DOJO_ASSETS.fruit) as FruitId[]
  const fruitEntries = await Promise.all(
    fruitIds.map(async (id) => [id, await loadImage(DOJO_ASSETS.fruit[id])] as const),
  )
  const slicedEntries = await Promise.all(
    fruitIds.map(async (id) => {
      const pair = DOJO_ASSETS.fruitSliced[id]
      const [left, right] = await Promise.all([loadImage(pair.left), loadImage(pair.right)])
      return [id, { left, right }] as const
    }),
  )
  const [bombImg, goldenImg, coinImg] = await Promise.all([
    loadImage(DOJO_ASSETS.hazards.bomb),
    loadImage(DOJO_ASSETS.bonuses.golden),
    loadImage(DOJO_ASSETS.bonuses.lazyCoin),
  ])

  return {
    fruit: Object.fromEntries(fruitEntries),
    fruitSliced: Object.fromEntries(slicedEntries),
    bomb: bombImg,
    golden: goldenImg,
    lazyCoin: coinImg,
  }
}
