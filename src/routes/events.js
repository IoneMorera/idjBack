const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const eventController = require('../controllers/eventController');
const foodController = require('../controllers/foodController');
const tariffController = require('../controllers/tariffController');
const foodRoutes = require('./food');
const tariffRoutes = require('./tariffs');
const emailTemplateRoutes = require('./emailTemplate');
const roomRoutes = require('./rooms');
const gameRoutes = require('./games');
const snackRoutes = require('./snacks');
const manualFoodRoutes = require('./manualFood');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const publicPageController = require('../controllers/publicPageController');

const logoUpload = multer({
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

router.get('/', authMiddleware, eventController.getAllEvents);
router.get('/food-orders/mine', authMiddleware, foodController.getMyOrdersHistory);
router.patch('/:id/food-ordering', authMiddleware, adminMiddleware, foodController.setFoodOrderingEnabled);
router.patch('/:id/hotel-food', authMiddleware, adminMiddleware, tariffController.setHotelFoodEnabled);
router.post('/:id/logo', authMiddleware, adminMiddleware, logoUpload.single('logo'), eventController.uploadLogo);
router.use('/:eventId/food', foodRoutes);
router.use('/:eventId/rooms', roomRoutes);
router.use('/:eventId/games', gameRoutes);
router.use('/:eventId/snacks', snackRoutes);
router.use('/:eventId/manual-food', manualFoodRoutes);
router.use('/:eventId/tariffs', tariffRoutes);
router.use('/:eventId/emails', emailTemplateRoutes);
router.get('/:id/public-page', authMiddleware, adminMiddleware, publicPageController.getPage);
router.put('/:id/public-page', authMiddleware, adminMiddleware, publicPageController.savePage);
router.get('/:id', authMiddleware, eventController.getEventById);
router.post('/', authMiddleware, adminMiddleware, eventController.createEvent);
router.patch('/:id', authMiddleware, adminMiddleware, eventController.updateEventSettings);
router.delete('/:id', authMiddleware, adminMiddleware, eventController.deleteEvent);

module.exports = router;
