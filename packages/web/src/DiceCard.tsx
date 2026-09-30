import type { ToolCallView } from '@dnd/server/protocol.js'

/**
 * A mechanical result, rendered as a card rather than read back as prose.
 *
 * This is the whole reason the console is driven by structured events instead of
 * a terminal emulator: the d20 face, the modifier, the AC it beat and the damage
 * are separate fields, so they can be laid out instead of printed.
 */
export function DiceCard({ call }: { call: ToolCallView }): JSX.Element {
  if (call.isError) {
    return (
      <div className="card card-error">
        <div className="card-head">
          <span className="card-tool">{call.name}</span>
          <span className="card-verdict verdict-bad">rejected</span>
        </div>
        <p className="card-reason">{call.narration}</p>
      </div>
    )
  }

  const data = call.data ?? {}
  const attack = data['attackRoll'] as
    | { natural: number; modifier: string; total: number; ac: number; advantage: string }
    | undefined
  const test = data['test'] as
    | { natural: number; modifier: number; total: number; dc?: number; success?: boolean; advantage: string }
    | undefined

  if (attack !== undefined) return <AttackCard call={call} attack={attack} data={data} />
  if (test !== undefined) return <TestCard call={call} test={test} data={data} />
  return <PlainCard call={call} />
}

function Face({ value, size = 'big' }: { value: number; size?: 'big' | 'small' }): JSX.Element {
  const flavour = value === 20 ? 'face-crit' : value === 1 ? 'face-fumble' : ''
  return <span className={`face face-${size} ${flavour}`}>{value}</span>
}

function Advantage({ value }: { value: string }): JSX.Element | null {
  if (value === 'none' || value === undefined) return null
  return <span className={`chip chip-${value === 'advantage' ? 'good' : 'bad'}`}>{value}</span>
}

function AttackCard({
  call,
  attack,
  data,
}: {
  call: ToolCallView
  attack: { natural: number; modifier: string; total: number; ac: number; advantage: string }
  data: Record<string, unknown>
}): JSX.Element {
  const hit = data['hit'] === true
  const critical = data['critical'] === true
  const died = data['died'] === true
  const dropped = data['droppedToZero'] === true
  const weapon = typeof data['weapon'] === 'string' ? data['weapon'] : null
  const target = data['target'] as { name: string; hp: string } | undefined

  return (
    <div className={`card ${critical ? 'card-crit' : hit ? 'card-hit' : 'card-miss'}`}>
      <div className="card-head">
        <span className="card-tool">
          {weapon ?? 'attack'}
          {String(call.input['attacker'] ?? '')} → {String(call.input['target'] ?? '')}
        </span>
        <span className={`card-verdict ${hit ? 'verdict-good' : 'verdict-bad'}`}>
          {critical ? 'critical hit' : hit ? 'hit' : 'miss'}
        </span>
      </div>

      <div className="card-roll">
        <Face value={attack.natural} />
        <span className="card-math">
          {attack.modifier} = <strong>{attack.total}</strong> vs AC {attack.ac}
        </span>
        <Advantage value={attack.advantage} />
      </div>

      {hit && (
        <div className="card-damage">
          {typeof data['damage'] === 'string' && <code>{data['damage'] as string}</code>}
          <strong>{String(data['damageApplied'] ?? 0)}</strong>
          <span>{String(call.input['damage_type'] ?? '')} damage</span>
          {data['mitigation'] !== 'none' && (
            <span className="chip chip-info">{String(data['mitigation'])}</span>
          )}
          {target && <span className="card-target">{target.name} {target.hp}</span>}
        </div>
      )}

      {died && <p className="card-outcome outcome-dead">killed</p>}
      {!died && dropped && <p className="card-outcome outcome-down">down and dying</p>}
      {typeof data['concentrationDc'] === 'number' && (
        <p className="card-outcome">concentration save, DC {data['concentrationDc'] as number}</p>
      )}
    </div>
  )
}

function TestCard({
  call,
  test,
  data,
}: {
  call: ToolCallView
  test: { natural: number; modifier: number; total: number; dc?: number; success?: boolean; advantage: string }
  data: Record<string, unknown>
}): JSX.Element {
  const success = test.success
  const tone = success === undefined ? '' : success ? 'card-hit' : 'card-miss'
  const label = String(call.input['skill'] ?? call.input['ability'] ?? call.name).replace(/_/g, ' ')

  return (
    <div className={`card ${tone}`}>
      <div className="card-head">
        <span className="card-tool">
          {String(call.input['id'] ?? '')} · {label}
        </span>
        {success !== undefined && (
          <span className={`card-verdict ${success ? 'verdict-good' : 'verdict-bad'}`}>
            {success ? 'success' : 'failure'}
          </span>
        )}
      </div>

      <div className="card-roll">
        <Face value={test.natural} />
        <span className="card-math">
          {test.modifier >= 0 ? `+${test.modifier}` : test.modifier} ={' '}
          <strong>{test.total}</strong>
          {test.dc !== undefined && ` vs DC ${test.dc}`}
        </span>
        <Advantage value={test.advantage} />
      </div>

      {data['modifierFrom'] !== undefined && (
        <p className="card-note">{String(data['modifierFrom'])}</p>
      )}
      {Array.isArray(data['advantageFromCreature']) && (
        <p className="card-note">
          from {String(data['armour'] ?? 'conditions')}:{' '}
          {(data['advantageFromCreature'] as string[]).join(', ')}
        </p>
      )}
    </div>
  )
}

function PlainCard({ call }: { call: ToolCallView }): JSX.Element {
  const data = call.data ?? {}
  const order = data['order'] as Array<{ name: string; initiative: number }> | undefined

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-tool">{call.name.replace(/_/g, ' ')}</span>
      </div>
      <p className="card-reason">{call.narration}</p>
      {order !== undefined && (
        <ol className="card-order">
          {order.map((c) => (
            <li key={c.name}>
              <span>{c.name}</span>
              <Face value={c.initiative} size="small" />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
