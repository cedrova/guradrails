FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src/dashboard/ ./src/dashboard/

ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "src/dashboard/server.js"]
