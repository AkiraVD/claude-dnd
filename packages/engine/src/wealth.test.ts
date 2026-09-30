import { describe, expect, it } from 'vitest'
import { COMMONER, createCreature, type Creature } from './character.js'
import { RulesError } from './errors.js'
import {
  buy,
  earn,
  findItem,
  formatCoin,
  giveItem,
  parseCoin,
  sell,
  spend,
  stockFor,
  takeItem,
} from './wealth.js'

const someone = (name: string, overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({
    id: name.toLowerCase(),
    name,
    scores: COMMONER.scores,
    maxHp: COMMONER.maxHp,
    ac: COMMONER.ac,
    ...overrides,
  })

describe('parseCoin', () => {
  const table: Array<[string | number, number]> = [
    ['1 cp', 1],
    ['5 sp', 50],
    ['1 gp', 100],
    ['1 pp', 1000],
    ['1 ep', 50],
    ['12 gp 4 sp', 1240],
    ['12gp4sp', 1240],
    ['1 gp 5 sp 3 cp', 153],
    ['5 gold and 2 cp', 502],
    ['1 gp + 5 sp', 150],
    ['1,250 gp', 125000],
    ['  2 GP  ', 200],
    ['50', 50],
    [50, 50],
    [0, 0],
  ]

  for (const [input, expected] of table) {
    it(`reads ${JSON.stringify(input)} as ${expected} cp`, () => {
      expect(parseCoin(input)).toBe(expected)
    })
  }

  it('refuses what it cannot read rather than guessing', () => {
    expect(() => parseCoin('a fistful')).toThrow(RulesError)
    expect(() => parseCoin('5 zz')).toThrow(/unknown coin/)
    expect(() => parseCoin('')).toThrow(RulesError)
    expect(() => parseCoin(1.5)).toThrow(RulesError)
  })
})

describe('formatCoin', () => {
  const table: Array<[number, string]> = [
    [0, '0 cp'],
    [1, '1 cp'],
    [50, '5 sp'],
    [100, '1 gp'],
    [150, '1 gp 5 sp'],
    [840, '8 gp 4 sp'],
    [1000, '10 gp'],
    [1234, '12 gp 3 sp 4 cp'],
    [-150, '-1 gp 5 sp'],
  ]

  for (const [input, expected] of table) {
    it(`writes ${input} cp as ${expected}`, () => {
      expect(formatCoin(input)).toBe(expected)
    })
  }

  it('round-trips through parseCoin', () => {
    for (const cp of [0, 1, 9, 10, 99, 100, 101, 840, 1234, 99999]) {
      expect(parseCoin(formatCoin(cp))).toBe(cp)
    }
  })
})

describe('the purse', () => {
  it('takes coin in', () => {
    const result = earn(someone('Brann'), '2 gp', 'sold a cloak')

    expect(result.balance).toBe(200)
    expect(result.creature.purse).toBe(200)
    expect(result.events).toEqual([
      { t: 'coin', target: 'brann', delta: 200, balance: 200, reason: 'sold a cloak' },
    ])
  })

  it('pays coin out', () => {
    const rich = someone('Brann', { purse: '5 gp' })
    const result = spend(rich, '1 gp 5 sp')

    expect(result.creature.purse).toBe(350)
    expect(result.events[0]).toMatchObject({ t: 'coin', delta: -150, balance: 350 })
  })

  it('refuses to spend what is not there, and says what is', () => {
    const poor = someone('Brann', { purse: '8 sp' })

    expect(() => spend(poor, '1 gp')).toThrow(/cannot afford 1 gp — carrying 8 sp/)
  })

  it('leaves the original creature untouched', () => {
    const before = someone('Brann', { purse: 500 })
    earn(before, 100)
    spend(before, 100)

    expect(before.purse).toBe(500)
  })
})

describe('the pack', () => {
  it('adds an item', () => {
    const { creature, events } = giveItem(someone('Brann'), { name: 'Torch', qty: 3 })

    expect(creature.items).toEqual([{ name: 'Torch', qty: 3 }])
    expect(events).toEqual([{ t: 'item', target: 'brann', item: 'Torch', delta: 3, qty: 3 }])
  })

  it('stacks onto a matching name instead of adding a second row', () => {
    const one = giveItem(someone('Brann'), { name: 'Torch', qty: 3 })
    const two = giveItem(one.creature, { name: 'torch', qty: 2 })

    expect(two.creature.items).toEqual([{ name: 'Torch', qty: 5 }])
  })

  it('keeps the note and price a stack already carried', () => {
    const one = giveItem(someone('Bargha'), { name: 'Torch', price: '1 cp', notes: 'pitch-dipped' })
    const two = giveItem(one.creature, { name: 'Torch', qty: 4 })

    expect(two.creature.items[0]).toEqual({
      name: 'Torch',
      qty: 5,
      notes: 'pitch-dipped',
      price: 1,
    })
  })

  it('removes part of a stack', () => {
    const stocked = giveItem(someone('Brann'), { name: 'Torch', qty: 5 }).creature
    const { creature, events } = takeItem(stocked, 'Torch', 2)

    expect(creature.items).toEqual([{ name: 'Torch', qty: 3 }])
    expect(events[0]).toMatchObject({ delta: -2, qty: 3 })
  })

  it('drops the row when the last one goes', () => {
    const stocked = giveItem(someone('Brann'), { name: 'Torch', qty: 2 }).creature

    expect(takeItem(stocked, 'Torch', 2).creature.items).toEqual([])
  })

  it('refuses to remove what is not carried', () => {
    const stocked = giveItem(someone('Brann'), { name: 'Torch' }).creature

    expect(() => takeItem(stocked, 'Rope')).toThrow(/not carrying "Rope". Has: Torch/)
    expect(() => takeItem(stocked, 'Torch', 4)).toThrow(/has 1 × Torch, cannot remove 4/)
  })

  it('lists only what is priced as stock', () => {
    let bargha = giveItem(someone('Bargha'), { name: 'Rope', price: '1 gp' }).creature
    bargha = giveItem(bargha, { name: 'Her own boots' }).creature

    expect(stockFor(bargha).map((i) => i.name)).toEqual(['Rope'])
  })
})

describe('buying', () => {
  const vendor = (): Creature => {
    let bargha = someone('Bargha', { purse: '10 gp' })
    bargha = giveItem(bargha, { name: 'Rope, 50 ft', qty: 1, price: '1 gp' }).creature
    bargha = giveItem(bargha, { name: 'Torch', qty: 8, price: '1 cp' }).creature
    return bargha
  }

  it('moves goods one way and coin the other', () => {
    const buyer = someone('Brann', { purse: '8 gp 4 sp' })
    const result = buy(buyer, vendor(), [{ name: 'Rope, 50 ft' }, { name: 'Torch', qty: 2 }])

    expect(result.total).toBe(102)
    expect(result.buyer.purse).toBe(840 - 102)
    expect(findItem(result.buyer, 'Rope, 50 ft')?.qty).toBe(1)
    expect(findItem(result.buyer, 'Torch')?.qty).toBe(2)

    expect(result.vendor?.purse).toBe(1000 + 102)
    expect(findItem(result.vendor!, 'Rope, 50 ft')).toBeUndefined()
    expect(findItem(result.vendor!, 'Torch')?.qty).toBe(6)
  })

  it('falls back to the price the vendor has listed', () => {
    const result = buy(someone('Brann', { purse: '5 gp' }), vendor(), [{ name: 'Rope, 50 ft' }])

    expect(result.total).toBe(100)
  })

  it('takes an explicit price over the listed one, for haggling', () => {
    const result = buy(someone('Brann', { purse: '5 gp' }), vendor(), [
      { name: 'Rope, 50 ft', unitPrice: '8 sp' },
    ])

    expect(result.total).toBe(80)
  })

  it('refuses the whole basket when the purse is short, changing nothing', () => {
    const buyer = someone('Brann', { purse: '5 sp' })
    const bargha = vendor()

    expect(() => buy(buyer, bargha, [{ name: 'Rope, 50 ft' }, { name: 'Torch' }])).toThrow(
      /cannot afford 1 gp 1 cp — carrying 5 sp/,
    )
    expect(buyer.purse).toBe(50)
    expect(buyer.items).toEqual([])
    expect(findItem(bargha, 'Rope, 50 ft')?.qty).toBe(1)
  })

  it('refuses to sell stock that is not there', () => {
    const buyer = someone('Brann', { purse: '50 gp' })

    expect(() => buy(buyer, vendor(), [{ name: 'Rope, 50 ft', qty: 2 }])).toThrow(
      /has only 1 × Rope, 50 ft, not 2/,
    )
    expect(() => buy(buyer, vendor(), [{ name: "Healer's kit" }])).toThrow(
      /Bargha has no "Healer's kit"/,
    )
  })

  it('works with no vendor on the other side of the counter', () => {
    const result = buy(someone('Brann', { purse: '5 gp' }), null, [
      { name: 'Ale', qty: 2, unitPrice: '4 cp' },
    ])

    expect(result.vendor).toBeNull()
    expect(result.buyer.purse).toBe(492)
    expect(findItem(result.buyer, 'Ale')?.qty).toBe(2)
  })

  it('demands a price when neither side names one', () => {
    expect(() => buy(someone('Brann', { purse: 100 }), null, [{ name: 'Ale' }])).toThrow(
      /no price given and none listed/,
    )
  })

  it('records the trade as one event', () => {
    const result = buy(someone('Brann', { purse: '5 gp' }), vendor(), [{ name: 'Torch', qty: 3 }])
    const trade = result.events.find((e) => e.t === 'trade')

    expect(trade).toEqual({
      t: 'trade',
      buyer: 'brann',
      vendor: 'bargha',
      total: 3,
      lines: [{ name: 'Torch', qty: 3, unitPrice: 1 }],
    })
  })
})

describe('selling', () => {
  it('hands goods over and takes coin', () => {
    const seller = giveItem(someone('Brann'), { name: 'Goblin cleaver' }).creature
    const bargha = someone('Bargha', { purse: '10 gp' })

    const result = sell(seller, bargha, [{ name: 'Goblin cleaver', unitPrice: '8 sp' }])

    expect(result.buyer.purse).toBe(80)
    expect(result.buyer.items).toEqual([])
    expect(result.vendor?.purse).toBe(1000 - 80)
    expect(findItem(result.vendor!, 'Goblin cleaver')?.qty).toBe(1)
  })

  it('refuses to sell what is not carried', () => {
    expect(() => sell(someone('Brann'), null, [{ name: 'Crown', unitPrice: 1 }])).toThrow(
      /not carrying "Crown"/,
    )
  })

  it('refuses when the vendor cannot pay', () => {
    const seller = giveItem(someone('Brann'), { name: 'Silver locket' }).creature
    const broke = someone('Bargha', { purse: '2 sp' })

    expect(() => sell(seller, broke, [{ name: 'Silver locket', unitPrice: '3 gp' }])).toThrow(
      /cannot pay 3 gp — carrying 2 sp/,
    )
    expect(seller.items).toHaveLength(1)
  })
})
