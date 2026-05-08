FROM node:18-bullseye

# Install Wine and 32-bit libraries required for etl2pcapng
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends wine wine32 wine64 libwine fonts-wine

WORKDIR /usr/src/app

ENV WINEDEBUG=-all
ENV WINEPREFIX=/tmp/wine

COPY package*.json ./
RUN npm install

COPY . .

# THIS IS THE MAGIC LINE: It gives the server permission to execute the tool
RUN chmod +x etl2pcapng.exe && mkdir -p uploads && chmod 777 uploads

EXPOSE 5000
CMD ["npm", "start"]
