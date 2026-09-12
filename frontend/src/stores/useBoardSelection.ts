import { create } from 'zustand'

interface SelectionState {
  boardId: string | null
  taskId: string | null
  columnId: string | null
  editing: boolean
  setBoard: (boardId: string) => void
  select: (taskId: string | null, columnId: string | null) => void
  setEditing: (editing: boolean) => void
  clear: () => void
}

export const useBoardSelectionStore = create<SelectionState>()((set) => ({
  boardId: null,
  taskId: null,
  columnId: null,
  editing: false,

  setBoard(boardId) {
    set({ boardId, taskId: null, columnId: null, editing: false })
  },
  select(taskId, columnId) {
    set({ taskId, columnId, editing: false })
  },
  setEditing(editing) {
    set({ editing })
  },
  clear() {
    set({ taskId: null, columnId: null, editing: false })
  },
}))