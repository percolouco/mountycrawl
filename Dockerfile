FROM node:24-alpine
WORKDIR /app
COPY index.html admin.html server.js mp.js db.js ./
COPY css ./css
COPY js ./js
COPY img ./img
EXPOSE 80
CMD ["node", "server.js"]
