const express = require('express');
const router = express.Router();
const siteController = require('../controllers/siteController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/header', authMiddleware, adminMiddleware, siteController.getHeader);
router.put('/header', authMiddleware, adminMiddleware, siteController.saveHeader);

module.exports = router;
