import path from 'path';
import fs from 'fs';
import multer from 'multer';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
const paymentImagesDir = path.join(uploadsRoot, 'payments');

if (!fs.existsSync(paymentImagesDir)) {
  fs.mkdirSync(paymentImagesDir, { recursive: true });
}

const paymentImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, paymentImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export const paymentImageUpload = multer({
  storage: paymentImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).array('images', 10);
