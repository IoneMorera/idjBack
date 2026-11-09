const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/emailTemplateController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname || '').toLowerCase());
    const mime = allowed.test(file.mimetype || '');
    if (ext && mime) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
  },
});

router.use(authMiddleware, adminMiddleware);
router.get('/', controller.getTemplate);
router.put('/', controller.updateTemplate);
router.post('/preview', controller.preview);
router.post('/restore', controller.restoreDefault);
router.post('/logo', upload.single('logo'), controller.uploadLogo);
router.delete('/logo', controller.resetLogo);

module.exports = router;
