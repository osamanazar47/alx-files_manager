/* eslint-disable import/no-named-as-default */
/* eslint-disable no-unused-vars */
import { tmpdir } from 'os';
import { promisify } from 'util';
import Queue from 'bull/lib/queue';
import { v4 as uuidv4 } from 'uuid';
import {
  mkdir, writeFile, stat, existsSync, realpath,
} from 'fs';
import { join as joinPath } from 'path';
import { Request, Response } from 'express';
import { contentType } from 'mime-types';
import mongoDBCore from 'mongodb/lib/core';
import dbClient from '../utils/db';
import { getUserFromXToken } from '../utils/auth';

const VALID_FILE_TYPES = {
  folder: 'folder',
  file: 'file',
  image: 'image',
};
const ROOT_FOLDER_ID = 0;
const DEFAULT_ROOT_FOLDER = 'files_manager';
const mkDirAsync = promisify(mkdir);
const writeFileAsync = promisify(writeFile);
const statAsync = promisify(stat);
const realpathAsync = promisify(realpath);
const MAX_FILES_PER_PAGE = 20;
const fileQueue = new Queue('thumbnail generation');
const NULL_ID = Buffer.alloc(24, '0').toString('utf-8');

/**
 * Utility function to validate a MongoDB ObjectId string.
 * @param {string} id - The ID to validate.
 * @returns {boolean} - True if the ID is valid, otherwise false.
 */
const isValidId = (id) => {
  const size = 24;
  let i = 0;
  const charRanges = [
    [48, 57], // 0 - 9
    [97, 102], // a - f
    [65, 70], // A - F
  ];
  if (typeof id !== 'string' || id.length !== size) {
    return false;
  }
  while (i < size) {
    const c = id[i];
    const code = c.charCodeAt(0);

    if (!charRanges.some((range) => code >= range[0] && code <= range[1])) {
      return false;
    }
    i += 1;
  }
  return true;
};

/**
 * Controller class for handling file-related operations in the Files Manager API.
 */
