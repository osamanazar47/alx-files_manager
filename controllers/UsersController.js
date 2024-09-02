/* eslint-disable import/no-named-as-default */
import sha1 from 'sha1';
import dbClient from '../utils/db';

export default class UsersCotroller {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }
    try {
      const existUser = await (await dbClient.usersCollection()).findOne({ email });
      if (existUser) {
        res.status(400).json({ error: 'Already exists' });
      }

      const hashedPassword = sha1(password);

      const result = await dbClient.usersCollection().insertOne({
        email,
        password: hashedPassword,
      });

      const newUser = {
        id: result.insertedId,
        email,
      };

      return res.status(201).json(newUser);
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(400).json({ error: 'Internal Server Error' });
    }
  }
}
