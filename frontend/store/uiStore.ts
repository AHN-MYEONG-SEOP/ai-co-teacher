import { create } from 'zustand'
import type { ConversationMessage, MessageFeedback } from '@/types'

interface UIState {
  messages: ConversationMessage[]
  isLogDrawerOpen: boolean
  isAIResponding: boolean

  addMessage: (message: ConversationMessage) => void
  updateMessageFeedback: (id: string, feedback: MessageFeedback) => void
  setLogDrawerOpen: (open: boolean) => void
  setAIResponding: (responding: boolean) => void
  clearMessages: () => void
}

export const useUIStore = create<UIState>((set) => ({
  messages: [],
  isLogDrawerOpen: false,
  isAIResponding: false,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateMessageFeedback: (id, feedback) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, feedback } : msg
      ),
    })),

  setLogDrawerOpen: (isLogDrawerOpen) => set({ isLogDrawerOpen }),
  setAIResponding: (isAIResponding) => set({ isAIResponding }),
  clearMessages: () => set({ messages: [] }),
}))
