import { create } from 'zustand';

interface MatrixJob {
  id: string;
  encoder: 'x264' | 'x265' | 'nvenc';
  params: Record<string, string | number | boolean>;
  command: string;
  outputFilename: string;
  downloadUrl?: string | null;
  savedPath?: string | null;
  previewUrl?: string | null;
  evalSavedJsonPath?: string | null;
  evalSummary?: Record<string, any> | null;
}

interface AutomationState {
  serverIp: string;
  serverPort: number;
  ffmpegCommand: string;
  outputFilename: string;
  inputFile: File | null;
  jobDownloadUrl: string | null;
  autoSavedPath: string | null;
  mode: 'single' | 'matrix';
  matrixJobs: MatrixJob[];
  setServerIp: (ip: string) => void;
  setServerPort: (port: number) => void;
  setFfmpegCommand: (cmd: string) => void;
  setOutputFilename: (name: string) => void;
  setInputFile: (file: File | null) => void;
  setJobDownloadUrl: (url: string | null) => void;
  setAutoSavedPath: (p: string | null) => void;
  setMode: (m: 'single' | 'matrix') => void;
  addMatrixJobs: (jobs: MatrixJob[]) => void;
  updateMatrixJob: (id: string, patch: Partial<MatrixJob>) => void;
}

export const useAutomationStore = create<AutomationState>((set) => ({
  serverIp: '10.23.172.47',
  serverPort: 5000,
  ffmpegCommand: 'ffmpeg -y -i {input} -c:v libx264 -crf 23 -c:a aac {output}',
  outputFilename: 'out.mp4',
  inputFile: null,
  jobDownloadUrl: null,
  autoSavedPath: null,
  mode: 'single',
  matrixJobs: [],
  setServerIp: (ip) => set({ serverIp: ip }),
  setServerPort: (port) => set({ serverPort: port }),
  setFfmpegCommand: (cmd) => set({ ffmpegCommand: cmd }),
  setOutputFilename: (name) => set({ outputFilename: name }),
  setInputFile: (file) => set({ inputFile: file }),
  setJobDownloadUrl: (url) => set({ jobDownloadUrl: url }),
  setAutoSavedPath: (p) => set({ autoSavedPath: p }),
  setMode: (m) => set({ mode: m }),
  addMatrixJobs: (jobs) => set(state => ({ matrixJobs: [...state.matrixJobs, ...jobs] })),
  updateMatrixJob: (id, patch) => set(state => ({ matrixJobs: state.matrixJobs.map(j => j.id === id ? { ...j, ...patch } : j) })),
}));
