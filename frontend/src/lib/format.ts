const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MS_DAY = 86400000

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

function startOfToday(): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now
}

export function displayName(email: string): string {
  const base = email.split('@')[0] ?? email
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function formatDateOnly(value: string): string {
  const d = parseDateOnly(value)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatDateOnlyLong(value: string): string {
  const d = parseDateOnly(value)
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function formatDateLong(value: string): string {
  return formatDateOnlyLong(value)
}

export function formatDateTime(value: string): string {
  const d = new Date(value)
  const date = formatDateOnly(value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} · ${hh}:${mm}`
}

export function timeAgo(value: string): string {
  const d = new Date(value).getTime()
  const diff = Date.now() - d
  if (Number.isNaN(diff) || diff < 0) return ''
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export interface DueDisplay {
  relative: string
  exact: string
  days: number
}

export function formatDueDate(dueDate: string | null | undefined): DueDisplay | null {
  if (!dueDate) return null
  const today = startOfToday().getTime()
  const due = parseDateOnly(dueDate).getTime()
  const days = Math.round((due - today) / MS_DAY)
  const exact = formatDateOnly(dueDate)
  if (days === 0) return { relative: 'Due today', exact, days }
  if (days === 1) return { relative: 'in 1 day', exact, days }
  if (days > 1) return { relative: `in ${days} days`, exact, days }
  if (days === -1) return { relative: '1 day overdue', exact, days }
  return { relative: `${Math.abs(days)} days overdue`, exact, days }
}

export interface DueInfo {
  text: string
  tone: 'red' | 'amber' | 'slate'
}

export function dueInfo(dueDate: string | null | undefined): DueInfo | null {
  if (!dueDate) return null
  const today = startOfToday().getTime()
  const due = parseDateOnly(dueDate).getTime()
  const diff = Math.round((due - today) / MS_DAY)
  const exact = formatDateOnly(dueDate)
  if (diff === 0) return { text: `Due today (${exact})`, tone: 'amber' }
  if (diff === 1) return { text: `Due tomorrow (${exact})`, tone: 'slate' }
  if (diff > 1) return { text: `Due in ${diff} days (${exact})`, tone: 'slate' }
  if (diff === -1) return { text: `1 day overdue (${exact})`, tone: 'red' }
  return { text: `${Math.abs(diff)} days overdue (${exact})`, tone: 'red' }
}