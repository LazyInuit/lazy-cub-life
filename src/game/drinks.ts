/** `price` is what the shop charges and must match buy_drink in supabase/coins.sql. `usual` is the normal price shown crossed out. */
export const DRINKS = {
  milk: { id: 'milk', label: 'Milk', energy: 50, restore: '+50% Energy', price: 1, usual: 15 },
  juice: { id: 'juice', label: 'Juice', energy: 100, restore: '+100% Energy', price: 2, usual: 25 },
} as const

export type DrinkId = keyof typeof DRINKS

export const LOW_ENERGY_NOTE = 'Sleep or visit the shop to recover energy.'
