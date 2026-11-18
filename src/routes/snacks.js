const express = require('express');
const router = express.Router({ mergeParams: true });
const snackController = require('../controllers/snackController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.patch('/enabled', authMiddleware, adminMiddleware, snackController.setEnabled);
router.get('/options', authMiddleware, adminMiddleware, snackController.getOptions);
router.post('/options', authMiddleware, adminMiddleware, snackController.createOption);
router.put('/options/:optionId', authMiddleware, adminMiddleware, snackController.updateOption);
router.delete('/options/:optionId', authMiddleware, adminMiddleware, snackController.deleteOption);
router.get('/summary', authMiddleware, adminMiddleware, snackController.getAdminSummary);
router.get('/mine', authMiddleware, snackController.getMine);
router.put('/mine', authMiddleware, snackController.saveMine);
router.post('/requests', authMiddleware, snackController.addRequest);
router.delete('/requests/:requestId', authMiddleware, snackController.deleteRequest);

module.exports = router;
