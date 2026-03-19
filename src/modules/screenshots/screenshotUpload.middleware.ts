import path from 'path';
import fs from 'fs';
import multer from 'multer';

const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');
const screenshotsDir = path.join(uploadsRoot, 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const screenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, screenshotsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

export const manualScreenshotUpload = multer({
  storage: screenshotStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('image');

