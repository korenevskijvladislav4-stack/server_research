export interface ProfileField {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateProfileFieldDto {
  name: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateProfileFieldDto {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}
