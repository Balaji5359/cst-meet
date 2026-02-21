# ---------- Build Stage ----------
FROM node:18-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---------- Production Stage ----------
FROM nginx:alpine

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Create script to generate runtime config from ECS environment variables
RUN cat > /docker-entrypoint.d/10-generate-config.sh << 'EOF'
#!/bin/sh
set -e

echo "Generating runtime config..."
cat > /usr/share/nginx/html/config.js << EOL
window.RUNTIME_CONFIG = {
  VITE_COGNITO_AUTHORITY: "${VITE_COGNITO_AUTHORITY}",
  VITE_COGNITO_CLIENT_ID: "${VITE_COGNITO_CLIENT_ID}",
  VITE_COGNITO_REDIRECT_URI: "${VITE_COGNITO_REDIRECT_URI}",
  VITE_COGNITO_SCOPE: "${VITE_COGNITO_SCOPE}",
  VITE_COGNITO_DOMAIN: "${VITE_COGNITO_DOMAIN}",
  VITE_COGNITO_LOGOUT_URI: "${VITE_COGNITO_LOGOUT_URI}"
};
EOL

echo "Runtime config generated successfully"
EOF

RUN chmod +x /docker-entrypoint.d/10-generate-config.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
