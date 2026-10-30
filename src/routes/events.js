const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const foodController = require('../controllers/foodController');
const tariffController = require('../controllers/tariffController');
const foodRoutes = require('./food');
const tariffRoutes = require('./tariffs');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, eventController.getAllEvents);
router.patch('/:id/food-ordering', authMiddleware, adminMiddleware, foodController.setFoodOrderingEnabled);
router.patch('/:id/hotel-food', authMiddleware, adminMiddleware, tariffController.setHotelFoodEnabled);
router.use('/:eventId/food', foodRoutes);
router.use('/:eventId/tariffs', tariffRoutes);
router.get('/:id', authMiddleware, eventController.getEventById);
router.post('/', authMiddleware, adminMiddleware, eventController.createEvent);
router.delete('/:id', authMiddleware, adminMiddleware, eventController.deleteEvent);

module.exports = router;
