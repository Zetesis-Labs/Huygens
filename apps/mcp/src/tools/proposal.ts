import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { renderProposalD2, renderProposalSemanticD2 } from './proposal-d2'
import { type D2Format, renderD2 } from './proposal-d2-render'
import { renderProposalDiff } from './proposal-render'
import { resolveContextLabels } from './proposal/changes'
import { getProposalChangesImpl } from './proposal/changes'
import { commitProposalImpl } from './proposal/commit'
import { createProposalImpl, discardProposalImpl, getProposalImpl, updateProposalImpl } from './proposal/crud'
import {
  commitProposalShape,
  createProposalShape,
  discardProposalShape,
  getProposalChangesShape,
  getProposalShape,
  updateProposalShape
} from './proposal/schemas'

// Public surface of the proposal feature, re-exported so existing imports
// (`./tools/proposal`) keep working after the split into proposal/*.
export type { ProposalChanges } from './proposal/changes'
export { getProposalChangesImpl, resolveContextLabels } from './proposal/changes'
export { commitProposalImpl } from './proposal/commit'
export { createProposalImpl, discardProposalImpl, getProposalImpl, updateProposalImpl } from './proposal/crud'
export type {
  CommitProposalInput,
  CommitProposalResult,
  CreateProposalInput,
  DiscardProposalInput,
  GetProposalInput,
  ProposalDetail,
  ProposalPayload,
  ProposalResult,
  UpdateProposalInput
} from './proposal/schemas'
export {
  commitProposalShape,
  createProposalShape,
  discardProposalShape,
  getProposalChangesShape,
  getProposalShape,
  proposalPayloadSchema,
  updateProposalShape
} from './proposal/schemas'

export function registerProposalTools(server: McpServer): void {
  server.tool(
    'create_proposal',
    'Persist a visible draft proposal from inbox raw_capture ids. Does not mutate notes, blocks, or graph edges.',
    createProposalShape,
    async args => {
      const proposal = await createProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'update_proposal',
    'Update a draft proposal payload. Rejected once the proposal is committed or discarded.',
    updateProposalShape,
    async args => {
      const proposal = await updateProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'get_proposal',
    'Fetch a persisted proposal: a deterministic, human-readable preview of what committing it will create and change, followed by the raw JSON.',
    getProposalShape,
    async args => {
      const proposal = await getProposalImpl(args)
      if (!proposal) return { content: [{ type: 'text', text: 'Proposal not found.' }] }
      const text = `${renderProposalDiff(proposal)}\n\n---\n\n${JSON.stringify(proposal, null, 2)}`
      return { content: [{ type: 'text', text }] }
    }
  )

  server.tool(
    'get_proposal_changes',
    'Recover the exact changes a committed proposal produced. Default: JSON with two views — "materialized" (real record ids resolved to records) and "changefeed" (the transaction delta at the commit versionstamp). With format_d2: "code" returns the D2 diagram source; "svg"/"png"/"jpeg" return a rendered image of the change graph. Read-only.',
    getProposalChangesShape,
    async args => {
      const changes = await getProposalChangesImpl({ proposal_id: args.proposal_id })
      if (!args.format_d2) {
        return { content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }] }
      }
      const contextLabels = changes.materialized ? await resolveContextLabels(changes.materialized) : {}
      const d2 =
        args.d2_view === 'audit'
          ? renderProposalD2(changes, contextLabels)
          : renderProposalSemanticD2(changes, contextLabels)
      if (args.format_d2 === 'code') {
        return { content: [{ type: 'text', text: d2 }] }
      }
      try {
        const { base64, mimeType } = await renderD2(d2, args.format_d2 as D2Format)
        return { content: [{ type: 'image', data: base64, mimeType }] }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return {
          content: [
            { type: 'text', text: `D2 render failed (${args.format_d2}): ${message}\n\n--- D2 source ---\n${d2}` }
          ]
        }
      }
    }
  )

  server.tool(
    'discard_proposal',
    'Discard a draft proposal without mutating notes, blocks, or graph edges.',
    discardProposalShape,
    async args => {
      const proposal = await discardProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] }
    }
  )

  server.tool(
    'commit_proposal',
    'Commit an approved proposal: create narrative blocks, apply minimal note/edge mutations, link provenance, and mark raws processed.',
    commitProposalShape,
    async args => {
      const result = await commitProposalImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
  )
}
