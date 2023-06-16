FROM node:12.16.1-alpine

WORKDIR /myapp
ENV NODE_ENV production
ADD package.json /myapp/
ADD package-lock.json /myapp/
ADD app.js /myapp/
RUN apk update
RUN apk add busybox-extras
RUN apk add iputils
RUN npm install
COPY . .
EXPOSE 3012
EXPOSE 3012
CMD ["node", "app.js"]
