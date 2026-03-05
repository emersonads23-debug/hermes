FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

RUN mkdir -p uploads logs && chown -R node:node uploads logs

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
