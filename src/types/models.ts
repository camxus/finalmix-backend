// ─── Enums ────────────────────────────────────────────────────────────────────

export type ProjectStatus = 'wip' | 'awaiting_feedback' | 'final' | 'released' | 'archived';
export type ProjectVisibility = 'private' | 'shared' | 'public';
export type AssetType = 'track' | 'stem' | 'master';
export type StemPlaybackMode = 'file' | 'grouped';
export type AIStatus = 'pending' | 'processing' | 'complete' | 'failed';
export type SharePermission = 'view';
export type MemberRole = 'viewer';

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;               // Cognito sub
  email: string;
  name: string;
  avatar_url?: string;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  created_at: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  owner_id: string;
  collection_id?: string;
  title: string;
  artist?: string;
  client?: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  release_date?: string;
  year?: number;
  bpm?: number;
  key?: string;
  genre: string[];
  custom_tags: string[];
  notes?: string;
  cover_image_url?: string;
  cover_image_key?: string;
  thumbnail_waveform_url?: string;
  created_at: string;
  updated_at: string;
}

// ─── AudioCommit ──────────────────────────────────────────────────────────────

export interface AudioCommit {
  id: string;
  asset_id: string;
  asset_type: AssetType;
  version_number: number;
  commit_message?: string;
  file_url: string;
  file_key: string;
  file_size_bytes: number;
  duration_seconds: number;
  format: string;
  sample_rate: number;
  bit_depth?: number;
  channels: number;
  waveform_data?: number[];
  detected_bpm?: number;
  detected_key?: string;
  uploaded_by: string;
  created_at: string;
}

// ─── Track ────────────────────────────────────────────────────────────────────

export interface TrackAIData {
  instrument_type: string;
  category: 'drums' | 'vocals' | 'instruments' | 'fx';
  subcategory?: string;
  confidence: number;
  tags: string[];
  detected_bpm?: number;
  detected_key?: string;
  analysed_at: string;
}

export interface Track {
  id: string;
  project_id: string;
  stem_id?: string;
  name: string;
  color?: string;
  order_index: number;
  current_commit_id?: string;
  is_placeholder: boolean;
  ai_status: AIStatus;
  ai_data?: TrackAIData;
  ai_error?: string;
  user_tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Stem ─────────────────────────────────────────────────────────────────────

export interface Stem {
  id: string;
  project_id: string;
  name: string;
  color?: string;
  order_index: number;
  is_collapsed: boolean;
  playback_mode: StemPlaybackMode;
  current_commit_id?: string;
  ableton_group_track_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Master ───────────────────────────────────────────────────────────────────

export interface Master {
  id: string;
  project_id: string;
  current_commit_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── ABSnapshot ───────────────────────────────────────────────────────────────

export interface ABSnapshot {
  id: string;
  project_id: string;
  name: string;
  asset_id: string;
  asset_type: AssetType;
  commit_a_id: string;
  commit_b_id: string;
  created_by: string;
  created_at: string;
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export interface ProjectShare {
  id: string;
  project_id: string;
  token_hash: string;
  label?: string;
  permission: SharePermission;
  created_by: string;
  expires_at?: string;
  last_accessed_at?: string;
  access_count: number;
  is_revoked: boolean;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  invited_by: string;
  invited_at: string;
  accepted_at?: string;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface TrackComment {
  id: string;
  project_id: string;
  track_id: string;
  commit_id: string;
  timestamp_seconds: number;
  body: string;
  author_id?: string;
  author_name: string;
  author_email?: string;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CommentReply {
  id: string;
  comment_id: string;
  body: string;
  author_id?: string;
  author_name: string;
  created_at: string;
}

// ─── SQS Payloads ─────────────────────────────────────────────────────────────

export interface WaveformJobPayload {
  commitId: string;
  fileKey: string;
  assetId: string;
  assetType: AssetType;
}

export interface AIAnalysisJobPayload {
  trackId: string;
  commitId: string;
  projectId: string;
}

// ─── Express extensions ───────────────────────────────────────────────────────

export type ProjectAccess = 'owner' | 'member' | 'share';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      project?: Project;
      projectAccess?: ProjectAccess;
    }
  }
}
