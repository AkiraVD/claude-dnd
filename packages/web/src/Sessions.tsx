import { useEffect } from 'react'
import type { CampaignHeader } from '@dnd/server/protocol.js'
import type { JSX } from 'react'

/**
 * The saves, and the two ways out of the one you are in.
 *
 * Both buttons restart the DM rather than talking to the one that is running.
 * The campaign lives in SQLite and is snapshotted after every step, so throwing
 * the conversation away loses nothing — and keeping it across a switch is worse
 * than useless, because a DM that remembers the last campaign will narrate it
 * over the top of the new one.
 */
export function Sessions({
  campaigns,
  current,
  onLoad,
  onResume,
  onClear,
  onClose,
}: {
  campaigns: CampaignHeader[]
  current: number | null
  onLoad: () => void
  onResume: (id: number) => void
  onClear: () => void
  onClose: () => void
}): JSX.Element {
  useEffect(onLoad, [onLoad])

  const when = (iso: string): string => {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const mins = Math.round((Date.now() - then) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.round(hours / 24)}d ago`
  }

  return (
    <div className="scrim">
      <div className="modal modal-sessions">
        <div className="modal-head">
          <h3>Sessions</h3>
          <span className="modal-sub">
            {campaigns.length} saved · the campaign is written after every step, so nothing
            here is unsaved
          </span>
        </div>

        <div className="modal-body">
          <div className="saves">
            {campaigns.length === 0 && <p className="brief">No campaigns yet.</p>}
            {campaigns.map((campaign) => {
              const here = campaign.id === current
              return (
                <div key={campaign.id} className={`save${here ? ' save-here' : ''}`}>
                  <span className="save-name">
                    {campaign.name}
                    {here && <em>at the table</em>}
                  </span>
                  <span className="save-meta">
                    {campaign.steps} steps · {when(campaign.lastPlayed)}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={here}
                    onClick={() => {
                      onResume(campaign.id)
                      onClose()
                    }}
                  >
                    {here ? 'open' : 'resume'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Separate from resuming, because it is the one that keeps the table
              and changes only who is running it. */}
          <div className="quit">
            <div>
              <b>New conversation</b>
              <span>
                The DM forgets how you got here and reads the table fresh. The campaign,
                the cast and the story are untouched.
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onClear()
                onClose()
              }}
            >
              clear
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <div className="brief">Resuming another campaign starts a new conversation too.</div>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
