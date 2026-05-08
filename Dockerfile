FROM node:18-bullseye

WORKDIR /usr/src/app

# Install Python and download the raw binary carver script
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 wget dos2unix && \
    wget https://raw.githubusercontent.com/aaptel/etl2pcap/master/etl2pcap.py -O etl2pcap.py && \
    dos2unix etl2pcap.py && \
    chmod +x etl2pcap.py

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 5000
CMD ["npm", "start"]
