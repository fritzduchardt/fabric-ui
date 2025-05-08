
FROM nginx:alpine

# Define working directory inside container
WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Remove default Nginx configuration to ensure no default configs remain
RUN rm -f /etc/nginx/nginx.conf \
  && rm -rf /etc/nginx/conf.d

# Copy images from build context to Nginx html/images folder
COPY images ./usr/share/nginx/html/images

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
