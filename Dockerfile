FROM nginx:alpine
# Define working directory inside container
WORKDIR /usr/share/nginx/html
# Remove default Nginx static assets
RUN rm -rf ./*
# Copy custom Nginx configuration that returns 404 for missing files instead of index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Expose port 80 for HTTP traffic
EXPOSE 80
# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
