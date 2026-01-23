export interface CasinoCommentImage {
  id: number;
  casino_id: number;
  comment_id: number | null;
  file_path: string;
  original_name?: string | null;
  created_at: Date;
}

