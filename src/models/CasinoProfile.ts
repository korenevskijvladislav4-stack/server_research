export type CasinoProfileFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'rating'
  | 'date'
  | 'url';

export interface CasinoProfileField {
  id?: number;
  key_name: string;
  label: string;
  description?: string;
  field_type: CasinoProfileFieldType;
  options_json?: any;
  group_name?: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
  created_by?: number;
  updated_by?: number;
}

export interface CasinoProfileValue {
  casino_id: number;
  field_id: number;
  value_json: any;
  updated_at?: Date;
  updated_by?: number;
}

export interface CasinoProfileHistoryEvent {
  id?: number;
  casino_id: number;
  field_id?: number | null;
  action: 'set_value' | 'clear_value' | 'create_field' | 'update_field' | 'delete_field';
  old_value_json?: any;
  new_value_json?: any;
  meta_json?: any;
  created_at?: Date;
  actor_user_id?: number;
}

export interface UpsertCasinoProfileValueDto {
  field_id: number;
  value_json: any;
}

export interface CreateCasinoProfileFieldDto {
  key_name: string;
  label: string;
  description?: string;
  field_type: CasinoProfileFieldType;
  options_json?: any;
  group_name?: string;
  sort_order?: number;
  is_required?: boolean;
  is_active?: boolean;
}

export type UpdateCasinoProfileFieldDto = Partial<CreateCasinoProfileFieldDto>;

