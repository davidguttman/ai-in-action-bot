FROM node:lts-alpine AS base
WORKDIR /usr/src/app

# Install dependencies
# Use package-lock.json for deterministic installs
COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Run the build script (deploys Discord commands)
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE ${PORT}

CMD [ "node", "index.js" ] 