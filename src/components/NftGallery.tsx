import { useEffect, useState } from 'react'
import { SHOP_NFTS, type ShopNft } from '../game/nfts'

type Props = {
  onBack: () => void
}

/** Every NFT cub on offer, shown with no price until sales open. */
export function NftGallery({ onBack }: Props) {
  const [shown, setShown] = useState<ShopNft | null>(null)

  useEffect(() => {
    if (!shown) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShown(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shown])

  return (
    <section className="game-screen shop-screen nft-screen">
      <header className="top shop-top">
        <div className="shop-nav">
          <button type="button" className="game-home nft-back" onClick={onBack} aria-label="Back to the shop">
            <span className="wood-btn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 6 8.5 12l6 6" />
              </svg>
            </span>
          </button>
        </div>
        <h1>Lazy Cubs NFT's</h1>
      </header>
      <p className="nft-soon-banner">
        <strong>Coming soon</strong>
        <span>These Lazy Cubs NFT's will be available to purchase here soon with coins you earn in game!</span>
      </p>
      <ul className="nft-grid">
        {SHOP_NFTS.map((nft) => (
          <li key={nft.key}>
            <button type="button" className="nft-card" onClick={() => setShown(nft)} aria-label={`${nft.name}, coming soon`}>
              <img src={nft.src} alt="" loading="lazy" decoding="async" />
              <span className="nft-card-info">
                <strong>{nft.tag}</strong>
                <span className="nft-soon">Coming soon</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown ? (
        <div className="nft-zoom" role="dialog" aria-modal="true" aria-label={shown.name} onClick={() => setShown(null)}>
          <div className="nft-zoom-card">
            <img src={shown.src} alt={shown.name} />
            <strong>{shown.name}</strong>
            <span className="nft-soon">Coming soon</span>
            <span className="nft-zoom-hint">Tap to close</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
