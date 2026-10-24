import milkUrl from '../assets/nfts/drinks/milk-1.jpg'
import juiceUrl from '../assets/nfts/drinks/juice-1.jpg'

/** Cub numbers given away or sold, which must not be listed. */
const HELD_BACK = new Set([17948, 21715])

const images = import.meta.glob<string>(['../assets/nfts/nft-*.jpg', '!../assets/nfts/nft-17948.jpg', '!../assets/nfts/nft-21715.jpg'], {
  eager: true,
  import: 'default',
})

export type ShopNft = {
  key: string
  kind: 'drink' | 'cub'
  /** Short label on the card, such as "#1027" or "Milk". */
  tag: string
  /** Full name in the enlarged view. */
  name: string
  src: string
}

/** Drink NFTs open the gallery, Milk first. */
const DRINK_NFTS: ShopNft[] = [
  { key: 'milk-1', kind: 'drink', tag: 'Milk', name: 'Milk', src: milkUrl },
  { key: 'juice-1', kind: 'drink', tag: 'Juice', name: 'Juice', src: juiceUrl },
]

const CUB_NFTS: ShopNft[] = Object.entries(images)
  .map(([path, src]) => ({ number: Number(path.match(/nft-(\d+)\.jpg$/)?.[1] ?? NaN), src }))
  .filter((nft) => Number.isFinite(nft.number) && !HELD_BACK.has(nft.number))
  .sort((a, b) => a.number - b.number)
  .map((nft) => ({
    key: `cub-${nft.number}`,
    kind: 'cub' as const,
    tag: `#${nft.number}`,
    name: `Lazy Lion Cub #${nft.number}`,
    src: nft.src,
  }))

/** Everything on offer in the NFT shop: the drinks, then the cubs in collection-number order. */
export const SHOP_NFTS: ShopNft[] = [...DRINK_NFTS, ...CUB_NFTS]

/** Cubs for the shop's preview stack. */
export const SHOP_CUB_NFTS = CUB_NFTS
