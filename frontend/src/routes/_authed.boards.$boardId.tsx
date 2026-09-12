import { createFileRoute } from '@tanstack/react-router'
import { BoardPage } from '@/features/BoardPage'

export const Route = createFileRoute('/_authed/boards/$boardId')({
  component: BoardRoute,
})

function BoardRoute() {
  const { boardId } = Route.useParams()
  return <BoardPage boardId={boardId} />
}