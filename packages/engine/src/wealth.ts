/**
 * Coin and carried goods.
 *
 * Money is the thing a DM loses track of fastest — three hours in, nobody
 * remembers whether the rope was paid for. So the purse is a single integer of
 * copper and every movement of it goes through here. Storing five denominations
 * separately is how you end up short 1 gp while holding 400 cp; coins are
 * fungible, so the engine converts only at the edges.
 *
 * Inventory is a ledger, not equipment. Buying a longsword puts it in the pack;
 * it does not create an attack. Wielding something stays an explicit act.
 */
import type { Creature } from './character.js'
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'

/** Copper value of each denomination. */
export const COIN_UNITS: Readonly<Record<string, number>> = {
  pp: 1000,
  platinum: 1000,
  gp: 100,
  gold: 100,
  ep: 50,
  electrum: 50,
  sp: 10,
  silver: 10,
  cp: 1,
  copper: 1,
}

export interface Item {
  readonly name: string
  readonly qty: number
  readonly notes?: string
  /**
   * What the holder sells it for, in copper. Set on a vendor's stock; absent on
   * an ordinary possession, which is simply not for sale.
   */
  readonly price?: number
}

/**
 * Reads "12 gp 4 sp", "1gp", "5 gold and 2 cp", or a bare number of copper.
 *
 * Deliberately forgiving about what the DM types and completely unforgiving
 * about what it cannot read — a silently mis-parsed price is worse than an error.
 */
export function parseCoin(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new RulesError(`coin must be a whole number of copper, got ${input}`)
    }
    return input
  }

  const text = input
    .trim()
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\band\b|\+/g, ' ')
    .trim()

  if (text === '') throw new RulesError('no amount of coin given')

  const pattern = /(\d+)\s*([a-z]*)\s*/y
  let total = 0
  let index = 0

  while (index < text.length) {
    pattern.lastIndex = index
    const match = pattern.exec(text)
    const digits = match?.[1]
    if (match === null || digits === undefined) {
      throw new RulesError(`cannot read "${input}" as an amount of coin`)
    }
    const unit = match[2] === undefined || match[2] === '' ? 'cp' : match[2]
    const value = COIN_UNITS[unit]
    if (value === undefined) {
      throw new RulesError(`unknown coin "${unit}" in "${input}"`)
    }
    total += Number(digits) * value
    index = pattern.lastIndex
  }

  return total
}

/**
 * Copper back into the denominations people speak in. Platinum and electrum
 * parse but never come back out — "12 gp" is what a player expects to hear.
 */
export function formatCoin(cp: number): string {
  if (!Number.isInteger(cp)) {
    throw new RulesError(`coin must be a whole number of copper, got ${cp}`)
  }
  if (cp < 0) return `-${formatCoin(-cp)}`
  if (cp === 0) return '0 cp'

  const parts: string[] = []
  const gp = Math.floor(cp / 100)
  const sp = Math.floor((cp % 100) / 10)
  const rest = cp % 10
  if (gp > 0) parts.push(`${gp} gp`)
  if (sp > 0) parts.push(`${sp} sp`)
  if (rest > 0) parts.push(`${rest} cp`)
  return parts.join(' ')
}

export interface PurseOutcome {
  creature: Creature
  /** Copper moved. Positive when gained, negative when spent. */
  delta: number
  balance: number
  events: GameEvent[]
}

function coinEvent(
  creature: Creature,
  delta: number,
  balance: number,
  reason: string | undefined,
): GameEvent {
  return {
    t: 'coin',
    target: creature.id,
    delta,
    balance,
    ...(reason === undefined ? {} : { reason }),
  }
}

export function earn(creature: Creature, amount: string | number, reason?: string): PurseOutcome {
  const cp = parseCoin(amount)
  if (cp < 0) throw new RulesError(`cannot earn a negative amount (${formatCoin(cp)})`)

  const balance = creature.purse + cp
  return {
    creature: { ...creature, purse: balance },
    delta: cp,
    balance,
    events: [coinEvent(creature, cp, balance, reason)],
  }
}

export function spend(creature: Creature, amount: string | number, reason?: string): PurseOutcome {
  const cp = parseCoin(amount)
  if (cp < 0) throw new RulesError(`cannot spend a negative amount (${formatCoin(cp)})`)
  if (cp > creature.purse) {
    throw new RulesError(
      `${creature.name} cannot afford ${formatCoin(cp)} — carrying ${formatCoin(creature.purse)}`,
    )
  }

  const balance = creature.purse - cp
  return {
    creature: { ...creature, purse: balance },
    delta: -cp,
    balance,
    events: [coinEvent(creature, -cp, balance, reason)],
  }
}

