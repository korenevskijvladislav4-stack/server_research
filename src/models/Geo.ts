export interface Geo {
  id?: number;
  code: string; // e.g. RU, DE, BR
  name: string; // e.g. Россия, Германия, Бразилия
  is_active?: boolean;
  sort_order?: number;
  created_at?: Date;
  updated_at?: Date;
}

