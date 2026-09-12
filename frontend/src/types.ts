export interface User {
  id: string
  email: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type BoardRole = 'owner' | 'editor' | 'viewer'

export interface BoardMember {
  user_id: string
  email: string
  role: BoardRole
}

export interface Tag {
  id: string
  board_id: string
  name: string
  color: string | null
}

export interface Column {
  id: string
  board_id: string
  name: string
  position: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  column_id: string
  title: string
  description: string | null
  due_date: string | null
  assignee_id: string | null
  rank: string
  created_at: string
  updated_at: string
}

export interface TaskFull extends Task {
  tags: Tag[]
  assignee: User | null
}

export interface Comment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  user: User
}

export interface ActivityLog {
  id: string
  task_id: string
  user_id: string
  action_type: string
  action_details: Record<string, unknown>
  human_readable_message: string
  created_at: string
  user: User
}

export interface BoardSummary {
  id: string
  name: string
  owner_id: string
  is_archived: boolean
  created_at: string
  updated_at: string
  role: BoardRole
  total_tasks: number
  overdue_tasks: number
  member_count: number
}

export interface BoardDetail extends BoardSummary {
  columns: Column[]
  tags: Tag[]
  members: BoardMember[]
  tasks: TaskFull[]
}

export interface BoardStats {
  total_tasks: number
  overdue_tasks: number
  per_column: { column_id: string; name: string; count: number }[]
  per_assignee: {
    user_id: string | null
    label: string
    count: number
  }[]
  per_tag: {
    tag_id: string | null
    name: string | null
    color: string | null
    count: number
  }[]
}

export interface TaskCreateInput {
  column_id: string
  title: string
  description?: string | null
  due_date?: string | null
  assignee_id?: string | null
  tag_ids?: string[]
}

export interface TaskUpdateInput {
  title?: string
  description?: string | null
  due_date?: string | null
  assignee_id?: string | null
}

export interface TaskMoveInput {
  column_id: string
  before_task_id?: string | null
  after_task_id?: string | null
}

export interface TaskDetail extends TaskFull {
  comments: Comment[]
  activity: ActivityLog[]
}

export interface BoardCreateInput {
  name: string
  column_names?: string[]
}

export interface InviteInput {
  email: string
  role: Exclude<BoardRole, 'owner'>
}

export interface ResetToken {
  token: string
  reset_url: string
}

export interface AuthUser {
  user: User
}