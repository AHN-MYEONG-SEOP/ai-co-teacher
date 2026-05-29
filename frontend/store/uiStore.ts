import { create } from 'zustand'
import type { ConversationMessage, MessageFeedback } from '@/types'

interface UIState {
  // 대화 로그
  messages: ConversationMessage[]
  // 시스템 로그 Drawer 열림 여부
  isLogDrawerOpen: boolean
  // AI 응답 로딩 중
  isAIResponding: boolean

  // Actions
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

  // 학생 메시지에 피드백 데이터 attach
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
