FROM node:18-bullseye

WORKDIR /usr/src/app

# Install Python and the Airbus Cybersecurity ETL Parser
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install etl-parser

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 5000
CMD ["npm", "start"]
