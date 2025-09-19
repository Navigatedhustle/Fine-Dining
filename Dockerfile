# Serve the static site with NGINX
FROM nginx:alpine

# Remove the default NGINX welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy your single-page app as index.html
COPY index.html /usr/share/nginx/html/index.html

# Optional: set long cache headers off for now (dev-friendly)
# You can add a custom nginx.conf later if you want caching/compression tweaks.

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
