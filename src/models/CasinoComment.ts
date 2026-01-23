export interface CasinoComment {
  id: number;
  casino_id: number;
  user_id: number;
  text: string;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  username?: string;
}

export interface CreateCasinoCommentDto {
  casino_id: number;
  text: string;
}

export interface UpdateCasinoCommentDto {
  text: string;
}
