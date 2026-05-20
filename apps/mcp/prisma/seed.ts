import { PrismaClient } from '../generated/prisma/client'

const prisma = new PrismaClient()

// "Inbox" no es un Type: es un State. Una nota capturada vive con
// typeId=null + state=INBOX hasta que se clarifica.
const TYPES = [
  { slug: 'task', name: 'Task', description: 'Acción concreta y ejecutable.' },
  { slug: 'project', name: 'Project', description: 'Outcome multi-paso. Contiene tasks.' },
  { slug: 'area', name: 'Area', description: 'Área de responsabilidad continua, no se termina.' },
  {
    slug: 'routine',
    name: 'Routine',
    description: 'Algo recurrente. La cadencia se gestiona fuera del schema por ahora.'
  },
  { slug: 'note', name: 'Note', description: 'Nota libre — pensamientos, observaciones.' },
  { slug: 'report', name: 'Report', description: 'Narrativa que alinea pilares con táctico/operativo.' },
  { slug: 'person', name: 'Person', description: 'Una persona.' },
  {
    slug: 'reference',
    name: 'Reference',
    description: 'Material de consulta sin acción asociada (URL, libro, paper, ...).'
  }
]

for (const t of TYPES) {
  await prisma.noteType.upsert({
    where: { slug: t.slug },
    update: { name: t.name, description: t.description },
    create: t
  })
}

console.log(`Seeded ${TYPES.length} NoteType records.`)
await prisma.$disconnect()
