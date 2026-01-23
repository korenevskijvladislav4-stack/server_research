export interface ProfileSetting {
  id: number;
  casino_id: number;
  geo: string;
  field_id: number;
  context_id: number;
  value: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateProfileSettingDto {
  casino_id: number;
  geo: string;
  field_id: number;
  context_id: number;
  value: boolean;
}

export interface UpdateProfileSettingDto {
  value: boolean;
}

export interface ProfileSettingValue {
  field_id: number;
  context_id: number;
  value: boolean;
}
