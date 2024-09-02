import express from 'express';
import { getStatus, getStats } from '../controllers/AppController';

const router = express.Router();

router.get('/status', getStatus);

router.get('/stats', getStats);

export default router;
