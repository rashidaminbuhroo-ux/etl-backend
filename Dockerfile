FROM node:18-bullseye

# Install Wine for Linux to run the Windows .exe
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y wine32 wine64

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads
EXPOSE 5000
CMD ["npm", "start"]
