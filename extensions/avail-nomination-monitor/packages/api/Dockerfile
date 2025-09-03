FROM node:20-alpine
WORKDIR /app
COPY ../../package.json ../../tsconfig.base.json ./
COPY ../core/package.json ../db/package.json ./packages/
RUN npm i
COPY ../core ./packages/core
COPY ../db ./packages/db
RUN npm -w packages/core run build && npm -w packages/db run build
COPY ./package.json ./packages/api/package.json
COPY ./tsconfig.json ./packages/api/tsconfig.json
COPY ./src ./packages/api/src
RUN npm -w packages/api run build
EXPOSE 3000
CMD ["node", "packages/api/dist/index.js"]
