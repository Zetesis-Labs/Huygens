import { describe, expect, test } from 'bun:test'
import {
  deleteConversationImpl,
  getConversationImpl,
  listConversationsImpl,
  saveConversationImpl
} from '../src/tools/conversation'
import { withFreshDbAndReader } from './_fixtures'

// save/delete write as root; get/list read as huygens_reader — so the suite
// needs both overrides installed (withFreshDbAndReader).
describe('conversation persistence', () => {
  test('create → get → list round-trips messages and state', async () => {
    const ctx = await withFreshDbAndReader()
    try {
      const messages = [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'qué tal' }
      ]
      const state = { active_view: 'v1', views: ['v1'] }
      const { id, updated } = await saveConversationImpl({ messages, title: 'Primera', state })
      expect(updated).toBe(false)
      expect(id).toMatch(/^conversation:/)

      const doc = await getConversationImpl({ id })
      expect(doc?.title).toBe('Primera')
      expect(doc?.messages).toEqual(messages)
      expect(doc?.state).toEqual(state)

      const list = await listConversationsImpl({ limit: 50 })
      expect(list).toEqual(
        expect.arrayContaining([expect.objectContaining({ id, title: 'Primera', message_count: 2 })])
      )
    } finally {
      await ctx.cleanup()
    }
  })

  test('passing an existing id updates (merges) instead of creating', async () => {
    const ctx = await withFreshDbAndReader()
    try {
      const { id } = await saveConversationImpl({ messages: [{ role: 'user', content: 'one' }] })
      const second = await saveConversationImpl({
        id,
        messages: [
          { role: 'user', content: 'one' },
          { role: 'assistant', content: 'two' }
        ],
        title: 'Renamed'
      })
      expect(second.updated).toBe(true)
      expect(second.id).toBe(id)

      const doc = await getConversationImpl({ id })
      expect(doc?.title).toBe('Renamed')
      expect(doc?.messages).toHaveLength(2)
    } finally {
      await ctx.cleanup()
    }
  })

  test('get returns null for a missing id; delete removes', async () => {
    const ctx = await withFreshDbAndReader()
    try {
      expect(await getConversationImpl({ id: 'conversation:nope' })).toBeNull()

      const { id } = await saveConversationImpl({ messages: [] })
      await deleteConversationImpl({ id })
      expect(await getConversationImpl({ id })).toBeNull()
    } finally {
      await ctx.cleanup()
    }
  })
})
