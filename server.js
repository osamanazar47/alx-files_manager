import express from 'express';
import userRoutes from './routes/index';

const app = express();

app.use(express.json());

app.use('/', userRoutes);

// Start the server and listen on the specified port or default to 5000
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
