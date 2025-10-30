FROM nginx:alpine-otel

WORKDIR /usr/share/nginx/html

# Remove default Nginx static assets
RUN rm -rf ./*

# Remove default Nginx configuration to ensure no default configs remain
RUN rm -f /etc/nginx/nginx.conf \
  && rm -rf /etc/nginx/conf.d

# Copy entire assets directory
COPY assets /usr/share/nginx/html/assets

# Move favicon to webroot and move all other asset directories under icons
RUN mv assets/favicon.ico . \
  && mkdir -p icons \
  && mv assets/* icons/ \
  && rm -rf assets

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
