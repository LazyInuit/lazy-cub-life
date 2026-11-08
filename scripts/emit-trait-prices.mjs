import { readFileSync, writeFileSync } from 'node:fs'
import { rarityCoinPrice, LION_TRAIT_COUNTS } from '../src/game/traitRarity.ts'

const STARTERS = {
  Body: 'Standard',
  Mane: 'Brown',
  Eyes: 'Surprised',
  Mouth: 'Standard',
  Headgear: 'Nothing',
  Bodygear: 'Nothing',
  Earring: 'Nothing',
}

const manifest = JSON.parse(readFileSync(new URL('../public/traits/manifest.json', import.meta.url), 'utf8'))
const names = new Map()
for (const [category, counts] of Object.entries(LION_TRAIT_COUNTS)) {
  names.set(category, new Set(Object.keys(counts)))
}
for (const [category, ages] of Object.entries(manifest)) {
  if (!names.has(category)) names.set(category, new Set())
  const bag = names.get(category)
  for (const list of Object.values(ages)) {
    for (const name of list) bag.add(name)
  }
}

const rows = []
for (const [category, bag] of names) {
  for (const name of [...bag].sort()) {
    if (STARTERS[category] === name) continue
    const price = rarityCoinPrice(category, name)
    if (!price) continue
    for (const age of ['old', 'young']) {
      const literal = [age, category, name].map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')
      rows.push(`  (${literal}, ${price})`)
    }
  }
}

const sqlPath = new URL('../supabase/coins.sql', import.meta.url)
const sql = readFileSync(sqlPath, 'utf8')
const block = `-- BEGIN TRAIT PRICES
truncate public.trait_prices;
insert into public.trait_prices (age, category, name, price) values
${rows.join(',\n')};
-- END TRAIT PRICES
`
const next = sql.replace(/-- BEGIN TRAIT PRICES[\s\S]*-- END TRAIT PRICES\n?/, block)
if (next === sql) throw new Error('Trait price markers were not found')
writeFileSync(sqlPath, next)
console.log(`Wrote ${rows.length} trait prices`)
