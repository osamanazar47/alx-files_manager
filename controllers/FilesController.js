/* eslint-disable import/no-named-as-default */
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

export default class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await (await dbClient.usersCollection()).findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const acceptedTypes = ['folder', 'file', 'image'];
    // eslint-disable-next-line object-curly-newline
    const { name, type, parentId = '0', isPublic = false, data } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!type || !acceptedTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (parentId !== '0') {
      const parentFile = await (await dbClient.filesCollection())
        .findOne({ _id: new ObjectId(parentId) });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const newFile = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === '0' ? '0' : new ObjectId(parentId),
    };

    if (type === 'folder') {
      const result = await (await dbClient.filesCollection()).insertOne(newFile);
      return res.status(201).json({ id: result.insertedId, ...newFile });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const fileUUID = uuidv4();
    const filePath = path.join(folderPath, fileUUID);
    const fileData = Buffer.from(data, 'base64');

    try {
      fs.writeFileSync(filePath, fileData);
    } catch (err) {
      return res.status(500).json({ error: 'Could not save the file' });
    }

    newFile.localPath = filePath;

    try {
      const result = await (await dbClient.filesCollection()).insertOne(newFile);
      return res.status(201).json({ id: result.insertedId, ...newFile });
    } catch (err) {
      return res.status(500).json({ error: 'Could not save file to the database' });
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await (await dbClient.filesCollection()).findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || '0';
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = 20;
    const skip = page * pageSize;

    const query = {
      userId: new ObjectId(userId),
      parentId: parentId === '0' ? '0' : new ObjectId(parentId),
    };

    const files = await (await dbClient.filesCollection())
      .find(query)
      .skip(skip)
      .limit(pageSize)
      .toArray();

    return res.status(200).json(files);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await (await dbClient.filesCollection()).findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    try {
      await (await dbClient.filesCollection()).updateOne(
        { _id: new ObjectId(fileId) },
        { $set: { isPublic: true } },
      );
      return res.status(200).json({ ...file, isPublic: true });
    } catch (err) {
      return res.status(500).json({ error: 'Could not update file' });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await (await dbClient.filesCollection()).findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    try {
      await (await dbClient.filesCollection()).updateOne(
        { _id: new ObjectId(fileId) },
        { $set: { isPublic: false } },
      );
      return res.status(200).json({ ...file, isPublic: false });
    } catch (err) {
      return res.status(500).json({ error: 'Could not update file' });
    }
  }

  static async getFile(req, res) {
    const token = req.headers['x-token'];
    const userId = token ? await redisClient.get(`auth_${token}`) : null;

    const fileId = req.params.id;
    const file = await (await dbClient.filesCollection()).findOne({
      _id: new ObjectId(fileId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (file.isPublic === false) {
      if (!userId || file.userId.toString() !== userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name);
    res.setHeader('Content-Type', mimeType);
    const fileContent = fs.readFileSync(file.localPath);
    return res.status(200).send(fileContent);
  }
}
