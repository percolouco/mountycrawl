FROM node:22-alpine
WORKDIR /app
COPY index.html server.js ./
COPY css ./css
COPY js ./js
COPY img ./img
EXPOSE 80
CMD ["node", "server.js"]
