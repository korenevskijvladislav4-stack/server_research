import path from 'path';
import fs from 'fs';
import multer from 'multer';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
const commentImagesDir = path.join(uploadsRoot, 'comments');
if (!fs.existsSync(commentImagesDir)) fs.mkdirSync(commentImagesDir, { recursive: true });

export const commentImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, commentImagesDir),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => (file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'))),
}).single('image');
