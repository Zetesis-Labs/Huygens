import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { defineTool, jsonBlock } from './define-tool'
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
import { renderProposalDiff } from './proposal-render'

// Public surface of the proposal feature, re-exported so existing imports
// (`./tools/proposal`) keep working after the split into proposal/*.
export type { ProposalChanges } from './proposal/changes'
export { getProposalChangesImpl } from './proposal/changes'
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
  defineTool(
    server,
    'create_proposal',
    'Persist a visible draft proposal from inbox raw_capture ids. Does not mutate notes, blocks, or graph edges.',
    createProposalShape,
    async args => {
      const proposal = await createProposalImpl(args)
      return { content: [jsonBlock(proposal)] }
    }
  )

  defineTool(
    server,
    'update_proposal',
    'Update a draft proposal payload. Rejected once the proposal is committed or discarded.',
    updateProposalShape,
    async args => {
      const proposal = await updateProposalImpl(args)
      return { content: [jsonBlock(proposal)] }
    }
  )

  defineTool(
    server,
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

  defineTool(
    server,
    'get_proposal_changes',
    'Recover the exact changes a committed proposal produced: JSON with two views — "materialized" (real record ids resolved to records) and "changefeed" (the transaction delta at the commit versionstamp). Read-only.',
    getProposalChangesShape,
    async args => {
      const changes = await getProposalChangesImpl(args)
      return { content: [{ type: 'text', text: JSON.stringify(changes, null, 2) }] }
    }
  )

  defineTool(
    server,
    'discard_proposal',
    'Discard a draft proposal without mutating notes, blocks, or graph edges.',
    discardProposalShape,
    async args => {
      const proposal = await discardProposalImpl(args)
      return { content: [jsonBlock(proposal)] }
    }
  )

  defineTool(
    server,
    'commit_proposal',
    'Commit an approved proposal: create narrative blocks, apply minimal note/edge mutations, link provenance, and mark raws processed.',
    commitProposalShape,
    async args => {
      const result = await commitProposalImpl(args)
      return { content: [jsonBlock(result)] }
    }
  )
}