export default class FilesController {
  /**
   * Uploads a new file or creates a new folder.
   * - Validates input parameters including name, type, and parentId.
   * - If type is 'file' or 'image', the file data is saved to disk.
   * - If type is 'image', a thumbnail generation job is queued.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async postUpload(req, res) {
    const { user } = req;
    const name = req.body ? req.body.name : null;
    const type = req.body ? req.body.type : null;
    const parentId = req.body && req.body.parentId ? req.body.parentId : ROOT_FOLDER_ID;
    const isPublic = req.body && req.body.isPublic ? req.body.isPublic : false;
    const base64Data = req.body && req.body.data ? req.body.data : '';

    if (!name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!type || !Object.values(VALID_FILE_TYPES).includes(type)) {
      res.status(400).json({ error: 'Missing type' });
      return;
    }
    if (!req.body.data && type !== VALID_FILE_TYPES.folder) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    if ((parentId !== ROOT_FOLDER_ID) && (parentId !== ROOT_FOLDER_ID.toString())) {
      const file = await (await dbClient.filesCollection())
        .findOne({
          _id: new mongoDBCore.BSON.ObjectId(isValidId(parentId) ? parentId : NULL_ID),
        });

      if (!file) {
        res.status(400).json({ error: 'Parent not found' });
        return;
      }
      if (file.type !== VALID_FILE_TYPES.folder) {
        res.status(400).json({ error: 'Parent is not a folder' });
        return;
      }
    }
    const userId = user._id.toString();
    const baseDir = `${process.env.FOLDER_PATH || ''}`.trim().length > 0
      ? process.env.FOLDER_PATH.trim()
      : joinPath(tmpdir(), DEFAULT_ROOT_FOLDER);

    const newFile = {
      userId: new mongoDBCore.BSON.ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: (parentId === ROOT_FOLDER_ID) || (parentId === ROOT_FOLDER_ID.toString())
        ? '0'
        : new mongoDBCore.BSON.ObjectId(parentId),
    };
    await mkDirAsync(baseDir, { recursive: true });
    if (type !== VALID_FILE_TYPES.folder) {
      const localPath = joinPath(baseDir, uuidv4());
      await writeFileAsync(localPath, Buffer.from(base64Data, 'base64'));
      newFile.localPath = localPath;
    }
    const insertionInfo = await (await dbClient.filesCollection())
      .insertOne(newFile);
    const fileId = insertionInfo.insertedId.toString();

    if (type === VALID_FILE_TYPES.image) {
      const jobName = `Image thumbnail [${userId}-${fileId}]`;
      fileQueue.add({ userId, fileId, name: jobName });
    }
    res.status(201).json({
      id: fileId,
      userId,
      name,
      type,
      isPublic,
      parentId: (parentId === ROOT_FOLDER_ID) || (parentId === ROOT_FOLDER_ID.toString())
        ? 0
        : parentId,
    });
  }

  /**
   * Retrieves a specific file's metadata based on its ID.
   * - Validates the provided ID and checks if the file exists and is linked to the auth user.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async getShow(req, res) {
    const { user } = req;
    const id = req.params ? req.params.id : NULL_ID;
    const userId = user._id.toString();
    const file = await (await dbClient.filesCollection())
      .findOne({
        _id: new mongoDBCore.BSON.ObjectId(isValidId(id) ? id : NULL_ID),
        userId: new mongoDBCore.BSON.ObjectId(isValidId(userId) ? userId : NULL_ID),
      });

    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({
      id,
      userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === ROOT_FOLDER_ID.toString()
        ? 0
        : file.parentId.toString(),
    });
  }

  /**
   * Retrieves a list of files belonging to the authenticated user.
   * - Supports pagination and filtering by parentId.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async getIndex(req, res) {
    const { user } = req;
    const parentId = req.query.parentId || ROOT_FOLDER_ID.toString();
    const page = /\d+/.test((req.query.page || '').toString())
      ? Number.parseInt(req.query.page, 10)
      : 0;
    const filesFilter = {
      userId: user._id,
      parentId: parentId === ROOT_FOLDER_ID.toString()
        ? parentId
        : new mongoDBCore.BSON.ObjectId(isValidId(parentId) ? parentId : NULL_ID),
    };

    const files = await (await (await dbClient.filesCollection())
      .aggregate([
        { $match: filesFilter },
        { $sort: { _id: -1 } },
        { $skip: page * MAX_FILES_PER_PAGE },
        { $limit: MAX_FILES_PER_PAGE },
        {
          $project: {
            _id: 0,
            id: '$_id',
            userId: '$userId',
            name: '$name',
            type: '$type',
            isPublic: '$isPublic',
            parentId: {
              $cond: { if: { $eq: ['$parentId', '0'] }, then: 0, else: '$parentId' },
            },
          },
        },
      ])).toArray();
    res.status(200).json(files);
  }

  /**
   * Publishes a private file by making it publicly accessible.
   * - Validates the file's existence and ownership before publishing.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async putPublish(req, res) {
    const { user } = req;
    const { id } = req.params;
    const userId = user._id.toString();
    const fileFilter = {
      _id: new mongoDBCore.BSON.ObjectId(isValidId(id) ? id : NULL_ID),
      userId: new mongoDBCore.BSON.ObjectId(isValidId(userId) ? userId : NULL_ID),
    };
    const file = await (await dbClient.filesCollection())
      .findOne(fileFilter);

    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (file.isPublic) {
      res.status(200).json(file);
      return;
    }
    await (await dbClient.filesCollection())
      .updateOne(fileFilter, { $set: { isPublic: true } });
    file.isPublic = true;
    res.status(200).json({
      id: file._id.toString(),
      userId,
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId === ROOT_FOLDER_ID.toString()
        ? 0
        : file.parentId.toString(),
    });
  }

  /**
   * Unpublishes a file by making it private.
   * - Validates the file's existence and ownership before unpublishing.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async putUnpublish(req, res) {
    const { user } = req;
    const { id } = req.params;
    const userId = user._id.toString();
    const fileFilter = {
      _id: new mongoDBCore.BSON.ObjectId(isValidId(id) ? id : NULL_ID),
      userId: new mongoDBCore.BSON.ObjectId(isValidId(userId) ? userId : NULL_ID),
    };
    const file = await (await dbClient.filesCollection())
      .findOne(fileFilter);

    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!file.isPublic) {
      res.status(200).json(file);
      return;
    }
    await (await dbClient.filesCollection())
      .updateOne(fileFilter, { $set: { isPublic: false } });
    file.isPublic = false;
    res.status(200).json({
      id: file._id.toString(),
      userId,
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId === ROOT_FOLDER_ID.toString()
        ? 0
        : file.parentId.toString(),
    });
  }

  /**
   * Retrieves the content of a file.
   * - Validates the file's existence and permissions before returning the file content.
   * @param {Request} req The Express request object.
   * @param {Response} res The Express response object.
   * @returns {void}
   */
  static async getFile(req, res) {
    const { user } = req;
    const id = req.params ? req.params.id : NULL_ID;
    const userId = user._id ? user._id.toString() : '';
    const size = req.query.size || null;

    const file = await (await dbClient.filesCollection())
      .findOne({
        _id: new mongoDBCore.BSON.ObjectId(isValidId(id) ? id : NULL_ID),
      });

    if (!file) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const {
      isPublic,
      localPath,
      name,
      type,
    } = file;

    if (!isPublic && (file.userId.toString() !== userId)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (type === VALID_FILE_TYPES.folder) {
      res.status(400).json({ error: 'A folder doesn\'t have content' });
      return;
    }
    if (!existsSync(localPath)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (type === VALID_FILE_TYPES.image && size) {
      const width = /\d+/.test(size.toString()) ? Number.parseInt(size, 10) : 0;

      if (width > 0) {
        const fileNameParts = name.split('.');
        fileNameParts[fileNameParts.length - 2] = `${fileNameParts[fileNameParts.length - 2]}_${width}`;
        const newFilePath = `${fileNameParts.join('.')}`;

        try {
          const realFilePath = await realpathAsync(`${localPath}_${width}`);
          res.setHeader('Content-Type', contentType(name) || 'text/plain');
          res.status(200).sendFile(realFilePath);
          return;
        } catch (err) {
          // Do nothing about this error
        }
      }
    }
    res.setHeader('Content-Type', contentType(name) || 'text/plain');
    res.status(200).sendFile(localPath);
  }
}
