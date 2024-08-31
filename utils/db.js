import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '27017';
    const database = process.env.DB_DATABASE || 'files_manager';

    this.url = `mongodb://${host}:${port}/${database}`;
    this.client = new MongoClient(this.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    this.connect();
  }

  async connect() {
    try {
      await this.client.connect();
      this.db = this.client.db(); // Store the database reference
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('Failed to connect to MongoDB', error);
      this.db = null; // Set db to null if connection fails
    }
  }

  isAlive() {
    return this.db !== null;
  }

  async nbUsers() {
    if (this.isAlive()) {
      try {
        return await this.db.collection('users').countDocuments();
      } catch (error) {
        console.error('Error counting documents in users collection', error);
        return 0;
      }
    } else {
      console.error('Database not connected');
      return 0;
    }
  }

  async nbFiles() {
    if (this.isAlive()) {
      try {
        return await this.db.collection('files').countDocuments();
      } catch (error) {
        console.error('Error counting documents in files collection', error);
        return 0;
      }
    } else {
      console.error('Database not connected');
      return 0;
    }
  }
}

export const dbClient = new DBClient();
export default dbClient;
