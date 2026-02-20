import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../database/connection';
import { CasinoComment, CreateCasinoCommentDto, UpdateCasinoCommentDto } from '../models/CasinoComment';
import { CasinoCommentImage } from '../models/CasinoCommentImage';

// Configure storage for comment images
// Use the same uploads root as in server.ts: <project>/server/uploads
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const commentImagesDir = path.join(uploadsRoot, 'comments');

// Ensure directories exist
if (!fs.existsSync(commentImagesDir)) {
  fs.mkdirSync(commentImagesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, commentImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const imageUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('image');

export const getCommentsByCasino = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const connection = await pool.getConnection();
    
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT c.*, u.username 
       FROM casino_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.casino_id = ?
       ORDER BY c.created_at DESC`,
      [casinoId]
    );
    
    connection.release();
    res.json(rows as unknown as CasinoComment[]);
  } catch (error) {
    console.error('Error fetching casino comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
};

export const createComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const data: CreateCasinoCommentDto = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    if (!data.text || !data.text.trim()) {
      res.status(400).json({ error: 'Comment text is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    
    const [result] = await connection.query(
      `INSERT INTO casino_comments (casino_id, user_id, text) VALUES (?, ?, ?)`,
      [casinoId, userId, data.text.trim()]
    );
    
    const insertId = (result as any).insertId;
    
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT c.*, u.username 
       FROM casino_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [insertId]
    );
    
    connection.release();
    res.status(201).json(rows[0] as unknown as CasinoComment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

export const updateComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data: UpdateCasinoCommentDto = req.body;
    const userId = (req as any).user?.id;
    
    if (!data.text || !data.text.trim()) {
      res.status(400).json({ error: 'Comment text is required' });
      return;
    }
    
    const connection = await pool.getConnection();
    
    // Check if user owns the comment
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT user_id FROM casino_comments WHERE id = ?',
      [id]
    );
    
    if (!Array.isArray(existing) || existing.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Comment not found' });
      return;
    }
    
    if ((existing[0] as any).user_id !== userId) {
      connection.release();
      res.status(403).json({ error: 'You can only edit your own comments' });
      return;
    }
    
    await connection.query(
      'UPDATE casino_comments SET text = ? WHERE id = ?',
      [data.text.trim(), id]
    );
    
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT c.*, u.username 
       FROM casino_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [id]
    );
    
    connection.release();
    res.json(rows[0] as unknown as CasinoComment);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
};

export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    const connection = await pool.getConnection();
    
    // Check if user owns the comment
    const [existing] = await connection.query<RowDataPacket[]>(
      'SELECT user_id FROM casino_comments WHERE id = ?',
      [id]
    );
    
    if (!Array.isArray(existing) || existing.length === 0) {
      connection.release();
      res.status(404).json({ error: 'Comment not found' });
      return;
    }
    
    if ((existing[0] as any).user_id !== userId) {
      connection.release();
      res.status(403).json({ error: 'You can only delete your own comments' });
      return;
    }
    
    await connection.query('DELETE FROM casino_comments WHERE id = ?', [id]);
    
    connection.release();
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};

export const uploadCommentImage = (req: Request, res: Response): void => {
  imageUpload(req, res, async (err) => {
    if (err) {
      console.error('Error uploading comment image:', err);
      res.status(400).json({ error: err.message || 'Failed to upload image' });
      return;
    }

    try {
      const { casinoId, commentId } = req.params;
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const relativePath = path.join('comments', path.basename(file.path));

      const connection = await pool.getConnection();
      try {
        await connection.query(
          `INSERT INTO casino_comment_images (casino_id, comment_id, file_path, original_name)
           VALUES (?, ?, ?, ?)`,
          [Number(casinoId), Number(commentId) || null, relativePath, file.originalname]
        );

        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT * FROM casino_comment_images WHERE casino_id = ? AND comment_id = ? ORDER BY created_at DESC LIMIT 1`,
          [Number(casinoId), Number(commentId) || null]
        );

        const image = rows[0] as unknown as CasinoCommentImage;

        res.status(201).json({
          ...image,
          url: `/api/uploads/${image.file_path}`,
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error saving comment image:', error);
      res.status(500).json({ error: 'Failed to save image' });
    }
  });
};

export const getCasinoImages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { casinoId } = req.params;
    const connection = await pool.getConnection();

    // Get comment images
    const [commentRows] = await connection.query<RowDataPacket[]>(
      `SELECT i.*, c.text as comment_text, u.username, 'comment' as entity_type
       FROM casino_comment_images i
       LEFT JOIN casino_comments c ON i.comment_id = c.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE i.casino_id = ?
       ORDER BY i.created_at DESC`,
      [casinoId]
    );

    // Get bonus images
    const [bonusRows] = await connection.query<RowDataPacket[]>(
      `SELECT i.*, b.name as bonus_name, 'bonus' as entity_type
       FROM casino_bonus_images i
       LEFT JOIN casino_bonuses b ON i.bonus_id = b.id
       WHERE i.casino_id = ?
       ORDER BY i.created_at DESC`,
      [casinoId]
    );

    // Get payment images
    const [paymentRows] = await connection.query<RowDataPacket[]>(
      `SELECT i.*, CONCAT(p.type, ' - ', p.method) as payment_name, 'payment' as entity_type
       FROM casino_payment_images i
       LEFT JOIN casino_payments p ON i.payment_id = p.id
       WHERE i.casino_id = ?
       ORDER BY i.created_at DESC`,
      [casinoId]
    );

    // Get promo images
    const [promoRows] = await connection.query<RowDataPacket[]>(
      `SELECT i.*, p.name as promo_name, 'promo' as entity_type
       FROM casino_promo_images i
       LEFT JOIN casino_promos p ON i.promo_id = p.id
       WHERE i.casino_id = ?
       ORDER BY i.created_at DESC`,
      [casinoId]
    );

    connection.release();

    const allImagesRaw = [
      ...(commentRows as unknown as (CasinoCommentImage & { comment_text?: string; username?: string; entity_type: string })[]).map(
        (img) => ({
          ...img,
          url: `/api/uploads/${img.file_path}`,
          label: img.comment_text ? `Комментарий: ${img.comment_text.substring(0, 50)}...` : 'Комментарий',
        })
      ),
      ...(bonusRows as unknown as (CasinoCommentImage & { bonus_name?: string; entity_type: string })[]).map(
        (img) => ({
          ...img,
          url: `/api/uploads/${img.file_path}`,
          label: img.bonus_name ? `Бонус: ${img.bonus_name}` : 'Бонус',
        })
      ),
      ...(paymentRows as unknown as (CasinoCommentImage & { payment_name?: string; entity_type: string })[]).map(
        (img) => ({
          ...img,
          url: `/api/uploads/${img.file_path}`,
          label: img.payment_name ? `Платеж: ${img.payment_name}` : 'Платеж',
        })
      ),
      ...(promoRows as unknown as (CasinoCommentImage & { promo_name?: string; entity_type: string })[]).map(
        (img) => ({
          ...img,
          url: `/api/uploads/${img.file_path}`,
          label: img.promo_name ? `Промо: ${img.promo_name}` : 'Промо',
        })
      ),
    ];

    // Фильтруем записи, для которых реально существует файл, чтобы избежать 404
    const allImages = allImagesRaw
      .filter((img) => {
        const absPath = path.join(uploadsRoot, img.file_path);
        return fs.existsSync(absPath);
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

    res.json(allImages);
  } catch (error) {
    console.error('Error fetching casino images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
}
