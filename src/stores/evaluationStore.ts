import { create } from 'zustand';
import { EvaluationTask, VideoFile, EvaluationType, QualityMetricCache } from '@/types';

interface EvaluationState {
  currentTask: EvaluationTask | null;
  originalVideo: VideoFile | null;
  exportedVideo: VideoFile | null;
  selectedTypes: EvaluationType[];
  isProcessing: boolean;
  qualityCache: Record<string, QualityMetricCache>;
  setCurrentTask: (task: EvaluationTask | null) => void;
  setOriginalVideo: (video: VideoFile | null) => void;
  setExportedVideo: (video: VideoFile | null) => void;
  setSelectedTypes: (types: EvaluationType[]) => void;
  setIsProcessing: (processing: boolean) => void;
  upsertQualityCache: (key: string, patch: QualityMetricCache) => void;
  reset: () => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
  currentTask: null,
  originalVideo: null,
  exportedVideo: null,
  selectedTypes: [EvaluationType.VMAF],
  isProcessing: false,
  qualityCache: {},
  setCurrentTask: (task) => set({ currentTask: task }),
  setOriginalVideo: (video) => set({ originalVideo: video }),
  setExportedVideo: (video) => set({ exportedVideo: video }),
  setSelectedTypes: (types) => set({ selectedTypes: types }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  upsertQualityCache: (key, patch) => set(state => ({ qualityCache: { ...state.qualityCache, [key]: { ...(state.qualityCache[key] || {}), ...patch } } })),
  reset: () => set({
    currentTask: null,
    originalVideo: null,
    exportedVideo: null,
    selectedTypes: [EvaluationType.VMAF],
    isProcessing: false,
    qualityCache: {},
  }),
}));
