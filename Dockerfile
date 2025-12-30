FROM ubuntu:24.10

RUN apt-get update && apt-get install -y \
    curl \
    git \
    nodejs \
    npm \
    python3 \
    python3-pip \
    gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g vercel

WORKDIR /app

COPY . /app

CMD ["bash"]
