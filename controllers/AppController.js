import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const getStatus = (req, res) => {
  if (redisClient.isAlive() && dbClient.isAlive()) {
    return res.status(200).json({ "redis": true, "db": true });
  }
  return res.status(500).json({ "redis": false, "db": false }); // Example of handling failure
};

const getStats = (req, res) => {
  return res.status(200).json({ "users": dbClient.nbUsers(), "files": dbClient.nbFiles() });
};

export { getStatus, getStats };
