import { create } from 'zustand';

interface User {
  id: string;
  email: string;
}

interface AppStore {
  user: User | null;
  resumes: Resume[];
  hydrated: boolean;
  setAuth: (user: User) => void;
  clearAuth: () => void;
  setResumes: (resumes: Resume[]) => void;
  addResume: (resume: Resume) => void;
  setHydrated: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: null,
  resumes: [],
  hydrated: false,
  setAuth: (user) => set({ user }),
  clearAuth: () => set({ user: null }),
  setResumes: (resumes) => set({ resumes }),
  addResume: (resume) => set((state) => ({ resumes: [...state.resumes, resume] })),
  setHydrated: () => set({ hydrated: true }),
}));
