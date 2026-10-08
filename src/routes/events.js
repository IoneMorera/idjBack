const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, eventController.getAllEvents);
router.get('/:id', authMiddleware, eventController.getEventById);
router.post('/', authMiddleware, adminMiddleware, eventController.createEvent);
router.delete('/:id', authMiddleware, adminMiddleware, eventController.deleteEvent);

module.exports = router;
