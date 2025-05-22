
FROM nginx:alpine

# Define working directory inside container
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Remove default Nginx configuration to ensure no default configs remain
RUN rm -f /etc/nginx/nginx.conf \
  && rm -rf /etc/nginx/conf.d

# Copy favicon.ico directly under webroot
COPY assets/favicon.ico /usr/share/nginx/html/favicon.ico

# Copy icon-192.png under /icons
COPY assets/icon-192.png /usr/share/nginx/html/icons/icon-192.png
COPY assets/icon-512.png /usr/share/nginx/html/icons/icon-512.png

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
