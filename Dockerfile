FROM nginx:alpine

# Define working directory inside container
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Copy application files into the Nginx html directory
COPY index.html .
COPY app.js .

# Expose port 80 for HTTP traffic
EXPOSE 80

ENV API_DOMAIN=http://localhost

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
