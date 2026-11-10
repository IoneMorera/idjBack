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
router.get('/', controller.listTemplates);
router.post('/', controller.createTemplate);
router.get('/:emailId', controller.getTemplate);
router.put('/:emailId', controller.updateTemplate);
router.patch('/:emailId', controller.updateTrigger);
router.post('/:emailId/preview', controller.preview);
router.post('/:emailId/restore', controller.restoreDefault);
router.post('/:emailId/logo', upload.single('logo'), controller.uploadLogo);
router.delete('/:emailId/logo', controller.resetLogo);
router.post('/:emailId/send', controller.sendTemplate);
router.delete('/:emailId', controller.deleteTemplate);

module.exports = router;