export function findItem(creature: Creature, name: string): Item | undefined {
  const wanted = name.trim().toLowerCase()
  return creature.items.find((item) => item.name.toLowerCase() === wanted)
}

export interface ItemOutcome {
  creature: Creature
  item: Item
  events: GameEvent[]
}

/**
 * Adds to the pack, stacking onto a matching name rather than creating a second
 * "Torch" row. A price given here marks it as stock the holder will sell.
 */
export function giveItem(
  creature: Creature,
  input: { name: string; qty?: number; notes?: string; price?: string | number },
): ItemOutcome {
  const name = input.name.trim()
  const qty = input.qty ?? 1

  if (name === '') throw new RulesError('an item needs a name')
  if (!Number.isInteger(qty) || qty < 1) {
    throw new RulesError(`${name}: quantity must be a positive integer, got ${qty}`)
  }

  const price = input.price === undefined ? undefined : parseCoin(input.price)
  if (price !== undefined && price < 0) {
    throw new RulesError(`${name}: price cannot be negative`)
  }

  const existing = findItem(creature, name)

  // A note or price passed now wins; otherwise the stack keeps what it had.
  const notes = input.notes ?? existing?.notes
  const settledPrice = price ?? existing?.price

  const merged: Item = {
    name: existing?.name ?? name,
    qty: (existing?.qty ?? 0) + qty,
    ...(notes === undefined ? {} : { notes }),
    ...(settledPrice === undefined ? {} : { price: settledPrice }),
  }

  const items =
    existing === undefined
      ? [...creature.items, merged]
      : creature.items.map((item) => (item === existing ? merged : item))

  return {
    creature: { ...creature, items },
    item: merged,
    events: [{ t: 'item', target: creature.id, item: merged.name, delta: qty, qty: merged.qty }],
  }
}

/** Removes from the pack, dropping the row when the last one goes. */
export function takeItem(creature: Creature, name: string, qty = 1): ItemOutcome {
  if (!Number.isInteger(qty) || qty < 1) {
    throw new RulesError(`${name}: quantity must be a positive integer, got ${qty}`)
  }

  const existing = findItem(creature, name)
  if (existing === undefined) {
    const carried = creature.items.map((item) => item.name)
    throw new RulesError(
      `${creature.name} is not carrying "${name}". Has: ${carried.length > 0 ? carried.join(', ') : '(nothing)'}`,
    )
  }
  if (existing.qty < qty) {
    throw new RulesError(
      `${creature.name} has ${existing.qty} × ${existing.name}, cannot remove ${qty}`,
    )
  }

  const left: Item = { ...existing, qty: existing.qty - qty }
  const items =
    left.qty === 0
      ? creature.items.filter((item) => item !== existing)
      : creature.items.map((item) => (item === existing ? left : item))

  return {
    creature: { ...creature, items },
    item: left,
    events: [{ t: 'item', target: creature.id, item: existing.name, delta: -qty, qty: left.qty }],
  }
}

export interface TradeLine {
  name: string
  qty?: number
  /** Per unit. Falls back to the vendor's listed price. */
  unitPrice?: string | number
}

export interface TradeOutcome {
  buyer: Creature
  /** Null when the other side of the counter is not a tracked creature. */
  vendor: Creature | null
  total: number
  events: GameEvent[]
}

interface ResolvedLine {
  name: string
  qty: number
  unitPrice: number
}

function resolve(
  lines: readonly TradeLine[],
  stockHolder: Creature | null,
  what: string,
): ResolvedLine[] {
  if (lines.length === 0) throw new RulesError(`nothing to ${what}`)

  return lines.map((line) => {
    const name = line.name.trim()
    if (name === '') throw new RulesError('an item needs a name')

    const qty = line.qty ?? 1
    if (!Number.isInteger(qty) || qty < 1) {
      throw new RulesError(`${name}: quantity must be a positive integer, got ${qty}`)
    }

    // Checked before the price, so "she has no healer's kit" beats "no price
    // given" — the second is true but sends you looking in the wrong place.
    const held = stockHolder === null ? undefined : findItem(stockHolder, name)
    if (stockHolder !== null && held === undefined) {
      throw new RulesError(`${stockHolder.name} has no "${name}"`)
    }

    const raw = line.unitPrice ?? held?.price
    if (raw === undefined) {
      throw new RulesError(`${name}: no price given and none listed`)
    }

    const unitPrice = parseCoin(raw)
    if (unitPrice < 0) throw new RulesError(`${name}: price cannot be negative`)

    return { name, qty, unitPrice }
  })
}

