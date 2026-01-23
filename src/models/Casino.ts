export interface Casino {
  id?: number;
  name: string;
  website?: string;
  description?: string;
  geo?: string[]; // Array of GEO codes like ["RU", "DE", "BR"]
  is_our?: boolean; // Наш казино (Да/Нет)
  status: 'active' | 'inactive' | 'pending';
  created_at?: Date;
  updated_at?: Date;
  created_by?: number;
}

export interface CreateCasinoDto {
  name: string;
  website?: string;
  description?: string;
  geo?: string[];
  is_our?: boolean;
  status?: 'active' | 'inactive' | 'pending';
}

export interface UpdateCasinoDto {
  name?: string;
  website?: string;
  description?: string;
  geo?: string[];
  is_our?: boolean;
  status?: 'active' | 'inactive' | 'pending';
}
