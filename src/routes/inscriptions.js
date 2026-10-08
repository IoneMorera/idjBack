const express = require('express');
const router = express.Router();
const inscriptionController = require('../controllers/inscriptionController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/states', authMiddleware, inscriptionController.getInscriptionStates);
router.get('/event/:eventId/mine', authMiddleware, inscriptionController.getMyInscription);
router.post('/event/:eventId', authMiddleware, inscriptionController.createInscription);

// Admin
router.get('/', authMiddleware, adminMiddleware, inscriptionController.getAllInscriptions);
router.patch('/:id/state', authMiddleware, adminMiddleware, inscriptionController.updateInscriptionState);

module.exports = router;
