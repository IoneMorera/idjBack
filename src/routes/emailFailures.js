const express = require('express');
const router = express.Router();
const controller = require('../controllers/emailFailureController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware, adminMiddleware);
router.get('/', controller.listFailures);
router.post('/resolve-all', controller.resolveAll);
router.post('/:id/resolve', controller.resolveFailure);

module.exports = router;
