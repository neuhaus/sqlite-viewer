FROM nginx:alpine

# 1. Copy all static viewer assets to the default Nginx root
COPY . /usr/share/nginx/html

# Remove Docker subdirectory and Git configurations from the public web root for security
RUN rm -rf /usr/share/nginx/html/docker \
           /usr/share/nginx/html/.dockerignore \
           /usr/share/nginx/html/.gitignore

# 2. Copy the customized Nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# 3. Setup the entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 4. Create directory for volume mounts
RUN mkdir -p /var/www

# Expose standard HTTP port
EXPOSE 80

# Run entrypoint script on boot
ENTRYPOINT ["/entrypoint.sh"]
