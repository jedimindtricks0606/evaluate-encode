import { create } from 'zustand';
import { EvaluationTask, VideoFile, EvaluationType } from '@/types';

interface EvaluationState {
  currentTask: EvaluationTask | null;
  originalVideo: VideoFile | null;
  exportedVideo: VideoFile | null;
  selectedTypes: EvaluationType[];
  isProcessing: boolean;
  setCurrentTask: (task: EvaluationTask | null) => void;
  setOriginalVideo: (video: VideoFile | null) => void;
  setExportedVideo: (video: VideoFile | null) => void;
  setSelectedTypes: (types: EvaluationType[]) => void;
  setIsProcessing: (processing: boolean) => void;
  reset: () => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
  currentTask: null,
  originalVideo: null,
  exportedVideo: null,
  selectedTypes: [EvaluationType.VMAF],
  isProcessing: false,
  setCurrentTask: (task) => set({ currentTask: task }),
  setOriginalVideo: (video) => set({ originalVideo: video }),
  setExportedVideo: (video) => set({ exportedVideo: video }),
  setSelectedTypes: (types) => set({ selectedTypes: types }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  reset: () => set({
    currentTask: null,
    originalVideo: null,
    exportedVideo: null,
    selectedTypes: [EvaluationType.VMAF],
    isProcessing: false,
  }),
}));
