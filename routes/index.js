import express from 'express';
import AppController from '../controllers/AppController';
import UsersCotroller from '../controllers/UsersController';

const router = express.Router();

router.get('/status', AppController.getStatus);

router.get('/stats', AppController.getStats);

router.post('/users', UsersCotroller.postNew);

export default router;
