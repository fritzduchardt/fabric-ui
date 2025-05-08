FROM node:alpine
# Use lightweight Node.js image
WORKDIR /usr/src/app
# Install http-server globally to serve static files
RUN npm install -g http-server
# Expose port 80 for HTTP traffic
EXPOSE 80
# Start http-server on all interfaces at port 80
CMD ["http-server", ".", "-p", "80", "-a", "0.0.0.0"]
