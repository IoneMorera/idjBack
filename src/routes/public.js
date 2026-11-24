const express = require('express');
const router = express.Router();
const publicPageController = require('../controllers/publicPageController');

router.get('/pages/:slug', publicPageController.getPublishedPage);

module.exports = router;
