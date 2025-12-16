import { create } from 'zustand';

interface AutomationState {
  serverIp: string;
  serverPort: number;
  ffmpegCommand: string;
  outputFilename: string;
  inputFile: File | null;
  jobDownloadUrl: string | null;
  autoSavedPath: string | null;
  setServerIp: (ip: string) => void;
  setServerPort: (port: number) => void;
  setFfmpegCommand: (cmd: string) => void;
  setOutputFilename: (name: string) => void;
  setInputFile: (file: File | null) => void;
  setJobDownloadUrl: (url: string | null) => void;
  setAutoSavedPath: (p: string | null) => void;
}

export const useAutomationStore = create<AutomationState>((set) => ({
  serverIp: '10.23.172.47',
  serverPort: 5000,
  ffmpegCommand: 'ffmpeg -y -i {input} -c:v libx264 -crf 23 -c:a aac {output}',
  outputFilename: 'out.mp4',
  inputFile: null,
  jobDownloadUrl: null,
  autoSavedPath: null,
  setServerIp: (ip) => set({ serverIp: ip }),
  setServerPort: (port) => set({ serverPort: port }),
  setFfmpegCommand: (cmd) => set({ ffmpegCommand: cmd }),
  setOutputFilename: (name) => set({ outputFilename: name }),
  setInputFile: (file) => set({ inputFile: file }),
  setJobDownloadUrl: (url) => set({ jobDownloadUrl: url }),
  setAutoSavedPath: (p) => set({ autoSavedPath: p }),
}));