/**
 * A whole basket at once, so a purchase can never half-happen. Everything is
 * checked — stock, then affordability — before a single coin or item moves.
 */
export function buy(
  buyer: Creature,
  vendor: Creature | null,
  lines: readonly TradeLine[],
): TradeOutcome {
  const resolved = resolve(lines, vendor, 'buy')
  const total = resolved.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  if (vendor !== null) {
    for (const line of resolved) {
      // `resolve` has already proved the vendor stocks it; only depth is left.
      const held = findItem(vendor, line.name)
      if (held !== undefined && held.qty < line.qty) {
        throw new RulesError(
          `${vendor.name} has only ${held.qty} × ${held.name}, not ${line.qty}`,
        )
      }
    }
  }

  if (total > buyer.purse) {
    throw new RulesError(
      `${buyer.name} cannot afford ${formatCoin(total)} — carrying ${formatCoin(buyer.purse)}`,
    )
  }

  const events: GameEvent[] = []
  let nextBuyer = buyer
  let nextVendor = vendor

  for (const line of resolved) {
    if (nextVendor !== null) {
      const taken = takeItem(nextVendor, line.name, line.qty)
      nextVendor = taken.creature
    }
    const given = giveItem(nextBuyer, { name: line.name, qty: line.qty })
    nextBuyer = given.creature
    events.push(...given.events)
  }

  const paid = spend(nextBuyer, total, 'purchase')
  nextBuyer = paid.creature
  events.push(...paid.events)

  if (nextVendor !== null) {
    const took = earn(nextVendor, total, 'sale')
    nextVendor = took.creature
    events.push(...took.events)
  }

  events.push({
    t: 'trade',
    buyer: buyer.id,
    vendor: vendor === null ? null : vendor.id,
    total,
    lines: resolved,
  })

  return { buyer: nextBuyer, vendor: nextVendor, total, events }
}

/**
 * The same counter from the other side: the seller hands goods over and takes
 * coin. `lines` carry what the vendor is paying, not what they would charge.
 */
export function sell(
  seller: Creature,
  vendor: Creature | null,
  lines: readonly TradeLine[],
): TradeOutcome {
  const resolved = resolve(lines, null, 'sell')
  const total = resolved.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)

  for (const line of resolved) {
    const held = findItem(seller, line.name)
    if (held === undefined) {
      throw new RulesError(`${seller.name} is not carrying "${line.name}"`)
    }
    if (held.qty < line.qty) {
      throw new RulesError(`${seller.name} has only ${held.qty} × ${held.name}, not ${line.qty}`)
    }
  }

  if (vendor !== null && total > vendor.purse) {
    throw new RulesError(
      `${vendor.name} cannot pay ${formatCoin(total)} — carrying ${formatCoin(vendor.purse)}`,
    )
  }

  const events: GameEvent[] = []
  let nextSeller = seller
  let nextVendor = vendor

  for (const line of resolved) {
    const taken = takeItem(nextSeller, line.name, line.qty)
    nextSeller = taken.creature
    events.push(...taken.events)

    if (nextVendor !== null) {
      const given = giveItem(nextVendor, { name: line.name, qty: line.qty })
      nextVendor = given.creature
    }
  }

  const paid = earn(nextSeller, total, 'sale')
  nextSeller = paid.creature
  events.push(...paid.events)

  if (nextVendor !== null) {
    const spent = spend(nextVendor, total, 'purchase')
    nextVendor = spent.creature
    events.push(...spent.events)
  }

  events.push({
    t: 'trade',
    buyer: vendor === null ? null : vendor.id,
    vendor: seller.id,
    total,
    lines: resolved,
  })

  return { buyer: nextSeller, vendor: nextVendor, total, events }
}

/** Everything the holder is currently willing to sell. */
export function stockFor(creature: Creature): Item[] {
  return creature.items.filter((item) => item.price !== undefined)
}
