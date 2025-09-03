FROM node:20-alpine
WORKDIR /app
COPY ../../package.json ../../tsconfig.base.json ./
COPY ../core/package.json ../db/package.json ./packages/
RUN npm i
COPY ../core ./packages/core
COPY ../db ./packages/db
RUN npm -w packages/core run build && npm -w packages/db run build
COPY ./package.json ./packages/worker/package.json
COPY ./tsconfig.json ./packages/worker/tsconfig.json
COPY ./src ./packages/worker/src
RUN npm -w packages/worker run build
CMD ["node", "packages/worker/dist/index.js"]
