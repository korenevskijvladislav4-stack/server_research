export interface ProfileContext {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateProfileContextDto {
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateProfileContextDto {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}
