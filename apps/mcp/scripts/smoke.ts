import { PrismaClient } from '../generated/prisma/client'

const prisma = new PrismaClient()

// Capture sin categoría — el caso típico de inbox.
const created = await prisma.note.create({
  data: {
    title: 'smoke test',
    content: '# Hola\nesto es un tocho de prueba',
    pillars: ['ETHOS', 'SOPHIA'],
    sourceKind: 'manual'
  }
})

const reread = await prisma.note.findUnique({ where: { id: created.id } })
if (!reread) throw new Error('readback failed')

const recent = await prisma.note.findMany({
  where: { updatedAt: { gt: new Date(Date.now() - 60_000) } },
  select: { id: true, title: true, pillars: true, state: true }
})

console.log(
  JSON.stringify(
    {
      created: { id: created.id, pillars: created.pillars, state: created.state },
      reread: { id: reread.id, pillars: reread.pillars, state: reread.state },
      recentCount: recent.length,
      recent
    },
    null,
    2
  )
)

await prisma.note.delete({ where: { id: created.id } })
await prisma.$disconnect()
