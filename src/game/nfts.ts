/** Cub numbers that are already promised elsewhere and must not be listed. */
const HELD_BACK = new Set([17948])

const images = import.meta.glob<string>(['../assets/nfts/nft-*.jpg', '!../assets/nfts/nft-17948.jpg'], {
  eager: true,
  import: 'default',
})

export type ShopNft = { number: number; src: string }

/** Every NFT cub on offer in the shop, in collection-number order. */
export const SHOP_NFTS: ShopNft[] = Object.entries(images)
  .map(([path, src]) => ({ number: Number(path.match(/nft-(\d+)\.jpg$/)?.[1] ?? NaN), src }))
  .filter((nft) => Number.isFinite(nft.number) && !HELD_BACK.has(nft.number))
  .sort((a, b) => a.number - b.number)
