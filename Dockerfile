FROM nginx:alpine

# 1. Copy all static viewer assets to the default Nginx root
COPY . /usr/share/nginx/html

# Remove Docker, Git configuration and metadata files from the public web root
RUN rm -f /usr/share/nginx/html/Dockerfile \
         /usr/share/nginx/html/nginx.conf \
         /usr/share/nginx/html/entrypoint.sh \
         /usr/share/nginx/html/.dockerignore \
         /usr/share/nginx/html/.gitignore

# 2. Copy the customized Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# 3. Setup the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 4. Create directory for volume mounts
RUN mkdir -p /var/www

# Expose standard HTTP port
EXPOSE 80

# Run entrypoint script on boot
ENTRYPOINT ["/entrypoint.sh"]
