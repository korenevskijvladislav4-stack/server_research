import path from 'path';
import fs from 'fs';
import multer from 'multer';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
const promoImagesDir = path.join(uploadsRoot, 'promos');
if (!fs.existsSync(promoImagesDir)) fs.mkdirSync(promoImagesDir, { recursive: true });

export const promoImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, promoImagesDir),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => (file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'))),
}).array('images', 10);
