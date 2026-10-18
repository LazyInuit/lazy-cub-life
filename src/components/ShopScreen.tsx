import { useState } from 'react'
import milkUrl from '../assets/feed-bottle-ui.png'
import juiceUrl from '../assets/feed-carton-centered.png'
import coinUrl from '../assets/lazy-dojo/sprites/bonuses/kovu-coin.png'
import { DRINKS, type DrinkId } from '../game/drinks'
import { formatCubCash } from '../game/formatCubCash'
import { barIsFull } from '../game/progress'
import type { CubController } from '../game/useCub'
import { isDemo } from '../game/demo'
import { DemoLockBanner } from './DemoLockBanner'
import { EnergyBar } from './EnergyBar'
import { NftGallery } from './NftGallery'
import { SHOP_NFTS } from '../game/nfts'
import { GamesButton, HomeButton } from './HomeButton'

type Props = {
  cub: CubController
  onBack: () => void
  onGames: () => void
}

export function ShopScreen({ cub, onBack, onGames }: Props) {
  const save = cub.save
  const [note, setNote] = useState<string | null>(null)
  const [buying, setBuying] = useState<DrinkId | null>(null)
  const [nftsOpen, setNftsOpen] = useState(false)
  if (!save) return null
  if (nftsOpen) return <NftGallery onBack={() => setNftsOpen(false)} />
  const full = barIsFull(save.energy)
  const demo = isDemo()

  const buy = (drink: DrinkId) => {
    if (buying) return
    setBuying(drink)
    setNote(null)
    void cub.buyDrink(drink).then((result) => {
      setBuying(null)
      if (result.ok) {
        setNote(`${DRINKS[drink].label} restored ${DRINKS[drink].restore}.`)
        return
      }
      if (result.reason === 'broke') setNote('Not enough Cub Cash.')
      else if (result.reason === 'full') setNote('Energy is already full.')
      else setNote('The shop could not pour that drink.')
    })
  }

  return (
    <section className={demo ? 'game-screen shop-screen demo-locked' : 'game-screen shop-screen'}>
      <header className="top shop-top">
        <div className="shop-nav">
          <HomeButton className="game-home" onClick={onBack} />
          <GamesButton className="game-home" onClick={onGames} />
        </div>
        <h1>Shop</h1>
        <div className="cub-cash" aria-label={`${formatCubCash(save.cubCash)} Cub Cash`}>
          <span className="cub-cash-inner">
            <img src={coinUrl} alt="" />
            <strong>{formatCubCash(save.cubCash)}</strong>
          </span>
        </div>
      </header>
      <EnergyBar energy={save.energy} />
      {demo ? <DemoLockBanner text="Create an account to use the shop." /> : null}
      <div className="shop-drinks">
        <DrinkCard
          image={milkUrl}
          drink="milk"
          disabled={demo || full || buying !== null || save.cubCash < DRINKS.milk.price}
          busy={buying === 'milk'}
          onBuy={() => buy('milk')}
        />
        <DrinkCard
          image={juiceUrl}
          drink="juice"
          disabled={demo || full || buying !== null || save.cubCash < DRINKS.juice.price}
          busy={buying === 'juice'}
          onBuy={() => buy('juice')}
        />
      </div>
      {SHOP_NFTS.length > 0 ? (
        <button type="button" className="shop-nft-open" onClick={() => setNftsOpen(true)}>
          <span className="shop-nft-stack" aria-hidden="true">
            {SHOP_NFTS.slice(0, 3).map((nft) => (
              <img key={nft.number} src={nft.src} alt="" />
            ))}
          </span>
          <span className="shop-nft-copy">
            <strong>Lazy Cubs NFT's</strong>
            <em>Play &amp; Earn Real NFT's!</em>
          </span>
          <span className="nft-soon">Coming soon</span>
        </button>
      ) : null}
      <p className="shop-note">{note ?? 'Tip: Put your cub to sleep to recover energy'}</p>
    </section>
  )
}

function DrinkCard({
  image,
  drink,
  disabled,
  busy,
  onBuy,
}: {
  image: string
  drink: DrinkId
  disabled: boolean
  busy: boolean
  onBuy: () => void
}) {
  const item = DRINKS[drink]
  return (
    <button type="button" className="shop-drink" disabled={disabled} onClick={onBuy}>
      <img src={image} alt="" />
      <span>
        <strong>{item.label}</strong>
        <em>{item.restore}</em>
      </span>
      <span className="shop-price" aria-label={`Special offer. Usual price ${item.usual} coins, now ${item.price}.`}>
        <span className="shop-offer">Special offer</span>
        <span className="shop-price-row">
          <s className="shop-usual">{item.usual}</s>
          <img src={coinUrl} alt="" />
          {busy ? '...' : item.price}
        </span>
      </span>
    </button>
  )
}
