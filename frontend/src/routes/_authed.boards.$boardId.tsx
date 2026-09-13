import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/boards/$boardId')({
  component: BoardLayout,
})

function BoardLayout() {
  return <Outlet />
}