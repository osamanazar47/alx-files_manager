# Files Manager

**Files Manager** is a robust file management API built with Express, MongoDB, Redis, Bull, and Node.js. This API provides efficient file handling capabilities with features for background processing and email notifications.

## Requirements

### Applications
- **Node.js**: Ensure you have Node.js installed.
- **Yarn**: Use Yarn as the package manager for this project.

### APIs
- **Google API**: Create a Google API with at least an email sending scope. Ensure the redirect URI (e.g., `http://localhost:5000/`) is listed in your API credentials. Save the `credentials.json` file in the root directory of this project.

## Environment Variables

Store your environment variables in a `.env` file in the root directory. The format for each line should be `NAME=VALUE`. Here are the required and optional environment variables:

| Name                | Required              | Description                                               |
|---------------------|------------------------|-----------------------------------------------------------|
| `GOOGLE_MAIL_SENDER`| Yes                    | The email address used for sending emails to users.       |
| `PORT`              | No (Default: 5000)     | Port the server should listen on.                        |
| `DB_HOST`           | No (Default: localhost)| Database host address.                                  |
| `DB_PORT`           | No (Default: 27017)    | Database port number.                                    |
| `DB_DATABASE`       | No (Default: files_manager) | Name of the database.                                    |
| `FOLDER_PATH`       | No (Default: /tmp/files_manager (Linux, Mac OS X) & %TEMP%/files_manager (Windows)) | Local folder path for storing files. |

## Installation

1. Clone this repository:
    ```bash
    git clone https://github.com/yourusername/files-manager.git
    cd files-manager
    ```

2. Install dependencies:
    ```bash
    yarn install
    # or
    npm install
    ```

## Usage

1. Start Redis and MongoDB services on your system.

2. Start the server:
    ```bash
    yarn start-server
    # or
    npm run start-server
    ```

## Testing

1. Create a separate `.env.test` file with the required environment variables for testing.

2. Run the E2E tests:
    ```bash
    yarn test
    # or
    npm run test
    ```

## Documentation

- **API Documentation**: Generate OpenAPI documentation with `apidoc`. 

## Resources

- [Node.js Getting Started](https://nodejs.org/en/docs/)
- [Express Getting Started](https://expressjs.com/en/starter/installing.html)
- [Mocha Documentation](https://mochajs.org/)
- [Nodemon Documentation](https://nodemon.io/)
- [MongoDB](https://www.mongodb.com/)
- [Bull Queue](https://optimalbits.github.io/bull/)
- [Image Thumbnail](https://www.npmjs.com/package/image-thumbnail)
- [Mime Types](https://www.npmjs.com/package/mime-types)
- [Redis](https://redis.io/)

## About

**Files Manager** is designed to provide an efficient file management solution. It integrates several technologies to deliver a seamless experience for managing and processing files.