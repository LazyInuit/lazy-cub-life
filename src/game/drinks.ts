/** Prices must match buy_drink in supabase/coins.sql. */
export const DRINKS = {
  milk: { id: 'milk', label: 'Milk', energy: 50, restore: '+50% Energy', price: 1 },
  juice: { id: 'juice', label: 'Juice', energy: 100, restore: '+100% Energy', price: 2 },
} as const

export type DrinkId = keyof typeof DRINKS

export const LOW_ENERGY_NOTE = 'Sleep or visit the shop to recover energy.'
