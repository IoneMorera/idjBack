const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const publicPageController = require('../controllers/publicPageController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
  },
});

router.use(authMiddleware, adminMiddleware);

router.get('/', publicPageController.listPages);
router.post('/', publicPageController.createPage);
router.post('/images', imageUpload.single('image'), publicPageController.uploadImage);
router.get('/:id', publicPageController.getPage);
router.put('/:id', publicPageController.updatePage);
router.delete('/:id', publicPageController.deletePage);

module.exports = router;
