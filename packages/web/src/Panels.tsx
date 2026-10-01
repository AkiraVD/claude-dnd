import type { Creature } from '@dnd/engine'
import type { TableState } from '@dnd/server/protocol.js'
import { backdropFor, portraitFor } from './art.js'
import type { JSX } from 'react'

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const modifier = (score: number): string => {
  const value = Math.floor((score - 10) / 2)
  return value >= 0 ? `+${value}` : `${value}`
}

export function Panels({ state }: { state: TableState | null }): JSX.Element {
  if (state === null) return <aside className="panels panels-empty">connecting…</aside>

  const party = state.creatures.filter((c) => c.kind === 'pc')
  const others = state.creatures.filter((c) => c.kind !== 'pc')

  return (
    <aside className="panels">
      <SceneCard state={state} />

      {state.combat?.active === true && <Initiative state={state} />}

      {party.map((creature) => (
        <Sheet key={creature.id} creature={creature} full />
      ))}

      {others.length > 0 && (
        <section className="panel">
          <h3>On the board</h3>
          <div className="foes">
            {others.map((creature) => (
              <Foe key={creature.id} creature={creature} />
            ))}
          </div>
        </section>
      )}
    </aside>
  )
}

function SceneCard({ state }: { state: TableState }): JSX.Element {
  const art = backdropFor(state.backdrop, state.scene)

  return (
    <section className={`panel panel-scene${art === null ? '' : ' has-art'}`}>
      {art !== null && (
        <img
          className="scene-art"
          src={art}
          alt=""
          // A backdrop is decoration; if it 404s the scene text must still read.
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      )}
      <div className="scene-body">
        <h2>{state.campaign.name}</h2>
        <p>{state.scene}</p>
      </div>
    </section>
  )
}

function Initiative({ state }: { state: TableState }): JSX.Element {
  const combat = state.combat!
  const byId = new Map(state.creatures.map((c) => [c.id, c]))

  return (
    <section className="panel">
      <h3>
        Round {combat.round}
        <span className="panel-tag">initiative</span>
      </h3>
      <ol className="initiative">
        {combat.order.map((entry, index) => {
          const creature = byId.get(entry.id)
          const status = creature === undefined ? '' : lifeClass(creature)
          return (
            <li
              key={entry.id}
              className={`${index === combat.turnIndex ? 'turn-active' : ''} ${status}`}
            >
              <span className="init-marker">{index === combat.turnIndex ? '▸' : ''}</span>
              <span className="init-name">{entry.name}</span>
              {creature !== undefined && (
                <span className="init-hp">
                  {creature.hp.current}/{creature.hp.max}
                </span>
              )}
              <span className="init-roll">{entry.initiative}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function lifeClass(creature: Creature): string {
  if (creature.death.dead) return 'is-dead'
  if (creature.hp.current === 0) return 'is-dying'
  if (creature.hp.current <= creature.hp.max / 4) return 'is-bloodied'
  return ''
}

function HpBar({ creature }: { creature: Creature }): JSX.Element {
  const ratio = Math.max(0, Math.min(1, creature.hp.current / creature.hp.max))
  const tone = ratio === 0 ? 'hp-out' : ratio <= 0.25 ? 'hp-low' : ratio <= 0.5 ? 'hp-mid' : 'hp-ok'
  const tempRatio = Math.min(1, creature.hp.temp / creature.hp.max)

  return (
    <div className="hp">
      <div className="hp-track">
        <div className={`hp-fill ${tone}`} style={{ width: `${ratio * 100}%` }} />
        {creature.hp.temp > 0 && (
          <div className="hp-temp" style={{ width: `${tempRatio * 100}%` }} />
        )}
      </div>
      <span className="hp-label">
        {creature.hp.current}/{creature.hp.max}
        {creature.hp.temp > 0 && <em> +{creature.hp.temp}</em>}
      </span>
    </div>
  )
}

function Conditions({ creature }: { creature: Creature }): JSX.Element | null {
  // Display labels, not engine conditions: 'dead', 'dying', 'stable' and
  // 'exhaustion N' all belong on a chip but none of them is a SimpleCondition,
  // which is what this array infers as if it is left to the spread.
  const list: string[] = [...creature.conditions.active]
  if (creature.conditions.exhaustion > 0) list.push(`exhaustion ${creature.conditions.exhaustion}`)
  if (creature.death.dead) list.unshift('dead')
  else if (creature.hp.current === 0) list.unshift(creature.death.stable ? 'stable' : 'dying')
  if (list.length === 0) return null

  return (
    <div className="conditions">
      {list.map((condition) => (
        <span key={condition} className="chip chip-cond">
          {condition}
        </span>
      ))}
    </div>
  )
}

function Slots({ creature }: { creature: Creature }): JSX.Element | null {
  if (creature.resources.length === 0) return null

  return (
    <div className="resources">
      {creature.resources.map((resource) => (
        <div key={resource.name} className="resource">
          <span className="resource-label">{resource.label}</span>
          <span className="pips">
            {Array.from({ length: Math.min(resource.max, 12) }, (_, index) => (
              <span
                key={index}
                className={`pip ${index < resource.current ? 'pip-full' : 'pip-spent'}`}
              />
            ))}
            {resource.max > 12 && (
              <span className="resource-count">
                {resource.current}/{resource.max}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function Sheet({ creature, full }: { creature: Creature; full?: boolean }): JSX.Element {
  return (
    <section className={`panel sheet ${lifeClass(creature)}`}>
      <h3>
        {creature.name}
        <span className="panel-tag">
          {creature.className === null ? '' : `${creature.className} `}
          {creature.level}
        </span>
      </h3>

      <HpBar creature={creature} />
      <Conditions creature={creature} />

      <div className="stats">
        <span className="stat">
          <em>AC</em> {creature.ac}
        </span>
        <span className="stat">
          <em>Speed</em> {creature.speed}
        </span>
        {creature.concentration !== null && (
          <span className="stat stat-wide">
            <em>Concentrating</em> {creature.concentration.spell}
          </span>
        )}
      </div>

      {full === true && (
        <>
          <div className="abilities">
            {ABILITIES.map((ability) => (
              <div key={ability} className="ability">
                <span className="ability-name">{ability}</span>
                <span className="ability-mod">{modifier(creature.scores[ability])}</span>
                <span className="ability-score">{creature.scores[ability]}</span>
              </div>
            ))}
          </div>

          <Slots creature={creature} />

          {creature.attacks.length > 0 && (
            <div className="attacks">
              {creature.attacks.map((attack) => (
                <div key={attack.name} className="attack">
                  <span className="attack-name">{attack.name}</span>
                  <code>
                    {attack.damage}
                    {attack.damageBonus !== undefined && attack.damageBonus !== 0
                      ? attack.damageBonus > 0
                        ? `+${attack.damageBonus}`
                        : attack.damageBonus
                      : ''}
                  </code>
                  <span className="attack-type">{attack.damageType}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Foe({ creature }: { creature: Creature }): JSX.Element {
  const portrait = portraitFor(creature.profile.portrait)

  return (
    <div className={`foe ${lifeClass(creature)}`}>
      <span className="foe-name">
        {portrait !== null && (
          <img
            className="foe-face"
            src={portrait}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        )}
        {creature.name}
      </span>
      <HpBar creature={creature} />
      <Conditions creature={creature} />
    </div>
  )
}
