import { ulid } from 'ulid';

export const newId = (): string => ulid();

export const now = (): string => new Date().toISOString();

export function s3Keys(userId: string) {
  const base = `users/${userId}`;
  return {
    trackCommit: (projectId: string, trackId: string, commitId: string, ext: string) =>
      `${base}/projects/${projectId}/tracks/${trackId}/${commitId}.${ext}`,
    stemCommit: (projectId: string, stemId: string, commitId: string, ext: string) =>
      `${base}/projects/${projectId}/stems/${stemId}/${commitId}.${ext}`,
    masterCommit: (projectId: string, commitId: string, ext: string) =>
      `${base}/projects/${projectId}/master/${commitId}.${ext}`,
    cover: (projectId: string, ext: string) =>
      `${base}/projects/${projectId}/cover.${ext}`,
    waveform: (commitId: string) =>
      `waveforms/${commitId}.json`,
  };
}

export function buildApiError(error: string, message: string) {
  return { error, message };
}

export const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/flac': 'flac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const AUDIO_MIME_TYPES = new Set([
  'audio/wav','audio/x-wav','audio/aiff','audio/x-aiff',
  'audio/flac','audio/mpeg','audio/mp3','audio/ogg',
]);

export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg','image/png','image/webp',
]);
