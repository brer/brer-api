# brer-api

Main API web server for Brer project.

## Setup

### Dependencies

- [Node.js](https://nodejs.org/) v20.6.0 or later
- [CouchDB](https://couchdb.apache.org/) v3.x.x
- A Kubernetes cluster ([minikube](https://minikube.sigs.k8s.io/docs/) is ok)

### Envs

Create a `.env` file with the following envs:

| Name                | Description
| ------------------- | -------------------
| NODE_ENV            | Must be `"production"` for non-toy envs.
| SERVER_HOST         | Listening host. Defaults to `127.0.0.1`.
| SERVER_PORT         | Server's post. Defaults to `3000`.
| LOG_LEVEL           | [Pino](https://github.com/pinojs/pino) log level. Defaults to `debug`.
| LOG_FILE            | Logs filepath. Optional.
| LOG_PRETTY          | Set to `"enable"` to pretty-print stdout logs.
| COUCHDB_URL         | CouchDB URL. Defaults to `http://127.0.0.1:5984/`.
| COUCHDB_USERNAME    |
| COUCHDB_PASSWORD    |
| JWT_SECRET          | Secred used to sign JWT tokens, may be omitted if `JWT_PRIVATE_KEY` is defined.
| JWT_PRIVATE_KEY     | Filepath of a PEM-encoded RSA SHA-256 secret key, may be omitted if `JWT_SECRET` is defined.
| API_PUBLIC_KEY      | Filepath of a PEM-encoded RSA SHA-256 public key.
| INVOKER_PUBLIC_KEY  | Filepath of a PEM-encoded RSA SHA-256 public key.
| COOKIE_NAME         | Defaults to `"brer_session"`.
| COOKIE_DOMAIN       | Cookie's domain attribute.
| COOKIE_SECURE       | Set to `"enable"` for secure cookies.
| ADMIN_PASSWORD      | Set a always-valid `admin` User password.

### Start

Initialize the database:

```
npm run init
```

Start the server:

```
npm start --env .env
```

For development:

```
npm run watch --env .env
```

### Test

Install Docker Engine (the `docker` command) and run:

```
npm test
```

## Acknowledgements

This project is kindly sponsored by [Evologi](https://evologi.it/).
