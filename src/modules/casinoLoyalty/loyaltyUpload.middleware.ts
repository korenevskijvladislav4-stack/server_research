import path from 'path';
import fs from 'fs';
import multer from 'multer';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
const loyaltyDir = path.join(uploadsRoot, 'loyalty-ai-temp');

if (!fs.existsSync(loyaltyDir)) {
  fs.mkdirSync(loyaltyDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, loyaltyDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `loyalty-${uniqueSuffix}${ext}`);
  },
});

export const loyaltyAiImageUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('image');

const statusImagesDir = path.join(uploadsRoot, 'loyalty-status-images');
if (!fs.existsSync(statusImagesDir)) {
  fs.mkdirSync(statusImagesDir, { recursive: true });
}

const statusImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, statusImagesDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export const loyaltyStatusImageUpload = multer({
  storage: statusImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).array('images', 10);
