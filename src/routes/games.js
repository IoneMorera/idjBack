const express = require('express');
const router = express.Router({ mergeParams: true });
const gameController = require('../controllers/gameController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.patch('/enabled', authMiddleware, adminMiddleware, gameController.setEnabled);
router.get('/', authMiddleware, gameController.getBoard);
router.post('/collection/sync', authMiddleware, gameController.syncCollection);
router.get('/search', authMiddleware, gameController.search);
router.post('/', authMiddleware, gameController.addGame);
router.post('/requests', authMiddleware, gameController.addRequest);
router.delete('/requests/:requestId', authMiddleware, gameController.removeRequest);
router.delete('/:gameId', authMiddleware, gameController.removeGame);

module.exports = router;
