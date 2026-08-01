FROM node:22-alpine
WORKDIR /app
COPY worker/package.json ./
RUN npm install
COPY worker/index.js ./worker/
CMD ["node", "worker/index.js"]
