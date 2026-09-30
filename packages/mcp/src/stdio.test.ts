import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Spawns the server as a real subprocess, the same way `.mcp.json` does.
 *
 * The in-memory tests cover the tools; this covers the launch path — that the
 * entry point boots, that the stdio transport handshakes, and above all that
 * nothing pollutes stdout. A single stray `console.log` in this package would
 * corrupt the protocol stream and break the game in a way no unit test sees.
 */

let client: Client
let transport: StdioClientTransport
let dir: string

/** Each spawned server gets its own database file, never the project's. */
const spawnEnv = (seed = '99') =>
  ({ ...process.env, DND_SEED: seed, DND_DB: join(dir, `${seed}-${Math.random()}.db`) }) as Record<
    string,
    string
  >

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dnd-stdio-'))
  transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'packages/mcp/src/index.ts'],
    cwd: process.cwd(),
    env: spawnEnv(),
    stderr: 'pipe',
  })
  client = new Client({ name: 'stdio-test', version: '0' })
  await client.connect(transport)
}, 60_000)

afterAll(async () => {
  await client?.close()
  rmSync(dir, { recursive: true, force: true })
})

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text: string }>
  const text = content[0]!.text
  return {
    isError: result.isError === true,
    text,
    data: result.isError === true ? null : (JSON.parse(text) as Record<string, any>),
  }
}

describe('the server as Claude Code launches it', () => {
  it('handshakes and advertises its tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.length).toBeGreaterThanOrEqual(24)
    expect(tools.map((t) => t.name)).toContain('attack_roll')
  })

  it('reports the server identity', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'dnd' })
  })

  it('runs a whole encounter across calls, keeping state between them', async () => {
    await call('add_creature', {
      id: 'brann',
      name: 'Brann',
      kind: 'pc',
      level: 3,
      str: 16,
      dex: 14,
      con: 15,
      int: 10,
      wis: 12,
      cha: 8,
      max_hp: 28,
      ac: 16,
      save_proficiencies: ['str', 'con'],
    })
    await call('add_creature', {
      id: 'goblin-a',
      name: 'Goblin A',
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
      max_hp: 7,
      ac: 15,
    })

    const started = await call('start_combat', { ids: ['brann', 'goblin-a'] })
    expect(started.data!.round).toBe(1)

    // Swing until the goblin is out of the fight. With a d8+3 against 7 HP this
    // terminates quickly, but cap it so a rules regression fails instead of hanging.
    let status = 'alive'
    let swings = 0
    while (status === 'alive' && swings < 12) {
      const result = await call('attack_roll', {
        attacker: 'brann',
        target: 'goblin-a',
        ability: 'str',
        proficient: true,
        damage: '1d8',
        damage_type: 'slashing',
        damage_bonus: 3,
      })
      expect(result.isError).toBe(false)
      status = result.data!.target.status
      swings++
    }

    expect(swings).toBeLessThan(12)
    expect(status).not.toBe('alive')

    // State persisted across every one of those calls.
    const state = await call('get_state')
    expect(state.data!.creatures).toHaveLength(2)
    expect(state.data!.eventsRecorded).toBeGreaterThan(0)

    const events = await call('recent_events', { limit: 50 })
    expect(events.data!.events.some((e: { t: string }) => e.t === 'attack')).toBe(true)
  }, 30_000)

  it('surfaces a rules violation as a failed call rather than dying', async () => {
    const result = await call('next_turn')
    // Combat is running from the previous test, so use a genuine violation.
    const bad = result.isError ? result : await call('heal', { id: 'nobody', amount: 5 })
    expect(bad.isError).toBe(true)
    expect(bad.text).toMatch(/no creature with id|no combat/)
  })

  it('resumes a campaign across a real process restart', async () => {
    const shared = join(dir, 'resume.db')
    const env = { ...process.env, DND_SEED: '1234', DND_DB: shared } as Record<string, string>

    const spawn = async () => {
      const t = new StdioClientTransport({
        command: 'npx',
        args: ['tsx', 'packages/mcp/src/index.ts'],
        cwd: process.cwd(),
        env,
        stderr: 'pipe',
      })
      const c = new Client({ name: 'resume', version: '0' })
      await c.connect(t)
      return c
    }

    const first = await spawn()
    await first.callTool({
      name: 'add_creature',
      arguments: {
        id: 'thora',
        name: 'Thora',
        kind: 'pc',
        level: 2,
        str: 15,
        dex: 12,
        con: 14,
        int: 10,
        wis: 13,
        cha: 8,
        max_hp: 20,
        ac: 15,
      },
    })
    await first.callTool({
      name: 'apply_damage',
      arguments: { id: 'thora', amount: 6, damage_type: 'piercing' },
    })
    await first.callTool({ name: 'set_scene', arguments: { scene: 'Halfway up the cliff path.' } })
    await first.close()

    // The process is gone. A new one, same database, nothing passed in.
    const second = await spawn()
    const result = await second.callTool({
      name: 'get_character_sheet',
      arguments: { id: 'thora' },
    })
    const sheet = JSON.parse((result.content as Array<{ text: string }>)[0]!.text)

    expect(sheet.sheet.name).toBe('Thora')
    expect(sheet.sheet.hp).toEqual({ current: 14, max: 20, temp: 0 })

    const state = await second.callTool({ name: 'get_state', arguments: {} })
    expect(JSON.parse((state.content as Array<{ text: string }>)[0]!.text).scene).toBe(
      'Halfway up the cliff path.',
    )
    await second.close()
  }, 90_000)

  it('pins the dice to DND_SEED', async () => {
    // Two servers, each with its own empty database and the same seed, must
    // produce the same dice.
    const fresh = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'packages/mcp/src/index.ts'],
      cwd: process.cwd(),
      env: spawnEnv('4242'),
      stderr: 'pipe',
    })
    const other = new Client({ name: 'seed-test', version: '0' })
    await other.connect(fresh)

    const roll = async (c: Client) => {
      const r = await c.callTool({ name: 'roll_dice', arguments: { notation: '5d20' } })
      return (r.content as Array<{ text: string }>)[0]!.text
    }

    const a = await roll(other)
    await other.close()

    const third = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'packages/mcp/src/index.ts'],
      cwd: process.cwd(),
      env: spawnEnv('4242'),
      stderr: 'pipe',
    })
    const last = new Client({ name: 'seed-test-2', version: '0' })
    await last.connect(third)
    const b = await roll(last)
    await last.close()

    expect(b).toBe(a)
  }, 60_000)
})
