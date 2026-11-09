const path = require('path');
const fs = require('fs');
const supabase = require('../database');

const BUCKET = 'profile-photos';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://idjback-production.up.railway.app').replace(/\/$/, '');

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;

  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (error || !data) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    });
    if (createError && !/already exists|duplicate/i.test(createError.message || '')) {
      throw createError;
    }
  } else if (!data.public) {
    const { error: publicError } = await supabase.storage.updateBucket(BUCKET, { public: true });
    if (publicError) throw publicError;
  }

  bucketReady = true;
}

async function uploadProfilePhoto(userId, file) {
  await ensureBucket();
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const objectPath = `${userId}/${Date.now()}${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype || 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function saveToDisk(userId, file) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const filename = `user-${userId}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}

function shouldRedirectMissingUpload(req) {
  const host = (req.get('host') || '').toLowerCase();
  try {
    return new URL(PUBLIC_BASE_URL).host.toLowerCase() !== host;
  } catch {
    return false;
  }
}

function missingUploadRedirectUrl(req) {
  return `${PUBLIC_BASE_URL}${req.originalUrl}`;
}

module.exports = {
  uploadProfilePhoto,
  saveToDisk,
  shouldRedirectMissingUpload,
  missingUploadRedirectUrl,
  PUBLIC_BASE_URL,
};
