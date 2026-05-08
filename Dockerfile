FROM node:18-bullseye

WORKDIR /usr/src/app

# Install Python, pip, and dos2unix (the tool to scrub Windows formatting)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip dos2unix && \
    pip3 install etl-parser && \
    find /usr/local/bin -name "etl2pcap" -exec dos2unix {} +

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 5000
CMD ["npm", "start"]
