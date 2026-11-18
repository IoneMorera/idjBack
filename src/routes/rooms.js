const express = require('express');
const router = express.Router({ mergeParams: true });
const roomController = require('../controllers/roomController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware, adminMiddleware);
router.get('/', roomController.getRooms);
router.post('/', roomController.createRoom);
router.patch('/:roomId', roomController.updateRoom);
router.delete('/:roomId', roomController.deleteRoom);
router.put('/:roomId/slots', roomController.assignSlot);

module.exports = router;
