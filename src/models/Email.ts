export interface Email {
  id?: number;
  message_id: string;
  subject?: string;
  from_email?: string;
  from_name?: string;
  to_email?: string;
  body_text?: string;
  body_html?: string;
  date_received?: Date;
  is_read?: boolean;
  is_archived?: boolean;
  related_casino_id?: number;
  related_promo_id?: number;
  created_at?: Date;
}

export interface EmailAttachment {
  id?: number;
  email_id: number;
  filename: string;
  content_type?: string;
  size?: number;
  file_path?: string;
  created_at?: Date;
}
