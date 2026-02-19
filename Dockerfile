# 1. Base image (LTS recommended)
FROM node:20-slim

# 2. Set working directory inside the container
WORKDIR /app

# 3. Copy package files first (enables Docker layer caching)
COPY package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the full source code
COPY . .

# 6. Environment variables with defaults
ENV PORT=3004
ENV PASSWORD=ROZSA

# 7. Expose the port
EXPOSE ${PORT}

# 8. Start the application
CMD ["npm", "start"]
