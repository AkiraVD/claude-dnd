import { formatCoin } from '@dnd/engine'
import { useState } from 'react'
import { itemArtFor } from './art.js'
import type { Shop as ShopData } from './useTable.js'
import type { JSX } from 'react'

/**
 * The counter.
 *
 * An input device, not a second source of truth: the browser cannot write to the
 * campaign, so picking here composes a message and the DM puts it through `buy`,
 * where the engine checks affordability again. The running total is shown so the
 * refusal never comes as a surprise, not so that it can be trusted.
 */
export function Shop({
  shop,
  onSend,
  onClose,
}: {
  shop: ShopData
  onSend: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [cart, setCart] = useState<Record<string, number>>({})
  const [offering, setOffering] = useState<Record<string, boolean>>({})

  const cost = shop.stock.reduce((sum, item) => sum + item.price * (cart[item.name] ?? 0), 0)
  const offered = shop.pack.filter((item) => offering[item.name] === true)
  const lines = shop.stock.filter((item) => (cart[item.name] ?? 0) > 0)

  // The vendor names a price for what you trade in; until then this is only a
  // list of what you are putting on the counter.
  const short = cost > shop.buyer.purse
  const canSend = lines.length > 0 || offered.length > 0

  const step = (name: string, by: number, max: number): void =>
    setCart({ ...cart, [name]: Math.max(0, Math.min(max, (cart[name] ?? 0) + by)) })

  const send = (): void => {
    const bought = lines.map((item) => `${item.name} ×${cart[item.name] ?? 0}`)
    const parts: string[] = []
    if (bought.length > 0) parts.push(`I buy ${bought.join(', ')} — ${formatCoin(cost)}.`)
    if (offered.length > 0) {
      parts.push(`I offer ${offered.map((item) => item.name).join(', ')} against it.`)
    }
    onSend(parts.join(' '))
  }

  const who = [shop.vendor.race, shop.vendor.role, shop.vendor.location]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')

  return (
    <div className="scrim">
      <div className="modal modal-shop">
        <div className="modal-head">
          <h3>{shop.vendor.name}</h3>
          {who !== '' && <span className="modal-sub">{who}</span>}
          {shop.vendor.attitude !== null && (
            <span className={`chip ${attitudeClass(shop.vendor.attitude)}`}>
              {shop.vendor.attitude}
            </span>
          )}
        </div>

        <div className="modal-body">
          <div className="shop-cols">
            <div className="shop-col">
              <div className="col-head">
                <span>Their stock</span>
                <span className="right">price each</span>
              </div>
              <div className="goods">
                {shop.stock.map((item) => {
                  const taken = cart[item.name] ?? 0
                  return (
                    <div
                      key={item.name}
                      className={`good${taken > 0 ? ' picked' : ''}${item.qty === 0 ? ' out' : ''}`}
                    >
                      <div className="name">
                        {itemArtFor(item.name) !== null && (
                          <span
                            className="item-art"
                            role="presentation"
                            style={{
                              WebkitMaskImage: `url(${itemArtFor(item.name)!})`,
                              maskImage: `url(${itemArtFor(item.name)!})`,
                            }}
                          />
                        )}
                        {item.name}
                        <em>{item.qty === 0 ? 'sold out' : (item.notes ?? `${item.qty} in stock`)}</em>
                      </div>
                      <div className="price">{formatCoin(item.price)}</div>
                      <div className="stepper">
                        <button
                          type="button"
                          aria-label={`One fewer ${item.name}`}
                          disabled={taken === 0}
                          onClick={() => step(item.name, -1, item.qty)}
                        >
                          −
                        </button>
                        <span className={`n${taken === 0 ? ' zero' : ''}`}>{taken}</span>
                        <button
                          type="button"
                          aria-label={`One more ${item.name}`}
                          disabled={taken >= item.qty}
                          onClick={() => step(item.name, 1, item.qty)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="shop-col">
              {shop.canTradeIn && shop.pack.length > 0 && (
                <>
                  <div className="col-head">
                    <span>Your pack</span>
                    <span className="right">offer against it</span>
                  </div>
                  <div className="goods">
                    {shop.pack.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className="sellable"
                        aria-pressed={offering[item.name] === true}
                        onClick={() =>
                          setOffering({ ...offering, [item.name]: offering[item.name] !== true })
                        }
                      >
                        <span className="tick">{offering[item.name] === true ? '✓' : ''}</span>
                        <span className="name">
                          {itemArtFor(item.name) !== null && (
                            <span
                            className="item-art"
                            role="presentation"
                            style={{
                              WebkitMaskImage: `url(${itemArtFor(item.name)!})`,
                              maskImage: `url(${itemArtFor(item.name)!})`,
                            }}
                          />
                          )}
                          {item.name}
                        </span>
                        <span className="offer">×{item.qty}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="ledger">
                <div>
                  <span className="k">Purse</span>
                  <span className="v">{formatCoin(shop.buyer.purse)}</span>
                </div>
                <div>
                  <span className="k">Basket</span>
                  <span className="v">{cost > 0 ? `− ${formatCoin(cost)}` : '—'}</span>
                </div>
                {short ? (
                  <div className="total shortfall">
                    <span className="k">Short by</span>
                    <span className="v">{formatCoin(cost - shop.buyer.purse)}</span>
                  </div>
                ) : (
                  <div className="total">
                    <span className="k">After</span>
                    <span className="v">{formatCoin(shop.buyer.purse - cost)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="brief">
            {short ? (
              <>
                <b>Needs </b>
                {formatCoin(cost)}, you have {formatCoin(shop.buyer.purse)}
                {offered.length > 0 && ' — offer something and let them name a price'}
              </>
            ) : canSend ? (
              <>
                <b>Sends: </b>
                {lines.length} to buy
                {offered.length > 0 && `, ${offered.length} offered`}
              </>
            ) : (
              'Nothing selected.'
            )}
          </div>
          <button className="ghost" type="button" onClick={onClose}>
            Leave
          </button>
          <button
            className="primary"
            type="button"
            disabled={!canSend || (short && offered.length === 0)}
            onClick={send}
          >
            {lines.length > 0 ? `Buy ${lines.length}` : 'Offer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function attitudeClass(attitude: string): string {
  switch (attitude) {
    case 'hostile':
      return 'chip-bad'
    case 'unfriendly':
      return 'chip-crit'
    case 'friendly':
    case 'helpful':
      return 'chip-good'
    default:
      return 'chip-faint'
  }
}
