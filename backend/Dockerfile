FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (better caching)
COPY package*.json ./

# Install only production deps
RUN npm install --omit=dev

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 4000

# Run migrations + start app
CMD ["sh", "-c", "node scripts/migrate.js && node src/server.js"]