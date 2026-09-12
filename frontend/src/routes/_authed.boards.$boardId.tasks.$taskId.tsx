import { createFileRoute, Link } from '@tanstack/react-router'
import { TaskDetailCore } from '@/features/TaskDetail'
import { Button } from '@/components/ui/Button'
import { BackIcon } from '@/components/icons'

export const Route = createFileRoute('/_authed/boards/$boardId/tasks/$taskId')({
  component: TaskPageRoute,
})

function TaskPageRoute() {
  const { boardId, taskId } = Route.useParams()

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/boards/$boardId" params={{ boardId }}>
          <Button variant="ghost" size="sm">
            <BackIcon className="size-4" />
            Back to board
          </Button>
        </Link>
      </div>
      <div className="card overflow-hidden rounded-2xl">
        <TaskDetailCore boardId={boardId} taskId={taskId} />
      </div>
    </div>
  )
}