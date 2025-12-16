export interface VideoFile {
  id: string;
  url: string;
  name: string;
  size: number;
  duration: number;
  resolution: string;
  codec: string;
  bitrate: number;
  uploadTime: string;
  raw?: File;
}

export interface EvaluationTask {
  id: string;
  originalVideo: VideoFile;
  exportedVideo: VideoFile;
  types: EvaluationType[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  parameters: EvaluationParameters;
  results?: EvaluationResults;
  score?: number;
  createdAt: string;
  completedAt?: string;
}

export enum EvaluationType {
  VMAF = 'vmaf',
  PSNR = 'psnr',
  SSIM = 'ssim',
  SPEED = 'speed',
  BITRATE = 'bitrate'
}

export interface EvaluationParameters {
  vmaf?: {
    model: string;
    subsample: number;
  };
  ssim?: {
    windowSize: number;
    gaussianWeight: number;
  };
  speed?: {
    benchmark: string;
    iterations: number;
  };
}

export interface EvaluationResults {
  vmaf?: {
    score: number;
    histogram: number[];
    frameScores: number[];
  };
  psnr?: {
    avg: number;
    min: number;
    max: number;
    frameScores: number[];
  };
  ssim?: {
    score: number;
    frameScores: number[];
  };
  speed?: {
    exportTime: number;
    benchmark: string;
    history: SpeedHistory[];
  };
  bitrate?: {
    original: number;
    exported: number;
    ratio: number;
    score: number;
  };
}

export interface SpeedHistory {
  timestamp: string;
  exportTime: number;
  videoDuration: number;
  rtf: number;
}
